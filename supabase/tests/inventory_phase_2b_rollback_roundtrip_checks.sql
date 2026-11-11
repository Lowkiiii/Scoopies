-- Destructive disposable-database check for the complete Phase 2B rollback.
-- This file commits a fixture, executes the real rollback, reapplies migration
-- 012, and proves the retained value and item details survive both directions.
-- Never run this round-trip test against production.

insert into auth.users (id, email) values
  ('5c000000-0000-4000-8000-000000000001', 'inventory-2b-roundtrip@example.test');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-000000000001', true);

create temporary table inventory_2b_roundtrip_context (
  singleton boolean primary key default true check (singleton),
  business_id uuid not null,
  item_id uuid
);

insert into inventory_2b_roundtrip_context (business_id)
select public.pos_bootstrap_business(
  'Inventory Phase 2B Rollback Test', 'I2R', 'Asia/Manila'
);

update public.scoopies_state
set data = jsonb_build_object(
  'schemaVersion', 3,
  'ingredientCategories', jsonb_build_array(
    jsonb_build_object('id', 'roundtrip-milk', 'name', 'Round-trip milk')
  ),
  'ingredients', jsonb_build_array(jsonb_build_object(
    'id', 'inventory-2b-roundtrip-source',
    'kind', 'purchased',
    'categoryId', 'roundtrip-milk',
    'name', 'Round-trip Oat Milk',
    'unit', 'l',
    'price', 180
  )),
  'mixtureDrafts', '[]'::jsonb,
  'packaging', '[]'::jsonb,
  'recipes', '[]'::jsonb,
  'products', '[]'::jsonb
),
updated_at = pg_catalog.clock_timestamp()
where id = 'main';

create temporary table inventory_2b_roundtrip_sync as
select *
from public.pos_inventory_sync_items(
  (select business_id from inventory_2b_roundtrip_context),
  jsonb_build_array(jsonb_build_object(
    'sourceCostingIngredientId', 'inventory-2b-roundtrip-source',
    'kind', 'purchased', 'name', 'Round-trip Oat Milk', 'baseUnit', 'ml'
  ))
);

update inventory_2b_roundtrip_context
set item_id = (select inventory_item_id from inventory_2b_roundtrip_sync);

select *
from public.pos_inventory_update_item_details(
  (select business_id from inventory_2b_roundtrip_context),
  (select item_id from inventory_2b_roundtrip_context),
  'Round-trip Legacy Brand',
  'Round-trip Supplier',
  (pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date,
  'Must survive rollback',
  'l',
  1
);
commit;

\ir ../rollback/202611110012_inventory_phase_2b_category.rollback.sql

do $$
begin
  if not exists (
    select 1
    from public.pos_inventory_items as item
    where item.id = (select item_id from inventory_2b_roundtrip_context)
      and item.brand = 'Round-trip Legacy Brand'
      and item.purchased_from = 'Round-trip Supplier'
      and item.notes = 'Must survive rollback'
      and item.preferred_unit = 'l'
      and item.revision = 2
  ) then
    raise exception 'The real Phase 2B rollback lost retained item data.';
  end if;

  if (
    select (metadata.value ->> 'version')::integer
    from public.pos_system_metadata as metadata
    where metadata.key = 'schema_version'
  ) is distinct from 11 then
    raise exception 'The Phase 2B rollback did not restore schema 11.';
  end if;
end;
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-000000000001', true);
do $$
begin
  if not exists (
    select 1
    from public.pos_inventory_get_items(
      (select business_id from inventory_2b_roundtrip_context), false
    )
    where inventory_item_id = (select item_id from inventory_2b_roundtrip_context)
      and brand = 'Round-trip Legacy Brand'
      and purchased_from = 'Round-trip Supplier'
      and revision = 2
  ) then
    raise exception 'The restored schema-11 RPC lost the retained brand alias.';
  end if;
end;
$$;
commit;

\ir ../migrations/202611110012_inventory_phase_2b_category.sql

do $$
begin
  if not exists (
    select 1
    from public.pos_inventory_items as item
    where item.id = (select item_id from inventory_2b_roundtrip_context)
      and item.legacy_brand = 'Round-trip Legacy Brand'
      and item.purchased_from = 'Round-trip Supplier'
      and item.notes = 'Must survive rollback'
      and item.preferred_unit = 'l'
      and item.revision = 2
  ) then
    raise exception 'Reapplying Phase 2B lost retained item data.';
  end if;
end;
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-000000000001', true);
do $$
begin
  if not exists (
    select 1
    from public.pos_inventory_get_items(
      (select business_id from inventory_2b_roundtrip_context), false
    )
    where inventory_item_id = (select item_id from inventory_2b_roundtrip_context)
      and category_name = 'Round-trip milk'
      and brand = 'Round-trip Legacy Brand'
      and purchased_from = 'Round-trip Supplier'
      and revision = 2
  ) then
    raise exception 'Reapplied Phase 2B did not restore category plus compatibility data.';
  end if;
end;
$$;
commit;

select 'PASS: Inventory Phase 2B real rollback/reapply is lossless' as result;
