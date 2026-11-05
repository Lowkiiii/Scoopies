-- Destructive Inventory Phase 2A behavior checks for a disposable database.
-- All fixtures are rolled back.

begin;

insert into auth.users (id, email) values
  ('5a000000-0000-4000-8000-000000000001', 'inventory-2a-owner@example.test'),
  ('5a000000-0000-4000-8000-000000000002', 'inventory-2a-manager@example.test'),
  ('5a000000-0000-4000-8000-000000000003', 'inventory-2a-cashier@example.test'),
  ('5a000000-0000-4000-8000-000000000004', 'inventory-2a-outsider@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000001', true);

create temporary table inventory_2a_context (
  singleton boolean primary key default true check (singleton),
  business_id uuid not null,
  milk_id uuid
);

insert into inventory_2a_context (business_id)
select public.pos_bootstrap_business(
  'Inventory Phase 2A Test', 'I2A', 'Asia/Manila'
);

select public.pos_add_member_by_email(
  (select business_id from inventory_2a_context),
  'inventory-2a-manager@example.test', 'manager', 'Inventory 2A Manager'
);
select public.pos_add_member_by_email(
  (select business_id from inventory_2a_context),
  'inventory-2a-cashier@example.test', 'cashier', 'Inventory 2A Cashier'
);

update public.scoopies_state
set data = jsonb_build_object(
  'schemaVersion', 3,
  'ingredientCategories', '[]'::jsonb,
  'ingredients', jsonb_build_array(jsonb_build_object(
    'id', 'inventory-2a-oat-milk', 'kind', 'purchased',
    'name', 'Oat Milk', 'unit', 'l', 'price', 180
  )),
  'mixtureDrafts', '[]'::jsonb,
  'packaging', '[]'::jsonb,
  'recipes', '[]'::jsonb,
  'products', '[]'::jsonb
),
updated_at = pg_catalog.clock_timestamp()
where id = 'main';

create temporary table inventory_2a_sync as
select *
from public.pos_inventory_sync_items(
  (select business_id from inventory_2a_context),
  jsonb_build_array(jsonb_build_object(
    'sourceCostingIngredientId', 'inventory-2a-oat-milk',
    'kind', 'purchased', 'name', 'Oat Milk', 'baseUnit', 'ml'
  ))
);

update inventory_2a_context
set milk_id = (select inventory_item_id from inventory_2a_sync);

do $$
begin
  if not exists (
    select 1
    from public.pos_inventory_get_items(
      (select business_id from inventory_2a_context), false
    )
    where inventory_item_id = (select milk_id from inventory_2a_context)
      and base_unit = 'ml'
      and preferred_unit = 'ml'
      and brand is null
      and purchased_from is null
      and last_stocked_on is null
      and notes is null
      and revision = 1
  ) then
    raise exception 'New inventory item did not expose safe default Phase 2A details.';
  end if;
end;
$$;

create temporary table inventory_2a_first_update as
select *
from public.pos_inventory_update_item_details(
  (select business_id from inventory_2a_context),
  (select milk_id from inventory_2a_context),
  '  Oatside  ',
  '  Local Supplier  ',
  (current_date - 1)::date,
  '  Main milk stock  ',
  'L',
  1
);

do $$
begin
  if (select brand from inventory_2a_first_update) <> 'Oatside'
    or (select purchased_from from inventory_2a_first_update) <> 'Local Supplier'
    or (select notes from inventory_2a_first_update) <> 'Main milk stock'
    or (select preferred_unit from inventory_2a_first_update) <> 'l'
    or (select last_stocked_on from inventory_2a_first_update)
      is distinct from (current_date - 1)::date
    or (select revision from inventory_2a_first_update) <> 2
    or (select is_retry from inventory_2a_first_update) then
    raise exception 'Item-detail update did not trim, normalize, or revise correctly.';
  end if;

  if not exists (
    select 1
    from public.pos_inventory_get_items(
      (select business_id from inventory_2a_context), false
    )
    where inventory_item_id = (select milk_id from inventory_2a_context)
      and base_unit = 'ml' and preferred_unit = 'l'
      and brand = 'Oatside' and purchased_from = 'Local Supplier'
      and last_stocked_on = (current_date - 1)::date
      and notes = 'Main milk stock' and revision = 2
  ) then
    raise exception 'Expanded item read did not return saved Phase 2A details.';
  end if;
