-- Read-only Inventory Phase 2B canonical-category schema and privilege checks.

do $$
declare
  v_v1 regprocedure :=
    'public.pos_inventory_update_item_details(uuid,uuid,text,text,date,text,text,bigint)'::regprocedure;
  v_v2 regprocedure :=
    'public.pos_inventory_update_item_details_v2(uuid,uuid,text,date,text,text,bigint)'::regprocedure;
  v_get regprocedure :=
    'public.pos_inventory_get_items(uuid,boolean)'::regprocedure;
  v_definition text;
  v_result text;
  v_input_names text;
  v_version integer;
  v_name text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pos_inventory_items'
      and column_name = 'legacy_brand'
      and data_type = 'text'
  ) or exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pos_inventory_items'
      and column_name = 'brand'
  ) then
    raise exception 'Phase 2B did not losslessly rename the physical brand column.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    join pg_catalog.pg_class as relation
      on relation.oid = constraint_record.conrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'pos_inventory_items'
      and constraint_record.conname = 'pos_inventory_items_legacy_brand_check'
      and pg_catalog.pg_get_constraintdef(constraint_record.oid)
        ilike '%legacy_brand%120%'
  ) then
    raise exception 'The renamed legacy-brand validation constraint is missing.';
  end if;

  select pg_catalog.pg_get_function_result(v_get),
         pg_catalog.pg_get_functiondef(v_get)
    into v_result, v_definition;
  if v_result not ilike '%category_name text%'
    or v_result not ilike '%brand text%'
    or v_result ilike '%legacy_brand text%'
    or v_definition not ilike '%item.legacy_brand%'
    or v_definition not ilike '%ingredientCategories%'
    or v_definition not ilike '%categoryId%'
    or v_definition not ilike '%Removed from costing%'
    or v_definition not ilike '%Uncategorized%' then
    raise exception 'Inventory reads do not expose canonical category plus the cached-client brand alias.';
  end if;

  select pg_catalog.pg_get_functiondef(v_v1) into v_definition;
  if v_definition not ilike '%p_brand text%'
    or v_definition not ilike '%legacy_brand = v_legacy_brand%'
    or v_definition not ilike '%v_item.legacy_brand%'
    or v_definition not ilike '%from public.pos_businesses as business%'
    or v_definition not ilike '%pg_catalog.timezone(v_timezone, pg_catalog.now())%'
    or v_definition not ilike '%pos_has_role%owner%manager%'
    or v_definition not ilike '%pg_advisory_xact_lock%'
    or v_definition not ilike '%for update%'
    or v_definition not ilike '%v_item.revision <> p_expected_revision%'
    or v_definition not ilike '%revision = item.revision + 1%' then
    raise exception 'Deprecated v1 item-details compatibility lost safety or legacy mapping.';
  end if;

  select pg_catalog.pg_get_functiondef(v_v2),
         pg_catalog.pg_get_function_result(v_v2)
    into v_definition, v_result;
  select pg_catalog.string_agg(argument.name, ',' order by argument.ordinality)
    into v_input_names
  from pg_catalog.pg_proc as procedure,
       unnest(procedure.proargnames, procedure.proargmodes)
         with ordinality as argument(name, mode, ordinality)
  where procedure.oid = v_v2
    and argument.mode::text in ('i', 'b', 'v');

  if v_input_names is distinct from
      'p_business_id,p_inventory_item_id,p_purchased_from,p_last_stocked_on,p_notes,p_preferred_unit,p_expected_revision'
    or v_input_names ilike '%brand%'
    or v_input_names ilike '%category%'
    or v_result ilike '%brand%'
    or v_result ilike '%category%'
    or v_definition ilike '%legacy_brand%'
    or v_definition not ilike '%from public.pos_businesses as business%'
    or v_definition not ilike '%pg_catalog.timezone(v_timezone, pg_catalog.now())%'
    or v_definition not ilike '%pos_has_role%owner%manager%'
    or v_definition not ilike '%pg_advisory_xact_lock%'
    or v_definition not ilike '%for update%'
    or v_definition not ilike '%v_item.revision <> p_expected_revision%'
    or v_definition not ilike '%revision = item.revision + 1%' then
    raise exception 'V2 item-details contract can mutate category/legacy brand or lost safety: inputs %, result %',
      v_input_names, v_result;
  end if;

  if not (
    select procedure.prosecdef
      and exists (
        select 1
        from unnest(procedure.proconfig) as setting
        where setting = 'search_path=""'
      )
    from pg_catalog.pg_proc as procedure
    where procedure.oid = v_get
  ) or not (
    select procedure.prosecdef
      and exists (
        select 1
        from unnest(procedure.proconfig) as setting
        where setting = 'search_path=""'
      )
    from pg_catalog.pg_proc as procedure
    where procedure.oid = v_v1
  ) or not (
    select procedure.prosecdef
      and exists (
        select 1
        from unnest(procedure.proconfig) as setting
        where setting = 'search_path=""'
      )
    from pg_catalog.pg_proc as procedure
    where procedure.oid = v_v2
  ) then
    raise exception 'A Phase 2B RPC lost SECURITY DEFINER or its empty search path.';
  end if;

  if has_function_privilege('anon', v_get, 'EXECUTE')
    or has_function_privilege('anon', v_v1, 'EXECUTE')
    or has_function_privilege('anon', v_v2, 'EXECUTE')
    or not has_function_privilege('authenticated', v_get, 'EXECUTE')
    or not has_function_privilege('authenticated', v_v1, 'EXECUTE')
    or not has_function_privilege('authenticated', v_v2, 'EXECUTE') then
    raise exception 'A Phase 2B RPC has unsafe anon/authenticated grants.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like 'pos_inventory_%'
      and procedure.prosecdef
      and has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
  ) <> 10 then
    raise exception 'Expected exactly ten authenticated public inventory RPCs.';
  end if;

  select (metadata.value ->> 'version')::integer,
         metadata.value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata as metadata
  where metadata.key = 'schema_version';

  if v_version is distinct from 12
    or v_name is distinct from 'inventory_phase_2b_category' then
    raise exception 'Expected inventory schema 12, found %:%.', v_version, v_name;
  end if;
end;
$$;

select 'PASS: Inventory Phase 2B canonical-category schema checks' as result;
