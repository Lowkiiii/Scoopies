-- Live Supabase Inventory Phase 1 role/RPC smoke test.
--
-- Run only through an authenticated project-owner SQL connection after the
-- inventory migration. It needs two existing Auth accounts and the main
-- costing row. Every fixture and role change is rolled back.

begin;

do $$
begin
  if (select count(*) from auth.users) < 2 then
    raise exception 'Inventory live checks need at least two existing Auth accounts.';
  end if;
  if to_regclass('public.scoopies_state') is null
    or not exists (select 1 from public.scoopies_state where id = 'main') then
    raise exception 'The main costing row is required for the checksum invariant.';
  end if;
  if not has_table_privilege('authenticated', 'public.scoopies_state', 'SELECT')
    or not has_table_privilege('authenticated', 'public.scoopies_state', 'INSERT')
    or not has_table_privilege('authenticated', 'public.scoopies_state', 'UPDATE')
    or has_table_privilege('authenticated', 'public.scoopies_state', 'DELETE')
    or has_table_privilege('authenticated', 'public.scoopies_state', 'TRUNCATE')
    or has_table_privilege('authenticated', 'public.scoopies_state', 'TRIGGER')
    or has_table_privilege('authenticated', 'public.scoopies_state', 'REFERENCES')
    or has_table_privilege('anon', 'public.scoopies_state', 'SELECT') then
    raise exception 'Live costing-state privileges are not authenticated SELECT/INSERT/UPDATE only.';
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
    ) then
    raise exception 'Live activity privileges are not authenticated SELECT/INSERT only.';
  end if;
end;
$$;

create temporary table inventory_live_context (
  owner_id uuid not null,
  owner_email text not null,
  staff_id uuid not null,
  staff_email text not null,
  business_id uuid not null,
  milk_id uuid,
  matcha_id uuid
) on commit drop;

create temporary table inventory_live_costing_before as
select
  count(*)::bigint as row_count,
  md5(string_agg(id || ':' || data::text, '|' order by id)) as checksum,
  sum(pg_column_size(data))::bigint as data_bytes
from public.scoopies_state;

create temporary table inventory_live_main_before as
select data
from public.scoopies_state
where id = 'main';

with selected_accounts as (
  select id, email, row_number() over (
    order by last_sign_in_at desc nulls last, created_at, id
  ) as account_number
  from auth.users
), fixture_business as (
  insert into public.pos_businesses (
    name, timezone, currency_code, receipt_prefix, created_by
  )
  select
    'Scoopies Inventory Live Test', 'Asia/Manila', 'PHP', 'I5L', owner.id
  from selected_accounts as owner
  where owner.account_number = 1
  returning id, created_by
)
insert into inventory_live_context (
  owner_id, owner_email, staff_id, staff_email, business_id
)
select owner.id, owner.email, staff.id, staff.email, fixture_business.id
from fixture_business
join selected_accounts as owner on owner.id = fixture_business.created_by
join selected_accounts as staff on staff.account_number = 2;

insert into public.pos_business_members (
  business_id, user_id, role, display_name
)
select business_id, owner_id, 'owner', 'Inventory Live Owner'
from inventory_live_context;

insert into public.pos_registers (business_id, name, created_by)
select business_id, 'Inventory Live Register', owner_id
from inventory_live_context;

grant select, update on table inventory_live_context to authenticated;
grant select on table inventory_live_context to anon;
grant select on table inventory_live_main_before to authenticated;

select set_config(
  'request.jwt.claim.sub',
  (select owner_id::text from inventory_live_context),
  true
);
set local role authenticated;

select public.pos_add_member_by_email(
  (select business_id from inventory_live_context),
  (select staff_email from inventory_live_context),
  'manager',
  'Inventory Live Manager'
);

