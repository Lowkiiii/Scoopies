-- Read-only schema checks for the Phase 2A business-timezone date fix.

do $$
declare
  v_function regprocedure :=
    'public.pos_inventory_update_item_details(uuid,uuid,text,text,date,text,text,bigint)'::regprocedure;
  v_definition text;
  v_version integer;
  v_name text;
begin
  select pg_catalog.pg_get_functiondef(v_function) into v_definition;

  if v_definition not ilike '%from public.pos_businesses as business%'
    or v_definition not ilike '%business.id = p_business_id%'
    or v_definition not ilike '%pg_catalog.timezone(v_timezone, pg_catalog.now())%'
    or v_definition not ilike '%p_last_stocked_on > v_business_date%' then
    raise exception 'Item-details RPC does not use the business-local date.';
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
    raise exception 'Timezone-safe item-details RPC lost SECURITY DEFINER safety.';
  end if;

  if has_function_privilege('anon', v_function, 'EXECUTE')
    or not has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception 'Timezone-safe item-details RPC has unsafe grants.';
  end if;

  select (metadata.value ->> 'version')::integer,
         metadata.value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata as metadata
  where metadata.key = 'schema_version';

  if v_version is distinct from 11
    or v_name is distinct from 'inventory_phase_2a_timezone_safe_dates' then
    raise exception 'Expected inventory schema 11, found %:%.', v_version, v_name;
  end if;
end;
$$;

select 'PASS: Inventory Phase 2A timezone schema checks' as result;
