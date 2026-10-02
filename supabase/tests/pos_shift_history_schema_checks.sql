-- Read-only structural, privilege, and API-contract checks for schema v8.

do $$
declare
  v_function regprocedure;
  v_procedure pg_catalog.pg_proc%rowtype;
  v_result text;
  v_index_definition text;
  v_version integer;
  v_name text;
  v_public_functions regprocedure[] := array[
    'public.pos_get_sales_product_tally_v2(uuid,boolean,date,date,uuid)'::regprocedure,
    'public.pos_get_closed_shifts_page(uuid,boolean,date,date,timestamptz,uuid,integer)'::regprocedure
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
      raise exception 'Shift-reporting RPC is not stable, SECURITY DEFINER, default-free, and search-path safe: %',
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
      raise exception 'Shift-reporting RPC has unsafe PUBLIC/anon/authenticated grants: %',
        v_function::text;
    end if;
  end loop;

  -- The all-time v1 tally remains available for cached clients.
  if to_regprocedure(
    'public.pos_get_sales_product_tally(uuid,boolean)'
  ) is null then
    raise exception 'The existing all-time product-tally RPC was removed.';
  end if;

  select pg_catalog.pg_get_function_result(
    'public.pos_get_sales_product_tally_v2(uuid,boolean,date,date,uuid)'::regprocedure
  ) into v_result;
  if v_result not ilike '%product_id uuid%'
    or v_result not ilike '%item_name text%'
    or v_result not ilike '%size_label text%'
    or v_result not ilike '%order_count bigint%'
    or v_result not ilike '%units_sold bigint%'
    or v_result not ilike '%net_sales_centavos bigint%' then
    raise exception 'Filtered product-tally result contract is incomplete: %',
      v_result;
  end if;

  select pg_catalog.pg_get_function_result(
    'public.pos_get_closed_shifts_page(uuid,boolean,date,date,timestamptz,uuid,integer)'::regprocedure
  ) into v_result;
  if v_result not ilike '%shift_id uuid%'
    or v_result not ilike '%register_name text%'
    or v_result not ilike '%opened_business_date date%'
    or v_result not ilike '%closed_business_date date%'
    or v_result not ilike '%opened_by_display_name text%'
    or v_result not ilike '%closed_by_display_name text%'
    or v_result not ilike '%close_notes text%'
    or v_result not ilike '%gross_sale_count bigint%'
    or v_result not ilike '%voided_sale_count bigint%'
    or v_result not ilike '%net_sale_count bigint%'
    or v_result not ilike '%net_items_sold bigint%'
    or v_result not ilike '%gross_sales_centavos bigint%'
    or v_result not ilike '%voided_sales_centavos bigint%'
    or v_result not ilike '%net_sales_centavos bigint%'
    or v_result not ilike '%cash_net_centavos bigint%'
    or v_result not ilike '%gcash_net_centavos bigint%'
    or v_result not ilike '%gotyme_net_centavos bigint%'
    or v_result not ilike '%opening_cash_centavos bigint%'
    or v_result not ilike '%expected_cash_centavos bigint%'
    or v_result not ilike '%counted_cash_centavos bigint%'
    or v_result not ilike '%cash_variance_centavos bigint%'
    or v_result not ilike '%expected_gcash_centavos bigint%'
    or v_result not ilike '%verified_gcash_centavos bigint%'
    or v_result not ilike '%gcash_variance_centavos bigint%'
    or v_result not ilike '%expected_gotyme_centavos bigint%'
    or v_result not ilike '%verified_gotyme_centavos bigint%'
    or v_result not ilike '%gotyme_variance_centavos bigint%'
    or v_result not ilike '%estimated_cost_centavos bigint%'
    or v_result not ilike '%estimated_gross_profit_centavos bigint%'
    or v_result not ilike '%can_view_costs boolean%'
    or v_result not ilike '%has_more boolean%' then
    raise exception 'Closed-shift history result contract is incomplete: %',
      v_result;
  end if;

  select pg_catalog.pg_get_indexdef(indexes.indexrelid)
    into v_index_definition
  from pg_catalog.pg_index as indexes
  where indexes.indexrelid =
    to_regclass('public.pos_shifts_history_cursor_idx')
    and indexes.indisvalid
    and indexes.indisready;

  if v_index_definition is null
    or v_index_definition not ilike
      '%(business_id, is_training, closed_at DESC, id DESC)%'
    or v_index_definition not ilike '%WHERE (status = ''closed''::text)%' then
    raise exception 'Closed-shift history index is missing or malformed: %',
      coalesce(v_index_definition, '<missing>');
  end if;

  select (metadata.value ->> 'version')::integer,
         metadata.value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata as metadata
  where metadata.key = 'schema_version';

  if v_version is distinct from 8
    or v_name is distinct from 'pos_shift_history_and_filtered_tally' then
    raise exception 'Expected shift-history schema v8, found version %, name %.',
      v_version, v_name;
  end if;
end;
$$;

select 'PASS: POS shift-history schema checks' as result;
