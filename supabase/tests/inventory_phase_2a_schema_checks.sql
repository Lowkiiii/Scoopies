-- Read-only Inventory Phase 2A item-details schema and privilege checks.

do $$
declare
  v_function regprocedure :=
    'public.pos_inventory_update_item_details(uuid,uuid,text,text,date,text,text,bigint)'::regprocedure;
  v_result text;
  v_definition text;
  v_version integer;
  v_name text;
begin
  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pos_inventory_items'
      and column_name in (
        'brand', 'purchased_from', 'last_stocked_on', 'notes', 'preferred_unit'
      )
  ) <> 5 then
    raise exception 'One or more Phase 2A inventory item-detail columns are missing.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pos_inventory_items'
      and column_name in (
        'quantity_on_hand', 'quantity_on_hand_base',
        'current_balance', 'current_balance_base'
      )
  ) then
    raise exception 'Phase 2A stored a mutable item balance instead of using the ledger.';
  end if;

  if not (
    select procedure.prosecdef
      and exists (
        select 1
        from unnest(procedure.proconfig) as setting
        where setting = 'search_path=""'
      )
    from pg_catalog.pg_proc as procedure
    where procedure.oid = v_function
  ) then
    raise exception 'Item-details RPC is missing SECURITY DEFINER or an empty search path.';
  end if;

  if has_function_privilege('anon', v_function, 'EXECUTE')
    or not has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception 'Item-details RPC has unsafe anon/authenticated grants.';
  end if;

  select pg_catalog.pg_get_function_result(v_function) into v_result;
  if v_result not ilike '%brand text%'
    or v_result not ilike '%purchased_from text%'
    or v_result not ilike '%last_stocked_on date%'
    or v_result not ilike '%notes text%'
    or v_result not ilike '%preferred_unit text%'
    or v_result not ilike '%revision bigint%'
    or v_result not ilike '%is_retry boolean%' then
    raise exception 'Item-details result contract is incomplete: %', v_result;
  end if;

  select pg_catalog.pg_get_function_result(
    'public.pos_inventory_get_items(uuid,boolean)'::regprocedure
  ) into v_result;
  if v_result not ilike '%base_unit text%'
    or v_result not ilike '%preferred_unit text%'
    or v_result not ilike '%brand text%'
    or v_result not ilike '%purchased_from text%'
    or v_result not ilike '%last_stocked_on date%'
    or v_result not ilike '%notes text%'
    or v_result not ilike '%current_balance_base numeric%' then
    raise exception 'Expanded inventory item read contract is incomplete: %', v_result;
  end if;

  select pg_catalog.pg_get_functiondef(v_function) into v_definition;
  if v_definition not ilike '%pos_has_role%owner%manager%'
    or v_definition not ilike '%pg_advisory_xact_lock%'
    or v_definition not ilike '%for update%'
    or v_definition not ilike '%v_item.revision <> p_expected_revision%'
    or v_definition not ilike '%v_item.base_unit = ''g''%preferred_unit in (''g'', ''kg'')%'
    or v_definition not ilike '%v_item.base_unit = ''ml''%preferred_unit in (''ml'', ''l'')%'
    or v_definition not ilike '%revision = item.revision + 1%' then
    raise exception 'Item-details RPC lost authorization, unit, locking, or revision safety.';
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
  ) <> 9 then
    raise exception 'Expected exactly nine authenticated public inventory RPCs.';
  end if;

  select (metadata.value ->> 'version')::integer,
         metadata.value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata as metadata
  where metadata.key = 'schema_version';

  if v_version is distinct from 10
    or v_name is distinct from 'inventory_phase_2a_item_details' then
    raise exception 'Expected inventory schema 10, found %:%.', v_version, v_name;
  end if;
end;
$$;

select 'PASS: Inventory Phase 2A schema checks' as result;