-- Inventory synchronization is authoritative-only. Add the rollback-scoped
-- live fixtures to the shared cloud document before binding them, then remove
-- them through the same atomic lifecycle before the final checksum.
update public.scoopies_state as costing
set data = jsonb_set(
  costing.data,
  '{ingredients}',
  coalesce(costing.data -> 'ingredients', '[]'::jsonb)
    || jsonb_build_array(
      jsonb_build_object(
        'id', 'inventory-live-milk', 'kind', 'purchased',
        'name', 'Live Milk', 'unit', 'ml'
      ),
      jsonb_build_object(
        'id', 'inventory-live-matcha', 'kind', 'purchased',
        'name', 'Live Matcha', 'unit', 'g'
      )
    ),
  true
)
where costing.id = 'main';

with synchronized as (
  select *
  from public.pos_inventory_sync_items(
    (select business_id from inventory_live_context),
    jsonb_build_array(
      jsonb_build_object(
        'sourceCostingIngredientId', 'inventory-live-milk',
        'kind', 'purchased', 'name', 'Live Milk', 'baseUnit', 'ml'
      ),
      jsonb_build_object(
        'sourceCostingIngredientId', 'inventory-live-matcha',
        'kind', 'purchased', 'name', 'Live Matcha', 'baseUnit', 'g'
      )
    )
  )
)
update inventory_live_context
set milk_id = (
      select inventory_item_id from synchronized
      where source_costing_ingredient_id = 'inventory-live-milk'
    ),
    matcha_id = (
      select inventory_item_id from synchronized
      where source_costing_ingredient_id = 'inventory-live-matcha'
    );

-- Exercise the atomic cloud-source removal without retaining any costing-data
-- change. This source intentionally has no prior inventory sync.
update public.scoopies_state as costing
set data = jsonb_set(
  costing.data,
  '{ingredients}',
  coalesce(costing.data -> 'ingredients', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'id', 'inventory-live-atomic-delete', 'kind', 'purchased',
      'name', 'Live Atomic Delete', 'unit', 'piece'
    )),
  true
)
where costing.id = 'main';

select public.pos_inventory_prepare_source_delete(
  (select business_id from inventory_live_context),
  'inventory-live-atomic-delete', 'purchased', 'Live Atomic Delete', 'piece'
);

do $$
begin
  if exists (
    select 1
    from public.scoopies_state as costing,
      jsonb_array_elements(
        coalesce(costing.data -> 'ingredients', '[]'::jsonb)
      ) as source(value)
    where costing.id = 'main'
      and source.value ->> 'id' = 'inventory-live-atomic-delete'
  ) or (
    select count(*)
    from public.pos_inventory_get_items(
      (select business_id from inventory_live_context), true
    )
    where source_costing_ingredient_id = 'inventory-live-atomic-delete'
      and not active and revision = 1 and base_unit = 'piece'
  ) <> 1 then
    raise exception 'Live atomic source deletion did not remove the source and create its tombstone.';
  end if;
end;
$$;

create temporary table inventory_live_uninitialized_threshold as
select *
from public.pos_inventory_set_threshold(
  (select business_id from inventory_live_context),
  (select matcha_id from inventory_live_context),
  10,
  1
);

do $$
begin
  if (select revision from inventory_live_uninitialized_threshold) <> 2
    or not exists (
      select 1
      from public.pos_inventory_get_items(
        (select business_id from inventory_live_context), false
      )
      where inventory_item_id = (select matcha_id from inventory_live_context)
        and not initialized
        and not is_low_stock
        and low_stock_threshold_base = 10
        and revision = 2
    ) then
    raise exception 'Live uninitialized inventory was treated as low-stock.';
  end if;
end;
$$;

create temporary table inventory_live_matcha_opening_count as
select *
from public.pos_inventory_record_transaction(
  (select business_id from inventory_live_context),
  '56000000-0000-4000-8000-000000000004',
  'stock_count',
  jsonb_build_array(jsonb_build_object(
    'inventoryItemId', (select matcha_id from inventory_live_context),
    'quantity', 0, 'unit', 'g', 'expectedRevision', 2
  )),
  null,
  'Verified live zero opening count for threshold'
);

