-- Read-only Inventory Phase 1 structural, privilege, and API checks.

do $$
declare
  v_table text;
  v_function regprocedure;
  v_policy text;
  v_version integer;
  v_name text;
  v_defaults integer;
  v_result text;
  v_definition text;
  v_public_functions regprocedure[] := array[
    'public.pos_inventory_sync_items(uuid,jsonb)'::regprocedure,
    'public.pos_inventory_get_items(uuid,boolean)'::regprocedure,
    'public.pos_inventory_get_transactions(uuid,uuid,integer)'::regprocedure,
    'public.pos_inventory_record_transaction(uuid,uuid,text,jsonb,text,text)'::regprocedure,
    'public.pos_inventory_set_threshold(uuid,uuid,numeric,bigint)'::regprocedure,
    'public.pos_inventory_validate_source_delete(uuid,text)'::regprocedure,
    'public.pos_inventory_prepare_source_delete(uuid,text,text,text,text)'::regprocedure,
    'public.pos_inventory_prepare_source_change(uuid,text,text,text,text)'::regprocedure
  ];
  v_internal_functions regprocedure[] := array[
    'public._pos_inventory_base_unit(text)'::regprocedure,
    'public._pos_inventory_to_base(numeric,text)'::regprocedure,
    'public._pos_inventory_balance(uuid,uuid)'::regprocedure,
    'public.pos_inventory_protect_item()'::regprocedure,
    'public.pos_inventory_guard_costing_state()'::regprocedure
  ];
