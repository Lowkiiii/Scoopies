-- Destructive Inventory Phase 2B canonical-category behavior checks.
-- All fixtures and the rollback-rename simulation are rolled back.

begin;

insert into auth.users (id, email) values
  ('5b000000-0000-4000-8000-000000000001', 'inventory-2b-owner@example.test'),
  ('5b000000-0000-4000-8000-000000000002', 'inventory-2b-manager@example.test'),
  ('5b000000-0000-4000-8000-000000000003', 'inventory-2b-cashier@example.test'),
  ('5b000000-0000-4000-8000-000000000004', 'inventory-2b-outsider@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-000000000001', true);

create temporary table inventory_2b_context (
  singleton boolean primary key default true check (singleton),
  business_id uuid not null,
  milk_id uuid
);

insert into inventory_2b_context (business_id)
select public.pos_bootstrap_business(
  'Inventory Phase 2B Test', 'I2B', 'Asia/Manila'
);

select public.pos_add_member_by_email(
  (select business_id from inventory_2b_context),
  'inventory-2b-manager@example.test', 'manager', 'Inventory 2B Manager'
);
select public.pos_add_member_by_email(
  (select business_id from inventory_2b_context),
  'inventory-2b-cashier@example.test', 'cashier', 'Inventory 2B Cashier'
);

update public.scoopies_state
set data = jsonb_build_object(
  'schemaVersion', 3,
  'ingredientCategories', jsonb_build_array(
    jsonb_build_object('id', 'tea', 'name', 'Tea powders'),
    jsonb_build_object('id', 'milk', 'name', 'Milk and cream')
  ),
  'ingredients', jsonb_build_array(jsonb_build_object(
    'id', 'inventory-2b-oat-milk', 'kind', 'purchased',
    'categoryId', 'tea', 'name', 'Oat Milk', 'unit', 'l', 'price', 180
  )),
  'mixtureDrafts', '[]'::jsonb,
  'packaging', '[]'::jsonb,
  'recipes', '[]'::jsonb,
  'products', '[]'::jsonb
),
updated_at = pg_catalog.clock_timestamp()
where id = 'main';

create temporary table inventory_2b_sync as
select *
from public.pos_inventory_sync_items(
  (select business_id from inventory_2b_context),
  jsonb_build_array(jsonb_build_object(
    'sourceCostingIngredientId', 'inventory-2b-oat-milk',
    'kind', 'purchased', 'name', 'Oat Milk', 'baseUnit', 'ml'
  ))
);

update inventory_2b_context
set milk_id = (select inventory_item_id from inventory_2b_sync);