do $$
begin
  if (select item_revision from inventory_live_matcha_opening_count) <> 3
    or not exists (
      select 1
      from public.pos_inventory_get_items(
        (select business_id from inventory_live_context), false
      )
      where inventory_item_id = (select matcha_id from inventory_live_context)
        and initialized
        and is_low_stock
        and current_balance_base = 0
        and low_stock_threshold_base = 10
        and revision = 3
    ) then
    raise exception 'Live low-stock threshold did not activate after opening count.';
  end if;
end;
$$;

create temporary table inventory_live_opening_count as
select *
from public.pos_inventory_record_transaction(
  (select business_id from inventory_live_context),
  '56000000-0000-4000-8000-000000000001',
  'stock_count',
  jsonb_build_array(jsonb_build_object(
    'inventoryItemId', (select milk_id from inventory_live_context),
    'quantity', 1.5, 'unit', 'l', 'expectedRevision', 1
  )),
  null,
  'Verified live opening count'
);

do $$
declare
  v_business_id uuid := (select business_id from inventory_live_context);
begin
  if (select balance_after_base from inventory_live_opening_count) <> 1500
    or (select is_retry from inventory_live_opening_count) then
    raise exception 'Live owner opening count or litre conversion failed.';
  end if;

  if not (
    select retry.is_retry
    from public.pos_inventory_record_transaction(
      v_business_id,
      '56000000-0000-4000-8000-000000000001',
      'stock_count',
      jsonb_build_array(jsonb_build_object(
        'inventoryItemId', (select milk_id from inventory_live_context),
        'quantity', 1.5, 'unit', 'l', 'expectedRevision', 1
      )),
      null,
      'Verified live opening count'
    ) as retry
  ) then
    raise exception 'Live exact opening-count retry was not recognized.';
  end if;

  if (
    select current_balance_base
    from public.pos_inventory_get_items(v_business_id, false)
    where inventory_item_id = (select milk_id from inventory_live_context)
  ) <> 1500 then
    raise exception 'Live current inventory balance is incorrect.';
  end if;

  if (
    select count(*)
    from public.pos_inventory_get_transactions(
      v_business_id, (select milk_id from inventory_live_context), 20
    )
  ) <> 1 then
    raise exception 'Live owner inventory history read failed.';
  end if;

  begin
    perform 1 from public.pos_inventory_items limit 1;
    raise exception 'Live owner directly selected inventory items.';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.pos_inventory_items (
      business_id, source_costing_ingredient_id, item_kind, name, base_unit,
      created_by, updated_by
    ) values (
      v_business_id, 'forbidden-live-write', 'purchased', 'Forbidden', 'g',
      (select owner_id from inventory_live_context),
      (select owner_id from inventory_live_context)
    );
    raise exception 'Live browser owner directly inserted an inventory item.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

create temporary table inventory_live_stock_in as
select *
from public.pos_inventory_record_transaction(
  (select business_id from inventory_live_context),
  '56000000-0000-4000-8000-000000000003',
  'stock_in',
  jsonb_build_array(jsonb_build_object(
    'inventoryItemId', (select milk_id from inventory_live_context),
    'quantity', 0.5, 'unit', 'l', 'expectedRevision', 2
  )),
  null,
  'Post-count live delivery'
);

do $$
begin
  if (select balance_after_base from inventory_live_stock_in) <> 2000
    or (select is_retry from inventory_live_stock_in) then
    raise exception 'Live post-opening stock-in failed.';
  end if;
end;
$$;

select * from public.pos_inventory_set_threshold(
  (select business_id from inventory_live_context),
  (select milk_id from inventory_live_context),
  2000,
  3
);

do $$
begin
  if not (
    select is_low_stock
    from public.pos_inventory_get_items(
      (select business_id from inventory_live_context), false
    )
    where inventory_item_id = (select milk_id from inventory_live_context)
  ) then
    raise exception 'Live low-stock state is incorrect.';
  end if;
