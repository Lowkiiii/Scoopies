-- Read-only Phase 3 structural and privilege checks.

do $$
declare
  expected_function text;
  expected_functions text[] := array[
    'pos_complete_sale',
    'pos_get_today_summary',
    'pos_get_recent_sales'
  ];
  version_value integer;
  checkout_result text;
begin
  foreach expected_function in array expected_functions loop
    if not exists (
      select 1
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = expected_function
        and procedure.prosecdef = true
        and exists (
          select 1
          from unnest(procedure.proconfig) as setting
          where setting like 'search_path=%'
        )
    ) then
      raise exception 'Missing, invoker-rights, or search-path-unsafe Phase 3 function: %', expected_function;
    end if;
  end loop;

  if has_function_privilege(
      'anon',
      'public.pos_complete_sale(uuid,uuid,jsonb,text,bigint,text,text)',
      'EXECUTE'
    )
    or has_function_privilege('anon', 'public.pos_get_today_summary(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.pos_get_recent_sales(uuid,integer)', 'EXECUTE') then
    raise exception 'Anonymous role can execute a Phase 3 RPC.';
  end if;

  if not has_function_privilege(
      'authenticated',
      'public.pos_complete_sale(uuid,uuid,jsonb,text,bigint,text,text)',
      'EXECUTE'
    )
    or not has_function_privilege('authenticated', 'public.pos_get_today_summary(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.pos_get_recent_sales(uuid,integer)', 'EXECUTE') then
    raise exception 'Authenticated role is missing a Phase 3 RPC grant.';
  end if;

  if has_table_privilege('authenticated', 'public.pos_sales', 'INSERT')
    or has_table_privilege('authenticated', 'public.pos_sale_items', 'INSERT')
    or has_table_privilege('authenticated', 'public.pos_payments', 'INSERT')
    or has_table_privilege('authenticated', 'public.pos_sale_events', 'INSERT')
    or has_table_privilege('authenticated', 'public.pos_shifts', 'INSERT') then
    raise exception 'Browser roles have direct POS checkout mutation privileges.';
  end if;

  select pg_catalog.pg_get_function_result(
    'public.pos_complete_sale(uuid,uuid,jsonb,text,bigint,text,text)'::regprocedure
  ) into checkout_result;

  if checkout_result ~* '(ingredient|packaging|estimated).*cost|gross_profit' then
    raise exception 'Checkout response exposes cost-bearing fields: %', checkout_result;
  end if;

  select (metadata.value ->> 'version')::integer
    into version_value
  from public.pos_system_metadata as metadata
  where metadata.key = 'schema_version';

  if version_value is distinct from 3 then
    raise exception 'Expected POS schema version 3, found %', version_value;
  end if;
end;
$$;

select 'PASS: POS Phase 3 schema checks' as result;
