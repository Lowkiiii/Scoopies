-- Read-only structural, privilege, and API-contract checks for schema v6.

do $$
declare
  v_function regprocedure;
  v_procedure pg_catalog.pg_proc%rowtype;
  v_result text;
  v_index_definition text;
  v_version integer;
  v_name text;
  v_public_functions regprocedure[] := array[
    'public.pos_get_sales_history_page(uuid,boolean,timestamptz,uuid,integer)'::regprocedure,
    'public.pos_get_sales_history_summary(uuid,boolean)'::regprocedure
  ];
begin
  foreach v_function in array v_public_functions loop
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
      raise exception 'History RPC is not stable, SECURITY DEFINER, default-free, and search-path safe: %',
        v_function::text;
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
      raise exception 'History RPC has unsafe PUBLIC/anon/authenticated grants: %',
        v_function::text;
    end if;
  end loop;

  -- The latest-20 compatibility contract remains present and un-overloaded.
  if (
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'pos_get_recent_sales_v2'
  ) <> 1
    or to_regprocedure(
      'public.pos_get_recent_sales_v2(uuid,boolean,integer)'
    ) is null then
    raise exception 'The existing recent-sales v2 compatibility RPC changed.';
  end if;

  select pg_catalog.pg_get_function_result(
    'public.pos_get_sales_history_page(uuid,boolean,timestamptz,uuid,integer)'::regprocedure
  ) into v_result;
  if v_result not ilike '%sale_id uuid%'
    or v_result not ilike '%completed_at timestamp with time zone%'
    or v_result not ilike '%sale_state text%'
    or v_result not ilike '%gross_total_centavos bigint%'
    or v_result not ilike '%voided_amount_centavos bigint%'
    or v_result not ilike '%net_total_centavos bigint%'
    or v_result not ilike '%estimated_cost_centavos bigint%'
    or v_result not ilike '%estimated_gross_profit_centavos bigint%'
    or v_result not ilike '%can_view_costs boolean%'
    or v_result not ilike '%can_void boolean%'
    or v_result not ilike '%has_more boolean%' then
    raise exception 'Sales-history page result contract is incomplete: %', v_result;
  end if;

  select pg_catalog.pg_get_function_result(
    'public.pos_get_sales_history_summary(uuid,boolean)'::regprocedure
  ) into v_result;
  if v_result not ilike '%first_business_date date%'
    or v_result not ilike '%last_business_date date%'
    or v_result not ilike '%business_timezone text%'
    or v_result not ilike '%is_training boolean%'
    or v_result not ilike '%gross_sale_count bigint%'
    or v_result not ilike '%voided_sale_count bigint%'
    or v_result not ilike '%net_sale_count bigint%'
    or v_result not ilike '%gross_items_sold bigint%'
    or v_result not ilike '%voided_items_sold bigint%'
    or v_result not ilike '%net_items_sold bigint%'
    or v_result not ilike '%gross_sales_centavos bigint%'
    or v_result not ilike '%voided_sales_centavos bigint%'
    or v_result not ilike '%net_sales_centavos bigint%'
    or v_result not ilike '%cash_net_centavos bigint%'
    or v_result not ilike '%gcash_net_centavos bigint%'
    or v_result not ilike '%gotyme_net_centavos bigint%'
    or v_result not ilike '%estimated_cost_centavos bigint%'
    or v_result not ilike '%estimated_gross_profit_centavos bigint%'
    or v_result not ilike '%can_view_costs boolean%' then
    raise exception 'Sales-history summary result contract is incomplete: %', v_result;
  end if;

  select pg_catalog.pg_get_indexdef(indexes.indexrelid)
    into v_index_definition
  from pg_catalog.pg_index as indexes
  where indexes.indexrelid =
    to_regclass('public.pos_sales_history_cursor_idx')
    and indexes.indisvalid
    and indexes.indisready;

  if v_index_definition is null
    or v_index_definition not ilike
      '%(business_id, is_training, completed_at DESC, id DESC)%'
    or v_index_definition not ilike '%WHERE (status = ''completed''::text)%' then
    raise exception 'Sales-history keyset index is missing or malformed: %',
      coalesce(v_index_definition, '<missing>');
  end if;

  select (metadata.value ->> 'version')::integer,
         metadata.value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata as metadata
  where metadata.key = 'schema_version';

  if v_version is distinct from 6
    or v_name is distinct from 'pos_sales_history_pagination' then
    raise exception 'Expected sales-history schema v6, found version %, name %.',
      v_version, v_name;
  end if;
end;
$$;

select 'PASS: POS sales-history pagination schema checks' as result;
