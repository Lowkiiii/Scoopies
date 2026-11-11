-- Non-destructive schema checks for inventory schema 14.

do $$
declare
  v_version integer;
  v_name text;
  v_category_definition text;
  v_sheet_definition text;
begin
  select (value ->> 'version')::integer, value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata where key = 'schema_version';
  if v_version <> 14 or v_name <> 'inventory_manual_categories' then
    raise exception 'Expected schema 14 inventory_manual_categories, found %:%.',
      v_version, v_name;
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.pos_inventory_items'::regclass
      and attname = 'inventory_category' and not attisdropped
      and atttypid = 'text'::regtype and not attnotnull
  ) then
    raise exception 'Nullable inventory-owned category column is missing.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pos_inventory_items'::regclass
      and conname = 'pos_inventory_items_inventory_category_check'
  ) then
    raise exception 'Inventory category validation constraint is missing.';
  end if;

  if to_regprocedure(
    'public.pos_inventory_update_item_category(uuid,uuid,text,bigint)'
  ) is null or to_regprocedure(
    'public.pos_inventory_update_item_row_color(uuid,uuid,text,bigint)'
  ) is null then
    raise exception 'Period-independent item-profile RPCs are missing.';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.pos_inventory_update_item_category(uuid,uuid,text,bigint)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.pos_inventory_update_item_row_color(uuid,uuid,text,bigint)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated callers cannot execute item-profile RPCs.';
  end if;
  if has_function_privilege(
    'anon',
    'public.pos_inventory_update_item_category(uuid,uuid,text,bigint)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.pos_inventory_update_item_row_color(uuid,uuid,text,bigint)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous callers can execute item-profile mutation RPCs.';
  end if;
  if has_table_privilege(
    'authenticated', 'public.pos_inventory_items', 'UPDATE'
  ) then
    raise exception 'Browser roles received forbidden direct item updates.';
  end if;

  select pg_get_functiondef(
    'public.pos_inventory_update_item_category(uuid,uuid,text,bigint)'::regprocedure
  ) into v_category_definition;
  if v_category_definition not ilike '%inventory_category%'
    or v_category_definition ilike '%pos_inventory_period%' then
    raise exception 'Category RPC is not inventory-owned and period-independent.';
  end if;

  select pg_get_functiondef(
    'public.pos_inventory_get_spreadsheet(uuid,uuid)'::regprocedure
  ) into v_sheet_definition;
  if v_sheet_definition not ilike '%inventory_category%'
    or v_sheet_definition ilike '%then ''Packaging''::text%' then
    raise exception 'Spreadsheet still derives or hardcodes stock categories.';
  end if;
end;
$$;