end;
$$;

-- Manager can write and inspect history.
select set_config(
  'request.jwt.claim.sub',
  (select staff_id::text from inventory_live_context),
  true
);

create temporary table inventory_live_waste as
select *
from public.pos_inventory_record_transaction(
  (select business_id from inventory_live_context),
  '56000000-0000-4000-8000-000000000002',
  'waste',
  jsonb_build_array(jsonb_build_object(
    'inventoryItemId', (select milk_id from inventory_live_context),
    'quantity', 100, 'unit', 'ml', 'expectedRevision', 4
  )),
  'Live manager waste',
  null
);

do $$
begin
  if (select balance_after_base from inventory_live_waste) <> 1900
    or (select count(*) from public.pos_inventory_get_transactions(
      (select business_id from inventory_live_context),
      (select milk_id from inventory_live_context), 20
    )) <> 3 then
    raise exception 'Live manager inventory operation or history access failed.';
  end if;

  if not public.pos_inventory_prepare_source_change(
      (select business_id from inventory_live_context),
      'inventory-live-milk', 'purchased', 'Live Milk', 'ml'
    ) then
    raise exception 'Live manager could not prepare an unchanged costing source.';
  end if;

  begin
    perform public.pos_inventory_validate_source_delete(
      (select business_id from inventory_live_context), 'inventory-live-milk'
    );
    raise exception 'Live deletion preflight allowed nonzero inventory.';
  exception when sqlstate '55000' then null;
  end;

  if not exists (
    select 1
    from public.pos_inventory_get_items(
      (select business_id from inventory_live_context), true
    )
    where inventory_item_id = (select milk_id from inventory_live_context)
      and active and current_balance_base = 1900 and revision = 5
  ) then
    raise exception 'Rejected live deletion preflight mutated inventory.';
  end if;

  if not public.pos_inventory_validate_source_delete(
      (select business_id from inventory_live_context),
      'inventory-live-matcha'
    ) or not exists (
      select 1
      from public.pos_inventory_get_items(
        (select business_id from inventory_live_context), true
      )
      where inventory_item_id = (select matcha_id from inventory_live_context)
        and active and current_balance_base = 0 and revision = 3
        and initialized and is_low_stock
    ) then
    raise exception 'Live zero-balance deletion preflight mutated inventory.';
  end if;

  begin
    perform 1 from public.pos_inventory_transactions limit 1;
    raise exception 'Live manager directly selected inventory transactions.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- After downgrade, the same account sees current stock but not ledger/staff
-- history and cannot call mutation RPCs.
reset role;
update public.pos_business_members as member
set role = 'cashier', updated_at = now()
where member.business_id = (select business_id from inventory_live_context)
  and member.user_id = (select staff_id from inventory_live_context);

select set_config(
  'request.jwt.claim.sub',
  (select staff_id::text from inventory_live_context),
  true
);
set local role authenticated;

do $$
declare
  v_business_id uuid := (select business_id from inventory_live_context);
begin
  if (select count(*) from public.pos_inventory_get_items(v_business_id, false)) <> 2 then
    raise exception 'Live cashier could not read current inventory.';
  end if;

  begin
    perform public.pos_inventory_get_items(v_business_id, true);
    raise exception 'Live cashier included inactive inventory items.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.pos_inventory_items limit 1;
    raise exception 'Live cashier directly selected inventory items.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.pos_inventory_transactions limit 1;
    raise exception 'Live cashier directly selected inventory transactions.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.pos_inventory_transaction_lines limit 1;
    raise exception 'Live cashier directly selected inventory transaction lines.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pos_inventory_get_transactions(v_business_id, null, 20);
    raise exception 'Live cashier executed inventory history RPC.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pos_inventory_record_transaction(
      v_business_id, gen_random_uuid(), 'stock_count',
      jsonb_build_array(jsonb_build_object(
        'inventoryItemId', (select matcha_id from inventory_live_context),
        'quantity', 0, 'unit', 'g', 'expectedRevision', 3
      )),
      null, null
    );
    raise exception 'Live cashier recorded inventory.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pos_inventory_prepare_source_change(
      v_business_id,
      'inventory-live-matcha', 'purchased', 'Live Matcha', 'g'
    );
    raise exception 'Live cashier prepared a costing source change.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pos_inventory_validate_source_delete(
      v_business_id, 'inventory-live-matcha'
    );
    raise exception 'Live cashier validated a costing source deletion.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Authenticated outsider and anonymous access both fail.
