-- Read-only Phase 1 structural checks. Safe to run after the migration.

do $$
declare
  expected_table text;
  expected_tables text[] := array[
    'pos_system_metadata',
    'pos_businesses',
    'pos_business_members',
    'pos_events',
    'pos_registers',
    'pos_shifts',
    'pos_categories',
    'pos_products',
    'pos_product_versions',
    'pos_receipt_counters',
    'pos_sales',
    'pos_sale_items',
    'pos_payments',
    'pos_sale_events',
    'pos_expenses',
    'pos_cash_movements'
  ];
  expected_function text;
  expected_functions text[] := array[
    'pos_is_member',
    'pos_has_role',
    'pos_bootstrap_business',
    'pos_add_member_by_email',
    'pos_allocate_receipt'
  ];
  version_value integer;
begin
  foreach expected_table in array expected_tables loop
    if to_regclass('public.' || expected_table) is null then
      raise exception 'Missing Phase 1 table: %', expected_table;
    end if;

    if not exists (
      select 1
      from pg_class as relation
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = expected_table
        and relation.relrowsecurity = true
    ) then
      raise exception 'RLS is not enabled on public.%', expected_table;
    end if;

    if has_table_privilege('anon', 'public.' || expected_table, 'SELECT')
      or has_table_privilege('anon', 'public.' || expected_table, 'INSERT')
      or has_table_privilege('anon', 'public.' || expected_table, 'UPDATE')
      or has_table_privilege('anon', 'public.' || expected_table, 'DELETE') then
      raise exception 'Anonymous role has a privilege on public.%', expected_table;
    end if;
  end loop;

  foreach expected_function in array expected_functions loop
    if not exists (
      select 1
      from pg_proc as procedure
      join pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = expected_function
        and procedure.prosecdef = true
        and exists (
          select 1
          from unnest(procedure.proconfig) as setting
          where setting like 'search_path=%'
        )
    ) then
      raise exception 'Missing or unsafe SECURITY DEFINER function: %', expected_function;
    end if;
  end loop;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name like 'pos\_%' escape '\'
      and column_name like '%centavos'
      and data_type <> 'bigint'
  ) then
    raise exception 'All centavo columns must use bigint.';
  end if;

  if has_table_privilege('authenticated', 'public.pos_sales', 'INSERT')
    or has_table_privilege('authenticated', 'public.pos_sales', 'UPDATE')
    or has_table_privilege('authenticated', 'public.pos_sales', 'DELETE')
    or has_table_privilege('authenticated', 'public.pos_sale_items', 'INSERT')
    or has_table_privilege('authenticated', 'public.pos_payments', 'INSERT')
    or has_table_privilege('authenticated', 'public.pos_product_versions', 'INSERT') then
    raise exception 'Browser roles must not directly mutate protected POS tables.';
  end if;

  select (metadata.value ->> 'version')::integer
    into version_value
  from public.pos_system_metadata as metadata
  where metadata.key = 'schema_version';

  if version_value is distinct from 1 then
    raise exception 'Expected POS schema version 1, found %', version_value;
  end if;

  if (timestamptz '2026-09-26 15:59:59+00' at time zone 'Asia/Manila')::date
      <> date '2026-09-26'
    or (timestamptz '2026-09-26 16:00:00+00' at time zone 'Asia/Manila')::date
      <> date '2026-09-27' then
    raise exception 'Asia/Manila business-date boundary is incorrect.';
  end if;
end;
$$;

select 'PASS: POS Phase 1 schema checks' as result;
