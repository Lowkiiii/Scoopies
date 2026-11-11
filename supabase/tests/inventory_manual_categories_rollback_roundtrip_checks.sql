-- Destructive disposable-database check for schema-14 rollback and reapply.
-- The fixture is created while schema 13 is active so reapply proves the exact
-- category backfill for all source kinds.
\set ON_ERROR_STOP on

\ir ../rollback/202611120014_inventory_manual_categories.rollback.sql

do $$
begin
  if not exists (
    select 1 from public.pos_system_metadata
    where key = 'schema_version'
      and (value ->> 'version')::integer = 13
      and value ->> 'name' = 'inventory_period_spreadsheet'
  ) or exists (
    select 1 from pg_attribute
    where attrelid = 'public.pos_inventory_items'::regclass
      and attname = 'inventory_category' and not attisdropped
  ) then
    raise exception 'Schema-14 rollback did not restore schema 13.';
  end if;
end;
$$;

insert into auth.users (id, email) values
  ('14f00000-0000-4000-8000-000000000001', 'inventory14-backfill@example.test');
insert into public.pos_businesses (
  id, name, timezone, currency_code, receipt_prefix, created_by
) values (
  '14f00000-0000-4000-8000-000000000010',
  'Inventory 14 Backfill', 'Asia/Manila', 'PHP', 'I14F',
  '14f00000-0000-4000-8000-000000000001'
);
insert into public.pos_business_members (
  business_id, user_id, role, display_name
) values (
  '14f00000-0000-4000-8000-000000000010',
  '14f00000-0000-4000-8000-000000000001',
  'owner', 'Backfill Owner'
);

update public.scoopies_state
set data = jsonb_set(
      jsonb_set(
        data,
        '{ingredientCategories}',
        coalesce(data -> 'ingredientCategories', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'id', 'i14-backfill-category-id',
            'name', 'Backfilled Matcha')),
        true
      ),
      '{ingredients}',
      coalesce(data -> 'ingredients', '[]'::jsonb)
        || jsonb_build_array(
          jsonb_build_object(
            'id', 'i14-backfill-category', 'kind', 'purchased',
            'name', 'Categorized Source', 'categoryId', 'i14-backfill-category-id',
            'purchaseQty', 1, 'amountPerItem', 10, 'unit', 'g', 'price', 10),
          jsonb_build_object(
            'id', 'i14-backfill-uncategorized', 'kind', 'purchased',
            'name', 'Uncategorized Source',
            'purchaseQty', 1, 'amountPerItem', 10, 'unit', 'g', 'price', 10)
        ),
      true
    ),
    updated_at = clock_timestamp()
where id = 'main';

insert into public.pos_inventory_items (
  business_id, source_costing_ingredient_id, source_type, source_costing_id,
  item_kind, name, base_unit, active, legacy_brand, created_by, updated_by
) values
  (
    '14f00000-0000-4000-8000-000000000010',
    'i14-backfill-category', 'ingredient', 'i14-backfill-category',
    'purchased', 'Categorized Source', 'g', true, 'Preserved legacy value',
    '14f00000-0000-4000-8000-000000000001',
    '14f00000-0000-4000-8000-000000000001'
  ),
  (
    '14f00000-0000-4000-8000-000000000010',
    'i14-backfill-uncategorized', 'ingredient', 'i14-backfill-uncategorized',
    'purchased', 'Uncategorized Source', 'g', true, null,
    '14f00000-0000-4000-8000-000000000001',
    '14f00000-0000-4000-8000-000000000001'
  ),
  (
    '14f00000-0000-4000-8000-000000000010',
    'i14-backfill-removed', 'ingredient', 'i14-backfill-removed',
    'purchased', 'Removed Source', 'g', false, null,
    '14f00000-0000-4000-8000-000000000001',
    '14f00000-0000-4000-8000-000000000001'
  ),
  (
    '14f00000-0000-4000-8000-000000000010',
    'packaging:i14-backfill-cup', 'packaging', 'i14-backfill-cup',
    'packaging', 'Backfill Cup', 'piece', true, null,
    '14f00000-0000-4000-8000-000000000001',
    '14f00000-0000-4000-8000-000000000001'
  );

\ir ../migrations/202611120014_inventory_manual_categories.sql

do $$
begin
  if not exists (
    select 1 from public.pos_system_metadata
    where key = 'schema_version'
      and (value ->> 'version')::integer = 14
      and value ->> 'name' = 'inventory_manual_categories'
  ) then
    raise exception 'Schema 14 did not reapply after rollback.';
  end if;
  if not exists (
    select 1 from public.pos_inventory_items
    where source_costing_id = 'i14-backfill-category'
      and inventory_category = 'Backfilled Matcha'
      and legacy_brand = 'Preserved legacy value'
  ) or not exists (
    select 1 from public.pos_inventory_items
    where source_costing_id = 'i14-backfill-uncategorized'
      and inventory_category = 'Uncategorized'
  ) or not exists (
    select 1 from public.pos_inventory_items
    where source_costing_id = 'i14-backfill-removed'
      and inventory_category = 'Removed from costing'
      and active = false
  ) or not exists (
    select 1 from public.pos_inventory_items
    where source_type = 'packaging' and source_costing_id = 'i14-backfill-cup'
      and inventory_category = 'Packaging'
  ) then
    raise exception 'Schema-14 category backfill was incomplete or lossy.';
  end if;
end;
$$;
