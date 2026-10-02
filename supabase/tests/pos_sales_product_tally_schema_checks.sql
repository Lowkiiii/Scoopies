-- Read-only structural, privilege, and API-contract checks for schema v7.

do $$
declare
  v_function regprocedure :=
    'public.pos_get_sales_product_tally(uuid,boolean)'::regprocedure;
  v_procedure pg_catalog.pg_proc%rowtype;
  v_arguments text;
  v_result text;
  v_version integer;
  v_name text;
begin
  select procedure.* into strict v_procedure
  from pg_catalog.pg_proc as procedure
  where procedure.oid = v_function;

  if not v_procedure.prosecdef
    or v_procedure.provolatile <> 's'
    or v_procedure.pronargdefaults <> 0
    or not exists (
      select 1
      from unnest(v_procedure.proconfig) as setting
      where setting = 'search_path=""'
    ) then
    raise exception 'Product-tally RPC is not stable, SECURITY DEFINER, default-free, and search-path safe.';
  end if;

  if has_function_privilege('anon', v_function, 'EXECUTE')
    or not has_function_privilege('authenticated', v_function, 'EXECUTE')
    or exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          v_procedure.proacl,
          pg_catalog.acldefault('f', v_procedure.proowner)
        )
      ) as privilege
      where privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ) then
    raise exception 'Product-tally RPC has unsafe PUBLIC/anon/authenticated grants.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'pos_get_sales_product_tally'
  ) <> 1 then
    raise exception 'Product-tally RPC is missing or unexpectedly overloaded.';
  end if;

  select pg_catalog.pg_get_function_arguments(v_function)
    into v_arguments;
  if v_arguments <> 'p_business_id uuid, p_is_training boolean' then
    raise exception 'Product-tally input contract changed: %', v_arguments;
  end if;

  select pg_catalog.pg_get_function_result(v_function)
    into v_result;
  if v_result <> 'TABLE(item_name text, size_label text, order_count bigint, units_sold bigint)'
    or v_result ilike '%cost%'
    or v_result ilike '%centavo%'
    or v_result ilike '%price%' then
    raise exception 'Product-tally output contract is incorrect or leaks financial data: %',
      v_result;
  end if;

  -- The tally extends, rather than replaces, the v6 history APIs.
  if to_regprocedure(
      'public.pos_get_sales_history_page(uuid,boolean,timestamptz,uuid,integer)'
    ) is null
    or to_regprocedure(
      'public.pos_get_sales_history_summary(uuid,boolean)'
    ) is null then
    raise exception 'The existing sales-history APIs changed or disappeared.';
  end if;

  select (metadata.value ->> 'version')::integer,
         metadata.value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata as metadata
  where metadata.key = 'schema_version';

  if v_version is distinct from 7
    or v_name is distinct from 'pos_sales_product_tally' then
    raise exception 'Expected product-tally schema v7, found version %, name %.',
      v_version, v_name;
  end if;
end;
$$;

select 'PASS: POS sales-product tally schema checks' as result;
