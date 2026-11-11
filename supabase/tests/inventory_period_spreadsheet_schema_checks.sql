-- Non-destructive schema checks for inventory schema 13.

do $$
declare
  v_version integer;
  v_name text;
  v_result text;
begin
  select (value ->> 'version')::integer, value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata where key = 'schema_version';
  if v_version <> 13 or v_name <> 'inventory_period_spreadsheet' then
    raise exception 'Expected schema 13 inventory_period_spreadsheet, found %:%.',
      v_version, v_name;
  end if;

  if to_regclass('public.pos_inventory_periods') is null
    or to_regclass('public.pos_inventory_period_items') is null
    or to_regclass('public.pos_inventory_cell_events') is null
    or to_regclass('public.pos_inventory_exceptions') is null then
    raise exception 'One or more schema-13 inventory tables are missing.';
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.pos_inventory_items'::regclass
      and attname = 'source_type' and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
    where attrelid = 'public.pos_inventory_items'::regclass
      and attname = 'row_color_hex' and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
    where attrelid = 'public.pos_inventory_items'::regclass
      and attname = 'purchase_price_centavos' and not attisdropped
  ) then
    raise exception 'Spreadsheet item profile columns are missing.';
  end if;

  if to_regprocedure('public.pos_inventory_start_period(uuid,uuid,text,boolean)') is null
    or to_regprocedure('public.pos_inventory_close_period(uuid,uuid,uuid,text)') is null
    or to_regprocedure('public.pos_inventory_set_spreadsheet_cell(uuid,uuid,uuid,uuid,text,text,bigint,bigint)') is null
    or to_regprocedure('public.pos_inventory_get_spreadsheet(uuid,uuid)') is null
    or to_regprocedure('public.pos_inventory_sync_spreadsheet_sources(uuid)') is null then
    raise exception 'One or more schema-13 public RPCs are missing.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.pos_sale_events'::regclass
      and tgname = 'pos_inventory_sale_events_apply' and not tgisinternal
  ) then
    raise exception 'Sale-event inventory trigger is missing.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.pos_inventory_items'::regclass
      and tgname = 'pos_inventory_items_fill_source_identity' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.pos_inventory_transactions'::regclass
      and tgname = 'pos_inventory_transactions_period_guard' and not tgisinternal
  ) then
    raise exception 'A rolling-deployment compatibility trigger is missing.';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'pos_inventory_periods_one_open_uq'
      and indexdef ilike '%where (status = ''open''%'
  ) then
    raise exception 'One-open-period partial uniqueness is missing.';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'pos_inventory_transactions_sale_usage_uq'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'pos_inventory_transactions_sale_event_uq'
  ) then
    raise exception 'Automatic movement idempotency indexes are missing.';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'pos_inventory_items_ingredient_compat_source_uq'
  ) then
    raise exception 'Legacy ingredient identity uniqueness is missing.';
  end if;
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.pos_inventory_period_items'::regclass
      and attname = 'opening_quantity_base' and attnotnull
  ) then
    raise exception 'Opening stock cannot distinguish blank from explicit zero.';
  end if;

  select pg_get_function_result(
    'public.pos_inventory_get_spreadsheet(uuid,uuid)'::regprocedure
  ) into v_result;
  if v_result not ilike '%opening_stock_base numeric%'
    or v_result not ilike '%purchase_price_centavos bigint%'
    or v_result not ilike '%cost_per_unit_centavos numeric%'
    or v_result not ilike '%active_period_opened_at timestamp with time zone%'
    or v_result not ilike '%row_color text%'
    or v_result ilike '%opening_stock numeric%' then
    raise exception 'Spreadsheet RPC does not expose canonical base/centavo columns: %',
      v_result;
  end if;

  if has_table_privilege('authenticated', 'public.pos_inventory_periods', 'INSERT')
    or has_table_privilege('authenticated', 'public.pos_inventory_period_items', 'UPDATE')
    or has_table_privilege('authenticated', 'public.pos_inventory_cell_events', 'DELETE')
    or has_table_privilege('authenticated', 'public.pos_inventory_exceptions', 'INSERT') then
    raise exception 'Browser roles received forbidden direct mutation privileges.';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.pos_inventory_get_spreadsheet(uuid,uuid)', 'EXECUTE'
  ) then
    raise exception 'Authenticated users cannot execute the spreadsheet read RPC.';
  end if;
  if has_function_privilege(
    'authenticated',
    'public._pos_inventory_sale_event_trigger()', 'EXECUTE'
  ) then
    raise exception 'Internal sale-event trigger is browser executable.';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.pos_inventory_fill_source_identity()', 'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.pos_inventory_guard_legacy_period_movement()', 'EXECUTE'
  ) then
    raise exception 'Compatibility trigger helpers are browser executable.';
  end if;
end;
$$;
