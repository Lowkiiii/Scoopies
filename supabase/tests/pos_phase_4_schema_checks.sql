-- Read-only Phase 4 structural, privilege, and API-contract checks.

do $$
declare
  expected_function text;
  expected_functions text[] := array[
    '_pos_phase4_metrics',
    '_pos_phase4_complete_sale',
    'pos_open_shift',
    'pos_get_shift_status',
    'pos_close_shift',
    'pos_complete_shift_sale',
    'pos_complete_sale',
    'pos_void_sale',
    'pos_get_today_summary',
    'pos_get_recent_sales',
    'pos_get_recent_sales_v2',
    'pos_get_end_of_day_summary'
  ];
  version_value integer;
  checkout_result text;
  shift_checkout_defaults integer;
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
          select 1 from unnest(procedure.proconfig) as setting
          where setting like 'search_path=%'
        )
    ) then
      raise exception 'Missing, invoker-rights, or search-path-unsafe Phase 4 function: %', expected_function;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.pos_open_shift(uuid,boolean,bigint)', 'EXECUTE')
    or has_function_privilege('anon', 'public.pos_get_shift_status(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.pos_close_shift(uuid,uuid,bigint,bigint,bigint,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.pos_complete_shift_sale(uuid,uuid,boolean,uuid,jsonb,text,bigint,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.pos_complete_sale(uuid,uuid,jsonb,text,bigint,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.pos_void_sale(uuid,uuid,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.pos_get_today_summary(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.pos_get_recent_sales(uuid,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.pos_get_recent_sales_v2(uuid,boolean,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.pos_get_end_of_day_summary(uuid,date,boolean)', 'EXECUTE') then
    raise exception 'Anonymous role can execute a Phase 4 public RPC.';
  end if;

  if not has_function_privilege('authenticated', 'public.pos_open_shift(uuid,boolean,bigint)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.pos_get_shift_status(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.pos_close_shift(uuid,uuid,bigint,bigint,bigint,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.pos_complete_shift_sale(uuid,uuid,boolean,uuid,jsonb,text,bigint,text,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.pos_complete_sale(uuid,uuid,jsonb,text,bigint,text,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.pos_void_sale(uuid,uuid,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.pos_get_today_summary(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.pos_get_recent_sales(uuid,integer)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.pos_get_recent_sales_v2(uuid,boolean,integer)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.pos_get_end_of_day_summary(uuid,date,boolean)', 'EXECUTE') then
    raise exception 'Authenticated role is missing a Phase 4 public RPC grant.';
  end if;

  if has_function_privilege('authenticated', 'public._pos_phase4_metrics(uuid,uuid,date,boolean)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public._pos_phase4_complete_sale(uuid,uuid,boolean,uuid,jsonb,text,bigint,text,text,boolean)', 'EXECUTE') then
    raise exception 'Authenticated browser role can execute an internal Phase 4 helper.';
  end if;

  if has_table_privilege('authenticated', 'public.pos_shifts', 'INSERT')
    or has_table_privilege('authenticated', 'public.pos_shifts', 'UPDATE')
    or has_table_privilege('authenticated', 'public.pos_sales', 'INSERT')
    or has_table_privilege('authenticated', 'public.pos_sale_events', 'INSERT') then
    raise exception 'Browser role has direct Phase 4 ledger mutation privileges.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'pos_sale_events_one_reversal_uq'
      and indexdef ilike '%unique%'
      and indexdef ilike '%void_before_preparation%'
  ) then
    raise exception 'The one-financial-reversal uniqueness guard is missing.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'pos_shifts_one_open_per_register_uq'
      and indexdef ilike '%(business_id, register_id)%'
      and indexdef not ilike '%is_training%'
  ) then
    raise exception 'Physical register one-open-shift invariant changed.';
  end if;

  select procedure.pronargdefaults
    into shift_checkout_defaults
  from pg_catalog.pg_proc as procedure
  where procedure.oid = 'public.pos_complete_shift_sale(uuid,uuid,boolean,uuid,jsonb,text,bigint,text,text)'::regprocedure;

  if shift_checkout_defaults <> 0 then
    raise exception 'Shift-aware checkout must have no defaults; found %.', shift_checkout_defaults;
  end if;

  select pg_catalog.pg_get_function_result(
    'public.pos_complete_shift_sale(uuid,uuid,boolean,uuid,jsonb,text,bigint,text,text)'::regprocedure
  ) into checkout_result;
  if checkout_result ~* '(ingredient|packaging|estimated).*cost|gross_profit' then
    raise exception 'Checkout response exposes cost-bearing fields: %', checkout_result;
  end if;

  if pg_catalog.pg_get_functiondef(
      'public.pos_complete_sale(uuid,uuid,jsonb,text,bigint,text,text)'::regprocedure
    ) ilike '%insert into public.pos_shifts%' then
    raise exception 'Legacy checkout still contains an auto-open shift path.';
  end if;

  select (metadata.value ->> 'version')::integer into version_value
  from public.pos_system_metadata as metadata
  where metadata.key = 'schema_version';
  if version_value is distinct from 4 then
    raise exception 'Expected POS schema version 4, found %', version_value;
  end if;
end;
$$;

select 'PASS: POS Phase 4 schema checks' as result;