begin
  if not has_table_privilege('authenticated', 'public.scoopies_state', 'SELECT')
    or not has_table_privilege('authenticated', 'public.scoopies_state', 'INSERT')
    or not has_table_privilege('authenticated', 'public.scoopies_state', 'UPDATE')
    or has_table_privilege('authenticated', 'public.scoopies_state', 'DELETE')
    or has_table_privilege('authenticated', 'public.scoopies_state', 'TRUNCATE')
    or has_table_privilege('authenticated', 'public.scoopies_state', 'TRIGGER')
    or has_table_privilege('authenticated', 'public.scoopies_state', 'REFERENCES')
    or has_table_privilege('anon', 'public.scoopies_state', 'SELECT')
    or has_table_privilege('anon', 'public.scoopies_state', 'INSERT')
    or has_table_privilege('anon', 'public.scoopies_state', 'UPDATE')
    or has_table_privilege('anon', 'public.scoopies_state', 'DELETE')
    or has_table_privilege('anon', 'public.scoopies_state', 'TRUNCATE') then
    raise exception 'Costing-state table grants are broader or narrower than authenticated SELECT/INSERT/UPDATE only.';
  end if;

  if to_regclass('public.scoopies_activity') is not null
    and (
      not has_table_privilege('authenticated', 'public.scoopies_activity', 'SELECT')
      or not has_table_privilege('authenticated', 'public.scoopies_activity', 'INSERT')
      or has_table_privilege('authenticated', 'public.scoopies_activity', 'UPDATE')
      or has_table_privilege('authenticated', 'public.scoopies_activity', 'DELETE')
      or has_table_privilege('authenticated', 'public.scoopies_activity', 'TRUNCATE')
      or has_table_privilege('authenticated', 'public.scoopies_activity', 'TRIGGER')
      or has_table_privilege('authenticated', 'public.scoopies_activity', 'REFERENCES')
      or has_table_privilege('anon', 'public.scoopies_activity', 'SELECT')
      or has_table_privilege('anon', 'public.scoopies_activity', 'INSERT')
      or has_table_privilege('anon', 'public.scoopies_activity', 'UPDATE')
      or has_table_privilege('anon', 'public.scoopies_activity', 'DELETE')
      or has_table_privilege('anon', 'public.scoopies_activity', 'TRUNCATE')
    ) then
    raise exception 'Activity table grants are broader or narrower than authenticated SELECT/INSERT only.';
  end if;

  foreach v_table in array array[
    'pos_inventory_items',
    'pos_inventory_transactions',
    'pos_inventory_transaction_lines'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = v_table
        and relation.relkind = 'r'
        and relation.relrowsecurity
    ) then
      raise exception 'Missing or RLS-disabled inventory table: %', v_table;
    end if;

    if has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
      or has_table_privilege('anon', 'public.' || v_table, 'SELECT')
      or has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
      or has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
      or has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
      or has_table_privilege('authenticated', 'public.' || v_table, 'TRUNCATE') then
      raise exception 'Browser role has a direct inventory table privilege on public.%', v_table;
    end if;
  end loop;

  foreach v_function in array v_public_functions loop
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
      raise exception 'Inventory RPC is missing SECURITY DEFINER or an empty search path: %',
        v_function::text;
    end if;

    if has_function_privilege('anon', v_function, 'EXECUTE')
      or not has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'Inventory RPC has unsafe anon/authenticated grants: %',
        v_function::text;
    end if;
  end loop;

  foreach v_function in array v_internal_functions loop
    if has_function_privilege('anon', v_function, 'EXECUTE')
      or has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'Browser role can execute internal inventory function: %',
        v_function::text;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_proc as procedure,
           unnest(procedure.proconfig) as setting
      where procedure.oid = v_function
        and setting = 'search_path=""'
    ) then
      raise exception 'Internal inventory function lacks an empty search path: %',
        v_function::text;
    end if;
  end loop;

  foreach v_policy in array array[
    'pos_inventory_items_member_read',
    'pos_inventory_transactions_manager_read',
    'pos_inventory_transaction_lines_manager_read'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and policyname = v_policy
        and cmd = 'SELECT'
        and roles = array['authenticated']::name[]
    ) then
      raise exception 'Missing inventory read policy: %', v_policy;
    end if;
  end loop;

  if not exists (
      select 1 from pg_catalog.pg_trigger
      where tgrelid = 'public.pos_inventory_items'::regclass
        and tgname = 'pos_inventory_items_protected'
        and tgenabled = 'O'
        and not tgisinternal
    )
    or not exists (
      select 1 from pg_catalog.pg_trigger
      where tgrelid = 'public.pos_inventory_transactions'::regclass
        and tgname = 'pos_inventory_transactions_immutable'
        and tgenabled = 'O'
        and not tgisinternal
    )
    or not exists (
      select 1 from pg_catalog.pg_trigger
      where tgrelid = 'public.pos_inventory_transaction_lines'::regclass
        and tgname = 'pos_inventory_transaction_lines_immutable'
        and tgenabled = 'O'
        and not tgisinternal
    )
    or not exists (
      select 1 from pg_catalog.pg_trigger
      where tgrelid = 'public.scoopies_state'::regclass
        and tgname = 'pos_inventory_costing_state_guard'
        and tgenabled = 'O'
        and not tgisinternal
    ) then
    raise exception 'One or more inventory protection triggers are missing or disabled.';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.pos_inventory_protect_item()'::regprocedure
  ) into v_definition;
  if v_definition not ilike '%new.item_kind is distinct from old.item_kind%'
    or v_definition not ilike '%new.base_unit is distinct from old.base_unit%' then
    raise exception 'Inventory item trigger no longer protects immutable kind/base identity.';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.pos_inventory_guard_costing_state()'::regprocedure
  ) into v_definition;
  if v_definition not ilike '%security definer%'
    or v_definition not ilike '%tg_op = ''delete''%'
    or v_definition not ilike '%new.id is distinct from ''main''%'
    or v_definition not ilike '%duplicate ingredient ids%'
    or v_definition not ilike '%new.data -> ''recipes''%'
    or v_definition not ilike '%new.data -> ''mixtureDrafts''%'
    or v_definition not ilike '%pendingIngredients%'
    or v_definition not ilike '%references missing ingredient id%'
    or v_definition not ilike '%v_has_tombstone%'
    or v_definition not ilike '%not v_item.active%'
    or v_definition not ilike '%v_item.item_kind is distinct from v_kind%'
    or v_definition not ilike '%v_item.base_unit is distinct from v_base_unit%'
    or v_definition not ilike '%for update%' then
    raise exception 'Costing-state guard no longer blocks stale revival and active identity changes under an item lock.';
  end if;

  select pg_catalog.pg_get_triggerdef(trigger.oid)
    into v_definition
  from pg_catalog.pg_trigger as trigger
  where trigger.tgrelid = 'public.scoopies_state'::regclass
    and trigger.tgname = 'pos_inventory_costing_state_guard';
  if v_definition not ilike '%before insert or delete or update%'
    and v_definition not ilike '%before insert or update or delete%' then
    raise exception 'Costing-state guard trigger does not cover insert, update, and delete.';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.pos_inventory_sync_items(uuid,jsonb)'::regprocedure
  ) into v_definition;
  if v_definition not ilike '%v_result := ''inactive''%'
    or v_definition not ilike '%from public.scoopies_state%'
    or v_definition not ilike '%where costing.id = ''main''%'
    or v_definition not ilike '%for update%'
    or v_definition not ilike '%where item.source_costing_ingredient_id = v_source_id%'
    or v_definition not ilike '%v_actual_name is distinct from v_name%'
    or v_definition not ilike '%v_item.business_id is distinct from p_business_id%'
    or v_definition ilike '%active = true%' then
    raise exception 'Inventory sync no longer enforces authoritative global source binding or tombstone safety.';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.pos_inventory_prepare_source_change(uuid,text,text,text,text)'::regprocedure
  ) into v_definition;
  if v_definition not ilike '%v_item.item_kind is distinct from v_kind%'
    or v_definition not ilike '%v_item.base_unit is distinct from v_base%'
    or v_definition not ilike '%not v_item.active%'
    or v_definition not ilike '%from public.scoopies_state%'
    or v_definition not ilike '%where costing.id = ''main''%'
    or v_definition not ilike '%for update%'
    or v_definition not ilike '%v_source_count = 0%'
    or v_definition not ilike '%v_actual_name is distinct from v_name%'
    or v_definition not ilike '%where item.source_costing_ingredient_id = v_source_id%' then
    raise exception 'Source-change validation no longer requires and locks an exact authoritative global source.';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.pos_inventory_validate_source_delete(uuid,text)'::regprocedure
  ) into v_definition;
  if v_definition not ilike '%pg_advisory_xact_lock%'
    or v_definition not ilike '%for update%'
    or v_definition not ilike '%_pos_inventory_balance%'
    or v_definition ilike '%update public.pos_inventory_items%'
    or v_definition ilike '%insert into public.pos_inventory_items%'
    or v_definition ilike '%delete from public.pos_inventory_items%' then
    raise exception 'Source-deletion validation no longer locks and validates without mutating inventory.';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.pos_inventory_prepare_source_delete(uuid,text,text,text,text)'::regprocedure
  ) into v_definition;
  if v_definition not ilike '%pg_advisory_xact_lock%'
    or v_definition not ilike '%from public.scoopies_state%'
    or v_definition not ilike '%for update%'
    or v_definition not ilike '%jsonb_set%'
    or v_definition not ilike '%v_costing_data -> ''recipes''%'
    or v_definition not ilike '%v_costing_data -> ''mixtureDrafts''%'
    or v_definition not ilike '%v_entry.value -> ''components''%'
    or v_definition not ilike '%insert into public.pos_inventory_items%'
    or v_definition not ilike '%update public.pos_inventory_items%'
    or v_definition not ilike '%''Unnamed ingredient''%'
    or v_definition ilike '%delete from public.pos_inventory_items%' then
    raise exception 'Source deletion is no longer an atomic costing-document and tombstone operation.';
  end if;

  if not exists (
      select 1 from pg_catalog.pg_indexes
      where schemaname = 'public'
        and tablename = 'pos_inventory_items'
        and indexdef ilike '%unique%'
        and indexdef ilike '%(business_id, source_costing_ingredient_id)%'
    )
    or not exists (
      select 1 from pg_catalog.pg_indexes
      where schemaname = 'public'
        and tablename = 'pos_inventory_items'
        and indexdef ilike '%unique%'
        and indexdef ilike '%(source_costing_ingredient_id)%'
    )
    or not exists (
      select 1 from pg_catalog.pg_indexes
      where schemaname = 'public'
        and tablename = 'pos_inventory_transactions'
        and indexdef ilike '%unique%'
        and indexdef ilike '%(business_id, client_transaction_id)%'
    )
    or not exists (
      select 1 from pg_catalog.pg_indexes
      where schemaname = 'public'
        and tablename = 'pos_inventory_transaction_lines'
        and indexdef ilike '%unique%'
        and indexdef ilike '%(business_id, inventory_item_id, item_sequence)%'
    ) then
    raise exception 'Inventory identity, idempotency, or item-sequence uniqueness is missing.';
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
  ) <> 8 then
    raise exception 'Expected exactly eight authenticated public inventory RPCs.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pos_inventory_items'
      and column_name in (
        'quantity_on_hand', 'quantity_on_hand_base', 'current_balance',
        'current_balance_base'
      )
  ) then
    raise exception 'Inventory balance was stored on the item instead of derived from the ledger.';
  end if;

  if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'pos_inventory_items'
        and column_name = 'revision'
        and data_type = 'bigint'
        and is_nullable = 'NO'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'pos_inventory_transaction_lines'
        and column_name = 'quantity_delta_base'
        and data_type = 'numeric'
        and is_nullable = 'NO'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'pos_inventory_transactions'
        and column_name = 'request_fingerprint'
        and data_type = 'text'
        and is_nullable = 'NO'
    ) then
    raise exception 'A required inventory revision, delta, or fingerprint column is missing.';
  end if;

  select procedure.pronargdefaults into v_defaults
  from pg_catalog.pg_proc as procedure
  where procedure.oid =
    'public.pos_inventory_record_transaction(uuid,uuid,text,jsonb,text,text)'::regprocedure;
  if v_defaults <> 2 then
    raise exception 'Inventory transaction RPC should default only reason/note; found % defaults.',
      v_defaults;
  end if;

  select pg_catalog.pg_get_function_result(
    'public.pos_inventory_record_transaction(uuid,uuid,text,jsonb,text,text)'::regprocedure
  ) into v_result;
  if v_result not ilike '%quantity_delta_base numeric%'
    or v_result not ilike '%balance_before_base numeric%'
    or v_result not ilike '%balance_after_base numeric%'
    or v_result not ilike '%item_revision bigint%'
    or v_result not ilike '%is_retry boolean%' then
    raise exception 'Inventory transaction result contract is incomplete: %', v_result;
  end if;

  select pg_catalog.pg_get_function_result(
    'public.pos_inventory_get_items(uuid,boolean)'::regprocedure
  ) into v_result;
  if v_result not ilike '%current_balance_base numeric%'
    or v_result not ilike '%is_low_stock boolean%'
    or v_result not ilike '%has_stock_history boolean%'
    or v_result not ilike '%initialized boolean%'
    or v_result not ilike '%revision bigint%' then
    raise exception 'Inventory item result contract is incomplete: %', v_result;
  end if;

  select pg_catalog.pg_get_function_result(
    'public.pos_inventory_get_transactions(uuid,uuid,integer)'::regprocedure
  ) into v_result;
  if v_result not ilike '%item_sequence bigint%'
    or v_result not ilike '%recorded_by_name text%'
    or v_result not ilike '%balance_before_base numeric%'
    or v_result not ilike '%balance_after_base numeric%' then
    raise exception 'Inventory history result contract is incomplete: %', v_result;
  end if;

  select (metadata.value ->> 'version')::integer,
         metadata.value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata as metadata
  where metadata.key = 'schema_version';

  if v_version is distinct from 5
    or v_name is distinct from 'inventory_phase_1_foundation' then
    raise exception 'Expected inventory schema v5, found version %, name %.',
      v_version, v_name;
  end if;
end;
$$;

select 'PASS: Inventory Phase 1 schema checks' as result;