-- Cached Phase 2A clients can still read and write their legacy brand value.
create temporary table inventory_2b_legacy_update as
select *
from public.pos_inventory_update_item_details(
  (select business_id from inventory_2b_context),
  (select milk_id from inventory_2b_context),
  '  Legacy Oatside  ',
  '  First Supplier  ',
  ((pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date - 1),
  '  Before v2  ',
  'L',
  1
);

do $$
begin
  if (select brand from inventory_2b_legacy_update) <> 'Legacy Oatside'
    or (select revision from inventory_2b_legacy_update) <> 2
    or not exists (
      select 1
      from public.pos_inventory_get_items(
        (select business_id from inventory_2b_context), false
      )
      where inventory_item_id = (select milk_id from inventory_2b_context)
        and category_name = 'Tea powders'
        and brand = 'Legacy Oatside'
        and purchased_from = 'First Supplier'
        and notes = 'Before v2'
        and preferred_unit = 'l'
        and revision = 2
    ) then
    raise exception 'Canonical category or cached-client legacy brand was not exposed.';
  end if;
end;
$$;

-- Category changes belong to costing. They must appear in Stocks without an
-- inventory details call or revision change.
update public.scoopies_state
set data = jsonb_set(
  data,
  '{ingredients,0,categoryId}',
  to_jsonb('milk'::text),
  false
),
updated_at = pg_catalog.clock_timestamp()
where id = 'main';

do $$
begin
  if not exists (
    select 1
    from public.pos_inventory_get_items(
      (select business_id from inventory_2b_context), false
    )
    where inventory_item_id = (select milk_id from inventory_2b_context)
      and category_name = 'Milk and cream'
      and brand = 'Legacy Oatside'
      and revision = 2
  ) then
    raise exception 'Inventory category did not follow the costing ingredient categoryId.';
  end if;
end;
$$;

update public.scoopies_state
set data = jsonb_set(
  data,
  '{ingredientCategories,1,name}',
  to_jsonb('Milks'::text),
  false
),
updated_at = pg_catalog.clock_timestamp()
where id = 'main';

do $$
begin
  if not exists (
    select 1
    from public.pos_inventory_get_items(
      (select business_id from inventory_2b_context), false
    )
    where inventory_item_id = (select milk_id from inventory_2b_context)
      and category_name = 'Milks'
      and revision = 2
  ) then
    raise exception 'Inventory category did not follow the canonical category name.';
  end if;
end;
$$;

-- V2 edits only inventory-owned details and leaves the retained legacy value
-- and canonical category untouched.
create temporary table inventory_2b_v2_update as
select *
from public.pos_inventory_update_item_details_v2(
  (select business_id from inventory_2b_context),
  (select milk_id from inventory_2b_context),
  '  New Supplier  ',
  (pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date,
  '  Updated through v2  ',
  'ML',
  2
);

do $$
begin
  if (select purchased_from from inventory_2b_v2_update) <> 'New Supplier'
    or (select notes from inventory_2b_v2_update) <> 'Updated through v2'
    or (select preferred_unit from inventory_2b_v2_update) <> 'ml'
    or (select revision from inventory_2b_v2_update) <> 3
    or (select is_retry from inventory_2b_v2_update)
    or not exists (
      select 1
      from public.pos_inventory_get_items(
        (select business_id from inventory_2b_context), false
      )
      where inventory_item_id = (select milk_id from inventory_2b_context)
        and category_name = 'Milks'
        and brand = 'Legacy Oatside'
        and purchased_from = 'New Supplier'
        and notes = 'Updated through v2'
        and preferred_unit = 'ml'
        and revision = 3
    ) then
    raise exception 'V2 details update changed canonical category/legacy brand or normalized incorrectly.';
  end if;

  if exists (
    select 1
    from public.pos_inventory_get_transactions(
      (select business_id from inventory_2b_context),
      (select milk_id from inventory_2b_context), 10
    )
  ) then
    raise exception 'A descriptive V2 update created an inventory movement.';
  end if;
end;
$$;

create temporary table inventory_2b_v2_retry as
select *
from public.pos_inventory_update_item_details_v2(
  (select business_id from inventory_2b_context),
  (select milk_id from inventory_2b_context),
  'New Supplier',
  (pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date,
  'Updated through v2',
  'ml',
  2
);

do $$
begin
  if not (select is_retry from inventory_2b_v2_retry)
    or (select revision from inventory_2b_v2_retry) <> 3 then
    raise exception 'Exact V2 retry changed the inventory item revision.';
  end if;

  begin
    perform public.pos_inventory_update_item_details_v2(
      (select business_id from inventory_2b_context),
      (select milk_id from inventory_2b_context),
      'Stale Supplier',
      (pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date,
      'Updated through v2', 'ml', 2
    );
    raise exception 'Stale changed V2 update was accepted.';
  exception when sqlstate '40001' then null;
  end;

  begin
    perform public.pos_inventory_update_item_details_v2(
      (select business_id from inventory_2b_context),
      (select milk_id from inventory_2b_context),
      'New Supplier',
      ((pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date + 1),
      'Updated through v2', 'ml', 3
    );
    raise exception 'V2 accepted a future date in the business timezone.';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.pos_inventory_update_item_details_v2(
      (select business_id from inventory_2b_context),
      (select milk_id from inventory_2b_context),
      'New Supplier',
      (pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date,
      'Updated through v2', 'kg', 3
    );
    raise exception 'V2 accepted a weight unit for a volume item.';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

-- Cached v1 clients remain operational after a V2 edit.
create temporary table inventory_2b_cached_update as
select *
from public.pos_inventory_update_item_details(
  (select business_id from inventory_2b_context),
  (select milk_id from inventory_2b_context),
  'Cached Brand', 'New Supplier',
  (pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date,
  'Updated through v2', 'ml', 3
);

do $$
begin
  if (select brand from inventory_2b_cached_update) <> 'Cached Brand'
    or (select revision from inventory_2b_cached_update) <> 4
    or not exists (
      select 1
      from public.pos_inventory_get_items(
        (select business_id from inventory_2b_context), false
      )
      where inventory_item_id = (select milk_id from inventory_2b_context)
        and category_name = 'Milks'
        and brand = 'Cached Brand'
        and revision = 4
    ) then
    raise exception 'Cached v1 compatibility no longer maps to the retained legacy value.';
  end if;
end;
$$;

-- Cashiers and outsiders cannot use V2.
select set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.pos_inventory_update_item_details_v2(
      (select business_id from inventory_2b_context),
      (select milk_id from inventory_2b_context),
      null, null, null, 'ml', 4
    );
    raise exception 'Cashier changed inventory details through V2.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-000000000004', true);
do $$
begin
  begin
    perform public.pos_inventory_update_item_details_v2(
      (select business_id from inventory_2b_context),
      (select milk_id from inventory_2b_context),
      null, null, null, 'ml', 4
    );
    raise exception 'Outsider changed inventory details through V2.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform public.pos_inventory_update_item_details_v2(
      (select business_id from inventory_2b_context),
      (select milk_id from inventory_2b_context),
      null, null, null, 'ml', 4
    );
    raise exception 'Anonymous caller executed V2.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Exercise the rollback's physical rename path inside this disposable
-- transaction. The value and all unrelated details must survive both names.
reset role;

do $$
begin
  if not exists (
    select 1 from public.pos_inventory_items as item
    where item.id = (select milk_id from inventory_2b_context)
      and item.legacy_brand = 'Cached Brand'
      and item.purchased_from = 'New Supplier'
      and item.revision = 4
  ) then
    raise exception 'Pre-rollback retained data fixture is incomplete.';
  end if;
end;
$$;

alter table public.pos_inventory_items
  rename column legacy_brand to brand;
alter table public.pos_inventory_items
  rename constraint pos_inventory_items_legacy_brand_check
  to pos_inventory_items_brand_check;

do $$
begin
  if not exists (
    select 1 from public.pos_inventory_items as item
    where item.id = (select milk_id from inventory_2b_context)
      and item.brand = 'Cached Brand'
      and item.purchased_from = 'New Supplier'
      and item.notes = 'Updated through v2'
      and item.preferred_unit = 'ml'
      and item.revision = 4
  ) then
    raise exception 'Rollback rename lost legacy brand or item details.';
  end if;
end;
$$;

alter table public.pos_inventory_items
  rename column brand to legacy_brand;
alter table public.pos_inventory_items
  rename constraint pos_inventory_items_brand_check
  to pos_inventory_items_legacy_brand_check;

do $$
begin
  if not exists (
    select 1 from public.pos_inventory_items as item
    where item.id = (select milk_id from inventory_2b_context)
      and item.legacy_brand = 'Cached Brand'
      and item.purchased_from = 'New Supplier'
      and item.revision = 4
  ) then
    raise exception 'Forward rename after rollback simulation lost retained data.';
  end if;
end;
$$;

rollback;

select 'PASS: Inventory Phase 2B canonical-category behavior checks' as result;
