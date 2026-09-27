-- Read-only Phase 2 structural checks. Safe after applying the migration.

do $$
declare
  expected_function text;
  expected_functions text[] := array[
    'pos_costing_publication_payload',
    'pos_costing_publication_hash',
    'pos_get_my_businesses',
    'pos_get_publication_status',
    'pos_get_catalog',
    'pos_publish_costing_product',
    'pos_set_product_availability'
  ];
  version_value integer;
  catalog_result text;
begin
  foreach expected_function in array expected_functions loop
    if not exists (
      select 1
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = expected_function
        and exists (
          select 1
          from unnest(procedure.proconfig) as setting
          where setting like 'search_path=%'
        )
    ) then
      raise exception 'Missing or search-path-unsafe Phase 2 function: %', expected_function;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'pos_get_my_businesses',
        'pos_get_publication_status',
        'pos_get_catalog',
        'pos_publish_costing_product',
        'pos_set_product_availability'
      )
      and procedure.prosecdef = true
    group by namespace.nspname
    having count(*) = 5
  ) then
    raise exception 'Every client-facing Phase 2 RPC must be SECURITY DEFINER.';
  end if;

  if has_function_privilege(
      'anon',
      'public.pos_publish_costing_product(uuid,text,text,text,bigint,bigint,bigint,jsonb,text,text,uuid)',
      'EXECUTE'
    )
    or has_function_privilege('anon', 'public.pos_get_catalog(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.pos_get_publication_status(uuid)', 'EXECUTE') then
    raise exception 'Anonymous role can execute a Phase 2 client RPC.';
  end if;

  if not has_function_privilege(
      'authenticated',
      'public.pos_publish_costing_product(uuid,text,text,text,bigint,bigint,bigint,jsonb,text,text,uuid)',
      'EXECUTE'
    )
    or not has_function_privilege('authenticated', 'public.pos_get_catalog(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.pos_get_publication_status(uuid)', 'EXECUTE') then
    raise exception 'Authenticated role is missing a Phase 2 RPC grant.';
  end if;

  if has_function_privilege(
      'authenticated',
      'public.pos_costing_publication_payload(text,text,text,bigint,bigint,bigint,jsonb,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.pos_costing_publication_hash(text,text,text,bigint,bigint,bigint,jsonb,text)',
      'EXECUTE'
    ) then
    raise exception 'An internal publication helper is browser-executable.';
  end if;

  if has_table_privilege('authenticated', 'public.pos_products', 'INSERT')
    or has_table_privilege('authenticated', 'public.pos_products', 'UPDATE')
    or has_table_privilege('authenticated', 'public.pos_product_versions', 'INSERT')
    or has_table_privilege('authenticated', 'public.pos_product_versions', 'UPDATE')
    or has_table_privilege('authenticated', 'public.pos_categories', 'INSERT') then
    raise exception 'Browser roles have direct catalog mutation privileges.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes as index_info
    where index_info.schemaname = 'public'
      and index_info.indexname = 'pos_product_versions_product_hash_idx'
  ) then
    raise exception 'Missing publication-hash lookup index.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.pos_product_versions'::regclass
      and constraint_info.conname = 'pos_product_versions_hash_valid'
  ) then
    raise exception 'Missing source hash validation constraint.';
  end if;

  select pg_catalog.pg_get_function_result(
    'public.pos_get_catalog(uuid)'::regprocedure
  ) into catalog_result;

  if catalog_result ~* '(ingredient|packaging|estimated).*cost|costing_snapshot|source_costing_hash' then
    raise exception 'Cashier catalog RPC exposes cost-bearing fields: %', catalog_result;
  end if;

  select (metadata.value ->> 'version')::integer
    into version_value
  from public.pos_system_metadata as metadata
  where metadata.key = 'schema_version';

  if version_value is distinct from 2 then
    raise exception 'Expected POS schema version 2, found %', version_value;
  end if;
end;
$$;

select 'PASS: POS Phase 2 schema checks' as result;