end;
$$;

-- An exact retry succeeds even when it repeats the original expected revision.
create temporary table inventory_2a_retry as
select *
from public.pos_inventory_update_item_details(
  (select business_id from inventory_2a_context),
  (select milk_id from inventory_2a_context),
  'Oatside', 'Local Supplier', (current_date - 1)::date,
  'Main milk stock', 'l', 1
);

do $$
begin
  if not (select is_retry from inventory_2a_retry)
    or (select revision from inventory_2a_retry) <> 2 then
    raise exception 'Exact item-detail retry changed the revision.';
  end if;

  begin
    perform public.pos_inventory_update_item_details(
      (select business_id from inventory_2a_context),
      (select milk_id from inventory_2a_context),
      'Different Brand', 'Local Supplier', (current_date - 1)::date,
      'Main milk stock', 'l', 1
    );
    raise exception 'Stale changed item-detail update was accepted.';
  exception when sqlstate '40001' then null;
  end;

  begin
    perform public.pos_inventory_update_item_details(
      (select business_id from inventory_2a_context),
      (select milk_id from inventory_2a_context),
      'Oatside', 'Local Supplier', (current_date - 1)::date,
      'Main milk stock', 'kg', 2
    );
    raise exception 'A weight display unit was accepted for a volume item.';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.pos_inventory_update_item_details(
      (select business_id from inventory_2a_context),
      (select milk_id from inventory_2a_context),
      'Oatside', 'Local Supplier', (current_date + 1)::date,
      'Main milk stock', 'l', 2
    );
    raise exception 'A future stocked date was accepted.';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

-- A compatible unit change remains descriptive only and does not alter the
-- canonical base unit or create a ledger movement.
create temporary table inventory_2a_unit_update as
select *
from public.pos_inventory_update_item_details(
  (select business_id from inventory_2a_context),
  (select milk_id from inventory_2a_context),
  'Oatside', 'Local Supplier', (current_date - 1)::date,
  'Main milk stock', 'ml', 2
);

do $$
begin
  if (select preferred_unit from inventory_2a_unit_update) <> 'ml'
    or (select revision from inventory_2a_unit_update) <> 3
    or exists (
      select 1
      from public.pos_inventory_get_transactions(
        (select business_id from inventory_2a_context),
        (select milk_id from inventory_2a_context), 10
      )
    )
    or not exists (
      select 1
      from public.pos_inventory_get_items(
        (select business_id from inventory_2a_context), false
      )
      where inventory_item_id = (select milk_id from inventory_2a_context)
        and base_unit = 'ml' and preferred_unit = 'ml' and revision = 3
    ) then
    raise exception 'Preferred-unit update changed canonical identity or inventory history.';
  end if;
end;
$$;

-- Cashiers and outsiders can read permitted inventory quantities but cannot
-- edit profile details. Anonymous callers cannot execute the RPC at all.
select set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000003', true);

do $$
begin
  begin
    perform public.pos_inventory_update_item_details(
      (select business_id from inventory_2a_context),
      (select milk_id from inventory_2a_context),
      'Oatside', 'Local Supplier', current_date,
      'Cashier edit', 'ml', 3
    );
    raise exception 'Cashier changed inventory item details.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000004', true);

do $$
begin
  begin
    perform public.pos_inventory_update_item_details(
      (select business_id from inventory_2a_context),
      (select milk_id from inventory_2a_context),
      'Oatside', 'Local Supplier', current_date,
      'Outsider edit', 'ml', 3
    );
    raise exception 'Outsider changed inventory item details.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;

do $$
begin
  begin
    perform public.pos_inventory_update_item_details(
      (select business_id from inventory_2a_context),
      (select milk_id from inventory_2a_context),
      null, null, null, null, 'ml', 3
    );
    raise exception 'Anonymous caller executed the item-details RPC.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;

select 'PASS: Inventory Phase 2A behavior checks' as result;