reset role;
select set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', true);
set local role authenticated;

do $$
begin
  begin
    perform public.pos_inventory_get_items(
      (select business_id from inventory_live_context), false
    );
    raise exception 'Live outsider read another business inventory.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;

do $$
begin
  begin
    perform 1 from public.pos_inventory_items limit 1;
    raise exception 'Live anonymous role directly selected inventory items.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pos_inventory_get_items(
      (select business_id from inventory_live_context), false
    );
    raise exception 'Live anonymous role executed inventory RPC.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

-- Reconcile the two authoritative fixtures to zero and remove them through
-- the atomic source lifecycle. Filtering only those appended IDs restores the
-- exact original JSON document for the checksum below.
select set_config(
  'request.jwt.claim.sub',
  (select owner_id::text from inventory_live_context),
  true
);
set local role authenticated;

select *
from public.pos_inventory_record_transaction(
  (select business_id from inventory_live_context),
  '56000000-0000-4000-8000-000000000005',
  'stock_count',
  jsonb_build_array(jsonb_build_object(
    'inventoryItemId', (select milk_id from inventory_live_context),
    'quantity', 0, 'unit', 'ml', 'expectedRevision', 5
  )),
  null,
  'Live fixture cleanup count'
);

select public.pos_inventory_prepare_source_delete(
  (select business_id from inventory_live_context),
  'inventory-live-milk', 'purchased', 'Live Milk', 'ml'
);
select public.pos_inventory_prepare_source_delete(
  (select business_id from inventory_live_context),
  'inventory-live-matcha', 'purchased', 'Live Matcha', 'g'
);

do $$
begin
  if exists (
      select 1
      from public.scoopies_state as costing,
        jsonb_array_elements(
          coalesce(costing.data -> 'ingredients', '[]'::jsonb)
        ) as source(value)
      where costing.id = 'main'
        and source.value ->> 'id' in (
          'inventory-live-milk', 'inventory-live-matcha',
          'inventory-live-atomic-delete'
        )
    )
    or (select count(*)
      from public.pos_inventory_get_items(
        (select business_id from inventory_live_context), true
      )
      where source_costing_ingredient_id in (
          'inventory-live-milk', 'inventory-live-matcha',
          'inventory-live-atomic-delete'
        )
        and not active) <> 3 then
    raise exception 'Live fixture cleanup did not leave only inactive tombstones.';
  end if;
end;
$$;

-- The valid legacy document may omit an empty ingredients key. After every
-- fixture source has been atomically removed and tombstoned, restore that
-- exact pre-test JSON shape through the guarded normal update.
update public.scoopies_state
set data = (select data from inventory_live_main_before)
where id = 'main';

reset role;

do $$
declare
  v_before record;
  v_after record;
begin
  select * into strict v_before from inventory_live_costing_before;
  select
    count(*)::bigint as row_count,
    md5(string_agg(id || ':' || data::text, '|' order by id)) as checksum,
    sum(pg_column_size(data))::bigint as data_bytes
    into v_after
  from public.scoopies_state;

  if v_after.row_count is distinct from v_before.row_count
    or v_after.checksum is distinct from v_before.checksum
    or v_after.data_bytes is distinct from v_before.data_bytes then
    raise exception 'Costing document changed during inventory live checks.';
  end if;
end;
$$;

select 'PASS: Inventory Phase 1 live access checks' as result;

rollback;
