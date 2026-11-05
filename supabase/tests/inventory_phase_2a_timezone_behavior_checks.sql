-- Destructive behavior checks for business-local inventory dates.
-- All fixtures are rolled back.

begin;

insert into auth.users (id, email) values
  ('5b000000-0000-4000-8000-000000000001', 'inventory-2a-timezone-owner@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-000000000001', true);

create temporary table inventory_2a_timezone_context (
  singleton boolean primary key default true check (singleton),
  business_id uuid not null,
  item_id uuid,
  business_today date not null
);

insert into inventory_2a_timezone_context (business_id, business_today)
select public.pos_bootstrap_business(
         'Inventory Phase 2A Timezone Test', 'I2T', 'Asia/Manila'
       ),
       (pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date;

update public.scoopies_state
set data = jsonb_build_object(
  'schemaVersion', 3,
  'ingredientCategories', '[]'::jsonb,
  'ingredients', jsonb_build_array(jsonb_build_object(
    'id', 'inventory-2a-timezone-milk', 'kind', 'purchased',
    'name', 'Timezone Milk', 'unit', 'l', 'price', 180
  )),
  'mixtureDrafts', '[]'::jsonb,
  'packaging', '[]'::jsonb,
  'recipes', '[]'::jsonb,
  'products', '[]'::jsonb
),
updated_at = pg_catalog.clock_timestamp()
where id = 'main';

create temporary table inventory_2a_timezone_sync as
select *
from public.pos_inventory_sync_items(
  (select business_id from inventory_2a_timezone_context),
  jsonb_build_array(jsonb_build_object(
    'sourceCostingIngredientId', 'inventory-2a-timezone-milk',
    'kind', 'purchased', 'name', 'Timezone Milk', 'baseUnit', 'ml'
  ))
);

update inventory_2a_timezone_context
set item_id = (select inventory_item_id from inventory_2a_timezone_sync);

-- Force a session timezone unrelated to the business. The RPC must continue
-- to use Asia/Manila for its calendar boundary.
select set_config('TimeZone', 'Etc/GMT+12', true);

create temporary table inventory_2a_timezone_update as
select *
from public.pos_inventory_update_item_details(
  (select business_id from inventory_2a_timezone_context),
  (select item_id from inventory_2a_timezone_context),
  'Timezone Brand',
  'Timezone Supplier',
  (select business_today from inventory_2a_timezone_context),
  'Business-local today',
  'l',
  1
);

do $$
begin
  if (select last_stocked_on from inventory_2a_timezone_update)
      is distinct from (select business_today from inventory_2a_timezone_context)
    or (select revision from inventory_2a_timezone_update) <> 2 then
    raise exception 'Asia/Manila local-today stock date was not saved.';
  end if;

  begin
    perform public.pos_inventory_update_item_details(
      (select business_id from inventory_2a_timezone_context),
      (select item_id from inventory_2a_timezone_context),
      'Timezone Brand',
      'Timezone Supplier',
      (select business_today + 1 from inventory_2a_timezone_context),
      'Business-local future date',
      'l',
      2
    );
    raise exception 'A date after the Asia/Manila local date was accepted.';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

rollback;

select 'PASS: Inventory Phase 2A timezone behavior checks' as result;
