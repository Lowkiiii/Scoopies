-- Destructive Inventory Phase 1 behavior checks for a disposable database.
-- All fixtures and ledger rows are wrapped in one transaction and rolled back.

begin;

insert into auth.users (id, email) values
  ('55000000-0000-4000-8000-000000000001', 'inventory-owner@example.test'),
  ('55000000-0000-4000-8000-000000000002', 'inventory-manager@example.test'),
  ('55000000-0000-4000-8000-000000000003', 'inventory-cashier@example.test'),
  ('55000000-0000-4000-8000-000000000004', 'inventory-outsider@example.test'),
  ('55000000-0000-4000-8000-000000000005', 'inventory-other-owner@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '55000000-0000-4000-8000-000000000001', true);

create temporary table inventory_context (
  singleton boolean primary key default true check (singleton),
  business_id uuid not null,
  milk_id uuid,
  matcha_id uuid,
  mixture_id uuid,
  vanilla_id uuid
);

insert into inventory_context (business_id)
select public.pos_bootstrap_business(
  'Inventory Phase 1 Test', 'I5T', 'Asia/Manila'
);

select public.pos_add_member_by_email(
  (select business_id from inventory_context),
  'inventory-manager@example.test', 'manager', 'Inventory Manager'
);
select public.pos_add_member_by_email(
  (select business_id from inventory_context),
  'inventory-cashier@example.test', 'cashier', 'Inventory Cashier'
);

-- Use a controlled costing document inside this rollback-only suite. Inventory
-- synchronization must bind only sources present in this latest cloud row.
update public.scoopies_state
set data = jsonb_build_object(
  'schemaVersion', 3,
  'testMarker', jsonb_build_object('preserve', true),
  'ingredientCategories', '[]'::jsonb,
  'ingredients', jsonb_build_array(
    jsonb_build_object(
      'id', 'ingredient-milk', 'kind', 'purchased',
      'name', 'Regular Milk', 'unit', 'ml', 'price', 120
    ),
    jsonb_build_object(
      'id', 'ingredient-matcha', 'kind', 'purchased',
      'name', 'Matcha Powder', 'unit', 'g', 'price', 1360
    ),
    jsonb_build_object(
      'id', 'mixture-sea-salt-cream', 'kind', 'mixture',
      'name', 'Sea Salt Cream', 'unit', 'ml', 'components', '[]'::jsonb
    ),
    jsonb_build_object(
      'id', 'ingredient-vanilla', 'kind', 'purchased',
      'name', 'Vanilla', 'unit', 'ml', 'price', 100
    )
  ),
  'mixtureDrafts', '[]'::jsonb,
  'packaging', '[]'::jsonb,
  'recipes', '[]'::jsonb,
  'products', '[]'::jsonb
),
updated_at = pg_catalog.clock_timestamp()
where id = 'main';

create temporary table inventory_first_sync as
select *
from public.pos_inventory_sync_items(
  (select business_id from inventory_context),
  jsonb_build_array(
    jsonb_build_object(
      'sourceCostingIngredientId', 'ingredient-milk',
      'kind', 'purchased', 'name', 'Regular Milk', 'baseUnit', 'ml'
    ),
    jsonb_build_object(
      'sourceCostingIngredientId', 'ingredient-matcha',
      'kind', 'purchased', 'name', 'Matcha Powder', 'baseUnit', 'g'
    ),
    jsonb_build_object(
      'sourceCostingIngredientId', 'mixture-sea-salt-cream',
      'kind', 'mixture', 'name', 'Sea Salt Cream', 'baseUnit', 'ml'
    ),
    jsonb_build_object(
      'sourceCostingIngredientId', 'ingredient-vanilla',
      'kind', 'purchased', 'name', 'Vanilla', 'baseUnit', 'ml'
    )
  )
);

update inventory_context
set milk_id = (
      select inventory_item_id from inventory_first_sync
      where source_costing_ingredient_id = 'ingredient-milk'
    ),
    matcha_id = (
      select inventory_item_id from inventory_first_sync
      where source_costing_ingredient_id = 'ingredient-matcha'
    ),
    mixture_id = (
      select inventory_item_id from inventory_first_sync
      where source_costing_ingredient_id = 'mixture-sea-salt-cream'
    ),
    vanilla_id = (
      select inventory_item_id from inventory_first_sync
      where source_costing_ingredient_id = 'ingredient-vanilla'
    );

do $$
begin
  if (select count(*) from inventory_first_sync) <> 4
    or exists (
      select 1 from inventory_first_sync
      where sync_result <> 'created' or revision <> 1 or not active
    ) then
    raise exception 'Initial inventory sync did not create four revision-1 items.';
  end if;

  if (select count(*) from public.pos_inventory_get_items(
      (select business_id from inventory_context), false
    )) <> 4 then
    raise exception 'New zero-balance inventory items are missing.';
  end if;

  begin
    perform 1 from public.pos_inventory_items limit 1;
    raise exception 'Owner directly selected the inventory item table.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- A normal cloud upsert cannot bypass the atomic deletion path or rewrite an
-- active inventory identity. Ordinary price edits remain allowed.
do $$
declare
  v_before jsonb := (select data from public.scoopies_state where id = 'main');
begin
  begin
    update public.scoopies_state set id = 'backup-main' where id = 'main';
    raise exception 'A cloud update renamed the protected main costing row.';
  exception when sqlstate '55000' then null;
  end;

  begin
    update public.scoopies_state as costing
    set data = jsonb_set(
      costing.data,
      '{ingredients}',
      (
        select jsonb_agg(source.value order by source.ordinality)
          filter (where source.value ->> 'id' <> 'ingredient-vanilla')
        from jsonb_array_elements(costing.data -> 'ingredients')
          with ordinality as source(value, ordinality)
      )
    )
    where costing.id = 'main';
    raise exception 'A direct cloud update removed an active inventory source.';
  exception when sqlstate '55000' then null;
  end;

  begin
    update public.scoopies_state as costing
    set data = jsonb_set(
      costing.data,
      '{ingredients}',
      (
        select jsonb_agg(
          case when source.value ->> 'id' = 'ingredient-vanilla'
            then jsonb_set(source.value, '{unit}', to_jsonb('g'::text))
            else source.value end
          order by source.ordinality
        )
        from jsonb_array_elements(costing.data -> 'ingredients')
          with ordinality as source(value, ordinality)
      )
    )
    where costing.id = 'main';
    raise exception 'A direct cloud update changed an active inventory source dimension.';
  exception when sqlstate '55000' then null;
  end;

  begin
    update public.scoopies_state as costing
    set data = jsonb_set(
      costing.data,
      '{ingredients}',
      (costing.data -> 'ingredients') || jsonb_build_array((
        select source.value
        from jsonb_array_elements(costing.data -> 'ingredients') as source(value)
        where source.value ->> 'id' = 'ingredient-vanilla'
        limit 1
      ))
    )
    where costing.id = 'main';
    raise exception 'A cloud update accepted duplicate ingredient IDs.';
  exception when sqlstate '22023' then null;
  end;

  update public.scoopies_state as costing
  set data = jsonb_set(
    costing.data,
    '{ingredients}',
    (
      select jsonb_agg(
        case when source.value ->> 'id' = 'ingredient-vanilla'
          then jsonb_set(source.value, '{price}', '101'::jsonb)
          else source.value end
        order by source.ordinality
      )
      from jsonb_array_elements(costing.data -> 'ingredients')
        with ordinality as source(value, ordinality)
    )
  )
  where costing.id = 'main';

  if (select data from public.scoopies_state where id = 'main')
       = v_before
    or (
      select source.value ->> 'price'
      from public.scoopies_state as costing,
        jsonb_array_elements(costing.data -> 'ingredients') as source(value)
      where costing.id = 'main'
        and source.value ->> 'id' = 'ingredient-vanilla'
    ) <> '101' then
    raise exception 'A legitimate costing price edit was not saved.';
  end if;

  update public.scoopies_state
  set data = jsonb_set(
    data, '{mixtureDrafts}',
    jsonb_build_array(jsonb_build_object(
      'id', 'valid-local-draft',
      'data', jsonb_build_object(
        'name', 'Valid Local Draft',
        'pendingIngredients', jsonb_build_array(jsonb_build_object(
          'id', 'draft-pending-ingredient', 'kind', 'purchased',
          'name', 'Draft Pending Ingredient', 'unit', 'ml'
        )),
        'components', jsonb_build_array(jsonb_build_object(
          'ingredientId', 'draft-pending-ingredient', 'qty', 10, 'unit', 'ml'
        ))
      )
    ))
  )
  where id = 'main';
  if not pg_catalog.jsonb_path_exists(
    (select data from public.scoopies_state where id = 'main'),
    '$.mixtureDrafts[*].data.pendingIngredients[*] ? (@.id == "draft-pending-ingredient")'
  ) then
    raise exception 'A valid draft-local pending ingredient was rejected.';
  end if;
  update public.scoopies_state
  set data = jsonb_set(data, '{mixtureDrafts}', '[]'::jsonb)
  where id = 'main';
end;
$$;

-- Recipe, combined-cost, and saved-draft references are all authoritative
-- dependencies and must block atomic source deletion.
do $$
declare
  v_business_id uuid := (select business_id from inventory_context);
begin
  update public.scoopies_state
  set data = jsonb_set(
    data, '{recipes}',
    jsonb_build_array(jsonb_build_object(
      'id', 'recipe-uses-vanilla', 'name', 'Vanilla Latte',
      'lines', jsonb_build_array(jsonb_build_object(
        'ingredientId', 'ingredient-vanilla', 'qty', 1, 'unit', 'ml'
      ))
    ))
  )
  where id = 'main';
  begin
    perform public.pos_inventory_prepare_source_delete(
      v_business_id, 'ingredient-vanilla', 'purchased', 'Vanilla', 'ml'
    );
    raise exception 'Atomic deletion ignored a recipe dependency.';
  exception when sqlstate '55000' then null;
  end;
  update public.scoopies_state
  set data = jsonb_set(data, '{recipes}', '[]'::jsonb)
  where id = 'main';

  update public.scoopies_state as costing
  set data = jsonb_set(
    costing.data,
    '{ingredients}',
    (
      select jsonb_agg(
        case when source.value ->> 'id' = 'mixture-sea-salt-cream'
          then jsonb_set(
            source.value, '{components}',
            jsonb_build_array(jsonb_build_object(
              'ingredientId', 'ingredient-vanilla', 'qty', 1, 'unit', 'ml'
            ))
          )
          else source.value end
        order by source.ordinality
      )
      from jsonb_array_elements(costing.data -> 'ingredients')
        with ordinality as source(value, ordinality)
    )
  )
  where costing.id = 'main';
  begin
    perform public.pos_inventory_prepare_source_delete(
      v_business_id, 'ingredient-vanilla', 'purchased', 'Vanilla', 'ml'
    );
    raise exception 'Atomic deletion ignored a combined-cost dependency.';
  exception when sqlstate '55000' then null;
  end;
  update public.scoopies_state as costing
  set data = jsonb_set(
    costing.data,
    '{ingredients}',
    (
      select jsonb_agg(
        case when source.value ->> 'id' = 'mixture-sea-salt-cream'
          then jsonb_set(source.value, '{components}', '[]'::jsonb)
          else source.value end
        order by source.ordinality
      )
      from jsonb_array_elements(costing.data -> 'ingredients')
        with ordinality as source(value, ordinality)
    )
  )
  where costing.id = 'main';

  update public.scoopies_state
  set data = jsonb_set(
    data, '{mixtureDrafts}',
    jsonb_build_array(jsonb_build_object(
      'id', 'draft-uses-vanilla',
      'data', jsonb_build_object(
        'name', 'Draft Vanilla Cream',
        'components', jsonb_build_array(jsonb_build_object(
          'ingredientId', 'ingredient-vanilla', 'qty', 1, 'unit', 'ml'
        ))
      )
    ))
  )
  where id = 'main';
  begin
    perform public.pos_inventory_prepare_source_delete(
      v_business_id, 'ingredient-vanilla', 'purchased', 'Vanilla', 'ml'
    );
    raise exception 'Atomic deletion ignored a saved-draft dependency.';
  exception when sqlstate '55000' then null;
  end;
  update public.scoopies_state
  set data = jsonb_set(data, '{mixtureDrafts}', '[]'::jsonb)
  where id = 'main';

  begin
    perform public.pos_inventory_prepare_source_delete(
      v_business_id, 'ingredient-vanilla', 'purchased', 'Stale Vanilla', 'ml'
    );
    raise exception 'Atomic deletion accepted a stale costing identity.';
  exception when sqlstate '40001' then null;
  end;

  if not exists (
    select 1
    from public.pos_inventory_get_items(v_business_id, false)
    where inventory_item_id = (select vanilla_id from inventory_context)
      and active and revision = 1
  ) or not exists (
    select 1
    from public.scoopies_state as costing,
      jsonb_array_elements(costing.data -> 'ingredients') as source(value)
    where costing.id = 'main'
      and source.value ->> 'id' = 'ingredient-vanilla'
  ) then
    raise exception 'A rejected dependency or stale-identity delete mutated state.';
  end if;
end;
$$;

-- Deletion validation is a non-mutating preflight. A never-synchronized source
-- is valid to delete, but validation must not reserve or tombstone it.
do $$
declare
  v_business_id uuid := (select business_id from inventory_context);
  v_before_count bigint;
  v_after_count bigint;
  v_before_revision_sum numeric;
  v_after_revision_sum numeric;
begin
  select count(*), coalesce(sum(revision), 0)
    into v_before_count, v_before_revision_sum
  from public.pos_inventory_get_items(v_business_id, true);

  if not public.pos_inventory_validate_source_delete(
      v_business_id, 'ingredient-never-synchronized'
    ) then
    raise exception 'Missing-source deletion preflight did not return true.';
  end if;

  select count(*), coalesce(sum(revision), 0)
    into v_after_count, v_after_revision_sum
  from public.pos_inventory_get_items(v_business_id, true);
  if v_after_count is distinct from v_before_count
    or v_after_revision_sum is distinct from v_before_revision_sum then
    raise exception 'Missing-source deletion preflight mutated inventory.';
  end if;

  begin
    perform public.pos_inventory_validate_source_delete(v_business_id, '   ');
    raise exception 'Deletion preflight accepted an empty source ID.';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

-- Kind/base unit are part of the stable inventory identity immediately, not
-- only after stock history exists.
do $$
begin
  if not public.pos_inventory_prepare_source_change(
      (select business_id from inventory_context),
      'ingredient-vanilla', 'purchased', 'Vanilla', 'ml'
    ) then
    raise exception 'An unchanged no-history source failed validation.';
  end if;

  begin
    perform public.pos_inventory_prepare_source_change(
      (select business_id from inventory_context),
      'ingredient-vanilla', 'purchased', 'Vanilla', 'g'
    );
    raise exception 'No-history source validation allowed a base-unit change.';
  exception when sqlstate '40001' then null;
  end;

  begin
    perform public.pos_inventory_sync_items(
      (select business_id from inventory_context),
      jsonb_build_array(jsonb_build_object(
        'sourceCostingIngredientId', 'ingredient-vanilla',
        'kind', 'mixture', 'name', 'Vanilla', 'baseUnit', 'ml'
      ))
    );
    raise exception 'No-history sync allowed an item-kind change.';
  exception when sqlstate '40001' then null;
  end;

  if not exists (
    select 1
    from public.pos_inventory_get_items(
      (select business_id from inventory_context), false
    )
    where inventory_item_id = (select vanilla_id from inventory_context)
      and item_kind = 'purchased' and base_unit = 'ml'
      and revision = 1 and not initialized
  ) then
    raise exception 'Rejected no-history identity changes altered the item.';
  end if;
end;
$$;

-- Source-change validation is post-save only: the authoritative cloud source
-- must exist first, after which it may create the one global inventory binding
-- that ordinary sync later observes.
update public.scoopies_state as costing
set data = jsonb_set(
  costing.data,
  '{ingredients}',
  (costing.data -> 'ingredients') || jsonb_build_array(
    jsonb_build_object(
      'id', 'ingredient-post-save', 'kind', 'purchased',
      'name', 'Post-save Ingredient', 'unit', 'g'
    )
  )
)
where costing.id = 'main';

select public.pos_inventory_prepare_source_change(
  (select business_id from inventory_context),
  'ingredient-post-save', 'purchased', 'Post-save Ingredient', 'g'
);

create temporary table inventory_post_save_sync as
select *
from public.pos_inventory_sync_items(
  (select business_id from inventory_context),
  jsonb_build_array(jsonb_build_object(
    'sourceCostingIngredientId', 'ingredient-post-save',
    'kind', 'purchased', 'name', 'Post-save Ingredient', 'baseUnit', 'g'
  ))
);

do $$
begin
  if (select sync_result from inventory_post_save_sync) <> 'unchanged'
    or not (select active from inventory_post_save_sync)
    or (select revision from inventory_post_save_sync) <> 1
    or (
      select initialized
      from public.pos_inventory_get_items(
        (select business_id from inventory_context), false
      )
      where inventory_item_id = (
        select inventory_item_id from inventory_post_save_sync
      )
    ) then
    raise exception 'Post-save validation did not create exactly one active uninitialized identity.';
  end if;
end;
$$;

-- The same sync is stable and a rename preserves identity while incrementing
-- exactly one revision.
create temporary table inventory_sync_retry as
select *
from public.pos_inventory_sync_items(
  (select business_id from inventory_context),
  jsonb_build_array(
    jsonb_build_object(
      'sourceCostingIngredientId', 'ingredient-milk',
      'kind', 'purchased', 'name', 'Regular Milk', 'baseUnit', 'ml'
    )
  )
);

update public.scoopies_state as costing
set data = jsonb_set(
  costing.data,
  '{ingredients}',
  (
    select jsonb_agg(
      case when source.value ->> 'id' = 'ingredient-milk'
        then jsonb_set(source.value, '{name}', to_jsonb('Whole Milk'::text))
        else source.value end
      order by source.ordinality
    )
    from jsonb_array_elements(costing.data -> 'ingredients')
      with ordinality as source(value, ordinality)
  )
)
where costing.id = 'main';

create temporary table inventory_rename as
select *
from public.pos_inventory_sync_items(
  (select business_id from inventory_context),
  jsonb_build_array(
    jsonb_build_object(
      'sourceCostingIngredientId', 'ingredient-milk',
      'kind', 'purchased', 'name', 'Whole Milk', 'baseUnit', 'ml'
    )
  )
);

do $$
begin
  if (select sync_result from inventory_sync_retry) <> 'unchanged'
    or (select revision from inventory_sync_retry) <> 1
    or (select inventory_item_id from inventory_sync_retry)
      is distinct from (select milk_id from inventory_context) then
    raise exception 'Exact inventory sync changed identity or revision.';
  end if;

  if (select sync_result from inventory_rename) <> 'updated'
    or (select revision from inventory_rename) <> 2
    or (select inventory_item_id from inventory_rename)
      is distinct from (select milk_id from inventory_context) then
    raise exception 'Inventory rename did not preserve identity and advance revision.';
  end if;
end;
$$;

-- Every item must start from an explicit physical count. A purchase cannot be
-- used as an inferred opening balance.
select set_config('request.jwt.claim.sub', '55000000-0000-4000-8000-000000000002', true);

do $$
begin
  begin
    perform 1 from public.pos_inventory_transactions limit 1;
    raise exception 'Manager directly selected the inventory transaction table.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

do $$
begin
  begin
    perform public.pos_inventory_record_transaction(
      (select business_id from inventory_context),
      '55000000-0000-4000-8000-000000000100',
      'stock_in',
      jsonb_build_array(jsonb_build_object(
        'inventoryItemId', (select milk_id from inventory_context),
        'quantity', 2, 'unit', 'l', 'expectedRevision', 2
      )),
      null, 'Not an opening count'
    );
    raise exception 'An uninitialized item accepted a non-count first movement.';
  exception when sqlstate '55000' then null;
  end;

  if exists (
    select 1
    from public.pos_inventory_get_transactions(
      (select business_id from inventory_context), null, 100
    )
    where client_transaction_id = '55000000-0000-4000-8000-000000000100'
  ) or (
    select initialized
    from public.pos_inventory_get_items(
      (select business_id from inventory_context), false
    )
    where inventory_item_id = (select milk_id from inventory_context)
  ) then
    raise exception 'Rejected inferred opening stock left inventory history.';
  end if;
end;
$$;

create temporary table inventory_opening_count as
select *
from public.pos_inventory_record_transaction(
  (select business_id from inventory_context),
  '55000000-0000-4000-8000-000000000101',
  'stock_count',
  jsonb_build_array(
    jsonb_build_object(
      'inventoryItemId', (select milk_id from inventory_context),
      'quantity', 2, 'unit', 'l', 'expectedRevision', 2
    ),
    jsonb_build_object(
      'inventoryItemId', (select matcha_id from inventory_context),
      'quantity', 0.25, 'unit', 'kg', 'expectedRevision', 1
    )
  ),
  null,
  'Verified opening count'
);

do $$
begin
  if (select count(*) from inventory_opening_count) <> 2
    or exists (select 1 from inventory_opening_count where is_retry) then
    raise exception 'Initial multi-item physical count result is incorrect.';
  end if;

  if (select balance_after_base from inventory_opening_count
      where inventory_item_id = (select milk_id from inventory_context)) <> 2000
    or (select balance_after_base from inventory_opening_count
      where inventory_item_id = (select matcha_id from inventory_context)) <> 250 then
    raise exception 'kg/l conversion or opening-count balance is incorrect.';
  end if;
end;
$$;

create temporary table inventory_opening_count_retry as
select *
from public.pos_inventory_record_transaction(
  (select business_id from inventory_context),
  '55000000-0000-4000-8000-000000000101',
  'stock_count',
  jsonb_build_array(
    jsonb_build_object(
      'inventoryItemId', (select milk_id from inventory_context),
      'quantity', 2, 'unit', 'l', 'expectedRevision', 2
    ),
    jsonb_build_object(
      'inventoryItemId', (select matcha_id from inventory_context),
      'quantity', 0.25, 'unit', 'kg', 'expectedRevision', 1
    )
  ),
  null,
  'Verified opening count'
);

do $$
begin
  if (select count(*) from inventory_opening_count_retry) <> 2
    or exists (select 1 from inventory_opening_count_retry where not is_retry)
    or (select count(distinct transaction_id)
        from public.pos_inventory_get_transactions(
          (select business_id from inventory_context), null, 100
        ) where client_transaction_id = '55000000-0000-4000-8000-000000000101') <> 1
    or (select count(*)
        from public.pos_inventory_get_transactions(
          (select business_id from inventory_context), null, 100
        ) where transaction_id = (select transaction_id from inventory_opening_count limit 1)) <> 2 then
    raise exception 'Exact stock transaction retry duplicated or changed the ledger.';
  end if;

  begin
    perform public.pos_inventory_record_transaction(
      (select business_id from inventory_context),
      '55000000-0000-4000-8000-000000000101',
      'stock_count',
      jsonb_build_array(jsonb_build_object(
        'inventoryItemId', (select milk_id from inventory_context),
        'quantity', 3, 'unit', 'l', 'expectedRevision', 2
      )),
      null, 'Different request'
    );
    raise exception 'A reused client transaction ID accepted different details.';
  exception when sqlstate '23505' then null;
  end;
end;
$$;

-- A threshold alone must not label an uninitialized item low-stock. The
-- threshold becomes meaningful only after an explicit opening physical count.
create temporary table inventory_uninitialized_threshold as
select *
from public.pos_inventory_set_threshold(
  (select business_id from inventory_context),
  (select vanilla_id from inventory_context),
  10,
  1
);

do $$
begin
  if (select revision from inventory_uninitialized_threshold) <> 2
    or not exists (
      select 1
      from public.pos_inventory_get_items(
        (select business_id from inventory_context), false
      )
      where inventory_item_id = (select vanilla_id from inventory_context)
        and not initialized
        and not is_low_stock
        and low_stock_threshold_base = 10
        and revision = 2
    ) then
    raise exception 'An uninitialized item was treated as low-stock after setting a threshold.';
  end if;
end;
$$;

-- Once initialized, normal purchased stock-in adds to the counted balance.
create temporary table inventory_stock_in as
select *
from public.pos_inventory_record_transaction(
  (select business_id from inventory_context),
  '55000000-0000-4000-8000-000000000110',
  'stock_in',
  jsonb_build_array(
    jsonb_build_object(
      'inventoryItemId', (select milk_id from inventory_context),
      'quantity', 0.5, 'unit', 'l', 'expectedRevision', 3
    ),
    jsonb_build_object(
      'inventoryItemId', (select matcha_id from inventory_context),
      'quantity', 0.05, 'unit', 'kg', 'expectedRevision', 2
    )
  ),
  null,
  'Supplier delivery after opening count'
);

do $$
begin
  if (select balance_after_base from inventory_stock_in
      where inventory_item_id = (select milk_id from inventory_context)) <> 2500
    or (select balance_after_base from inventory_stock_in
      where inventory_item_id = (select matcha_id from inventory_context)) <> 300 then
    raise exception 'Initialized stock-in or unit conversion is incorrect.';
  end if;

  -- A transaction mixing an initialized item with an uninitialized item is
  -- rejected atomically; an opening count must cover the latter first.
  begin
    perform public.pos_inventory_record_transaction(
      (select business_id from inventory_context),
      '55000000-0000-4000-8000-000000000111',
      'correction',
      jsonb_build_array(
        jsonb_build_object(
          'inventoryItemId', (select milk_id from inventory_context),
          'quantity', 10, 'unit', 'ml', 'expectedRevision', 4
        ),
        jsonb_build_object(
          'inventoryItemId', (select vanilla_id from inventory_context),
          'quantity', 1, 'unit', 'ml', 'expectedRevision', 2
        )
      ),
      'Mixed initialization check', null
    );
    raise exception 'A multi-line request accepted an uninitialized item.';
  exception when sqlstate '55000' then null;
  end;

  if exists (
    select 1
    from public.pos_inventory_get_transactions(
      (select business_id from inventory_context), null, 100
    )
    where client_transaction_id = '55000000-0000-4000-8000-000000000111'
  ) or (
    select current_balance_base
    from public.pos_inventory_get_items(
      (select business_id from inventory_context), false
    )
    where inventory_item_id = (select milk_id from inventory_context)
  ) <> 2500 or (
    select initialized
    from public.pos_inventory_get_items(
      (select business_id from inventory_context), false
    )
    where inventory_item_id = (select vanilla_id from inventory_context)
  ) then
    raise exception 'Rejected mixed initialization request was not atomic.';
  end if;
end;
$$;

create temporary table inventory_vanilla_opening_count as
select *
from public.pos_inventory_record_transaction(
  (select business_id from inventory_context),
  '55000000-0000-4000-8000-000000000112',
  'stock_count',
  jsonb_build_array(jsonb_build_object(
    'inventoryItemId', (select vanilla_id from inventory_context),
    'quantity', 0, 'unit', 'ml', 'expectedRevision', 2
  )),
  null,
  'Verified zero opening count for threshold'
);

do $$
begin
  if (select item_revision from inventory_vanilla_opening_count) <> 3
    or not exists (
      select 1
      from public.pos_inventory_get_items(
        (select business_id from inventory_context), false
      )
      where inventory_item_id = (select vanilla_id from inventory_context)
        and initialized
        and is_low_stock
        and current_balance_base = 0
        and low_stock_threshold_base = 10
        and revision = 3
    ) then
    raise exception 'Low-stock threshold did not activate after the explicit opening count.';
  end if;
end;
$$;

-- A bad line makes the entire multi-line request disappear.
do $$
begin
  begin
    perform public.pos_inventory_record_transaction(
      (select business_id from inventory_context),
      '55000000-0000-4000-8000-000000000102',
      'correction',
      jsonb_build_array(
        jsonb_build_object(
          'inventoryItemId', (select matcha_id from inventory_context),
          'quantity', 5, 'unit', 'g', 'expectedRevision', 3
        ),
        jsonb_build_object(
          'inventoryItemId', (select milk_id from inventory_context),
          'quantity', 1, 'unit', 'kg', 'expectedRevision', 4
        )
      ),
      'Atomic invalid unit', null
    );
    raise exception 'A cross-dimension inventory unit was accepted.';
  exception when sqlstate '22023' then null;
  end;

  if exists (
    select 1
    from public.pos_inventory_get_transactions(
      (select business_id from inventory_context), null, 100
    )
    where client_transaction_id = '55000000-0000-4000-8000-000000000102'
  ) or (
    select current_balance_base
    from public.pos_inventory_get_items(
      (select business_id from inventory_context), false
    )
    where inventory_item_id = (select matcha_id from inventory_context)
  ) <> 300 then
    raise exception 'An invalid atomic request left a header or partial movement.';
  end if;
end;
$$;

-- Threshold changes use optimistic item revisions and exact same-value retries
-- do not create a new revision.
create temporary table inventory_threshold as
select *
from public.pos_inventory_set_threshold(
  (select business_id from inventory_context),
  (select milk_id from inventory_context),
  500,
  4
);

do $$
begin
  if (select revision from inventory_threshold) <> 5
    or (select is_retry from inventory_threshold) then
    raise exception 'Threshold update did not advance the item revision.';
  end if;

  if not (
    select is_retry
    from public.pos_inventory_set_threshold(
      (select business_id from inventory_context),
      (select milk_id from inventory_context), 500, 4
    )
  ) then
    raise exception 'Exact threshold retry was not recognized.';
  end if;

  begin
    perform public.pos_inventory_set_threshold(
      (select business_id from inventory_context),
      (select milk_id from inventory_context), 600, 4
    );
    raise exception 'A stale threshold update was accepted.';
  exception when sqlstate '40001' then null;
  end;
end;
$$;

create temporary table inventory_waste as
select *
from public.pos_inventory_record_transaction(
  (select business_id from inventory_context),
  '55000000-0000-4000-8000-000000000103',
  'waste',
  jsonb_build_array(jsonb_build_object(
    'inventoryItemId', (select milk_id from inventory_context),
    'quantity', 100, 'unit', 'ml', 'expectedRevision', 5
  )),
  'Spilled during prep',
  null
);

create temporary table inventory_correction as
select *
from public.pos_inventory_record_transaction(
  (select business_id from inventory_context),
  '55000000-0000-4000-8000-000000000104',
  'correction',
  jsonb_build_array(jsonb_build_object(
    'inventoryItemId', (select matcha_id from inventory_context),
    'quantity', -50, 'unit', 'g', 'expectedRevision', 3
  )),
  'Scale reconciliation',
  null
);

create temporary table inventory_mixture_count as
select *
from public.pos_inventory_record_transaction(
  (select business_id from inventory_context),
  '55000000-0000-4000-8000-000000000105',
  'stock_count',
  jsonb_build_array(jsonb_build_object(
    'inventoryItemId', (select mixture_id from inventory_context),
    'quantity', 300, 'unit', 'ml', 'expectedRevision', 1
  )),
  null,
  'Opening physical count'
);

do $$
begin
  if (select balance_after_base from inventory_waste) <> 2400
    or (select quantity_delta_base from inventory_waste) <> -100
    or (select balance_after_base from inventory_correction) <> 250
    or (select quantity_delta_base from inventory_correction) <> -50
    or (select balance_after_base from inventory_mixture_count) <> 300 then
    raise exception 'Waste, correction, or mixture physical-count math is wrong.';
  end if;

  begin
    perform public.pos_inventory_record_transaction(
      (select business_id from inventory_context),
      '55000000-0000-4000-8000-000000000106',
      'stock_in',
      jsonb_build_array(jsonb_build_object(
        'inventoryItemId', (select mixture_id from inventory_context),
        'quantity', 100, 'unit', 'ml', 'expectedRevision', 2
      )),
      null, null
    );
    raise exception 'A prepared mixture accepted purchased stock-in.';
  exception when sqlstate '55000' then null;
  end;

  begin
    perform public.pos_inventory_record_transaction(
      (select business_id from inventory_context),
      '55000000-0000-4000-8000-000000000108',
      'waste',
      jsonb_build_array(jsonb_build_object(
        'inventoryItemId', (select matcha_id from inventory_context),
        'quantity', 1000, 'unit', 'g', 'expectedRevision', 4
      )),
      'Impossible waste', null
    );
    raise exception 'A movement that made stock negative was accepted.';
  exception when sqlstate '23514' then null;
  end;

  begin
    perform public.pos_inventory_record_transaction(
      (select business_id from inventory_context),
      gen_random_uuid(), 'waste',
      jsonb_build_array(jsonb_build_object(
        'inventoryItemId', (select matcha_id from inventory_context),
        'quantity', 1, 'unit', 'g', 'expectedRevision', 4
      )),
      null, null
    );
    raise exception 'Waste without a reason was accepted.';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

-- A count stores a delta but sets the physical balance to the entered amount.
create temporary table inventory_count_1500 as
select *
from public.pos_inventory_record_transaction(
  (select business_id from inventory_context),
  '55000000-0000-4000-8000-000000000107',
  'stock_count',
  jsonb_build_array(jsonb_build_object(
    'inventoryItemId', (select milk_id from inventory_context),
    'quantity', 1.5, 'unit', 'l', 'expectedRevision', 6
  )),
  null,
  'Afternoon count'
);

update public.scoopies_state as costing
set data = jsonb_set(
  costing.data,
  '{ingredients}',
  (
    select jsonb_agg(
      case when source.value ->> 'id' = 'ingredient-milk'
        then jsonb_set(source.value, '{name}', to_jsonb('Fresh Milk'::text))
        else source.value end
      order by source.ordinality
    )
    from jsonb_array_elements(costing.data -> 'ingredients')
      with ordinality as source(value, ordinality)
  )
)
where costing.id = 'main';

do $$
begin
  if (select quantity_delta_base from inventory_count_1500) <> -900
    or (select balance_before_base from inventory_count_1500) <> 2400
    or (select balance_after_base from inventory_count_1500) <> 1500 then
    raise exception 'Physical count did not calculate the correct delta.';
  end if;

  begin
    perform public.pos_inventory_prepare_source_change(
      (select business_id from inventory_context),
      'ingredient-milk', 'purchased', 'Fresh Milk', 'g'
    );
    raise exception 'A history-bearing source changed physical dimension.';
  exception when sqlstate '40001' then null;
  end;

  if not public.pos_inventory_prepare_source_change(
      (select business_id from inventory_context),
      'ingredient-milk', 'purchased', 'Fresh Milk', 'ml'
    ) then
    raise exception 'An unchanged source failed inventory validation.';
  end if;
end;
$$;

create temporary table inventory_second_rename as
select *
from public.pos_inventory_sync_items(
  (select business_id from inventory_context),
  jsonb_build_array(jsonb_build_object(
    'sourceCostingIngredientId', 'ingredient-milk',
    'kind', 'purchased', 'name', 'Fresh Milk', 'baseUnit', 'ml'
  ))
);

do $$
begin
  if (select revision from inventory_second_rename) <> 8
    or (select name from public.pos_inventory_get_items(
        (select business_id from inventory_context), false
      ) where inventory_item_id = (select milk_id from inventory_context)
    ) <> 'Fresh Milk' then
    raise exception 'History-bearing rename did not preserve and update the item.';
  end if;

  if not exists (
    select 1
    from public.pos_inventory_get_transactions(
      (select business_id from inventory_context),
      (select milk_id from inventory_context),
      100
    )
    where item_name_snapshot = 'Whole Milk'
  ) then
    raise exception 'A rename rewrote historical item-name snapshots.';
  end if;
end;
$$;

update public.scoopies_state as costing
set data = jsonb_set(
  costing.data,
  '{ingredients}',
  (
    select jsonb_agg(
      case when source.value ->> 'id' = 'ingredient-milk'
        then jsonb_set(source.value, '{name}', to_jsonb('Fresh Milk'::text))
        else source.value end
      order by source.ordinality
    )
    from jsonb_array_elements(costing.data -> 'ingredients')
      with ordinality as source(value, ordinality)
  )
)
where costing.id = 'main';

select * from public.pos_inventory_set_threshold(
  (select business_id from inventory_context),
  (select milk_id from inventory_context),
  1600,
  8
);

do $$
begin
  if not (
    select is_low_stock
    from public.pos_inventory_get_items(
      (select business_id from inventory_context), false
    )
    where inventory_item_id = (select milk_id from inventory_context)
  ) then
    raise exception 'Low-stock threshold did not flag a balance below threshold.';
  end if;

  begin
    perform public.pos_inventory_validate_source_delete(
      (select business_id from inventory_context), 'ingredient-milk'
    );
    raise exception 'Deletion preflight allowed an active nonzero item.';
  exception when sqlstate '55000' then null;
  end;

  if not exists (
    select 1
    from public.pos_inventory_get_items(
      (select business_id from inventory_context), false
    )
    where inventory_item_id = (select milk_id from inventory_context)
      and active and current_balance_base = 1500 and revision = 9
  ) then
    raise exception 'Rejected deletion preflight mutated the nonzero item.';
  end if;

  begin
    perform public.pos_inventory_prepare_source_delete(
      (select business_id from inventory_context),
      'ingredient-milk', 'purchased', 'Fresh Milk', 'ml'
    );
    raise exception 'A nonzero item was prepared for source deletion.';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

select * from public.pos_inventory_record_transaction(
  (select business_id from inventory_context),
  '55000000-0000-4000-8000-000000000109',
  'stock_count',
  jsonb_build_array(jsonb_build_object(
    'inventoryItemId', (select milk_id from inventory_context),
    'quantity', 0, 'unit', 'ml', 'expectedRevision', 9
  )),
  null,
  'Counted empty'
);

do $$
begin
  if not public.pos_inventory_validate_source_delete(
      (select business_id from inventory_context), 'ingredient-milk'
    ) then
    raise exception 'Zero-balance deletion preflight did not return true.';
  end if;

  if not exists (
    select 1
    from public.pos_inventory_get_items(
      (select business_id from inventory_context), false
    )
    where inventory_item_id = (select milk_id from inventory_context)
      and active and current_balance_base = 0 and revision = 10
  ) then
    raise exception 'Zero-balance deletion preflight mutated the active item.';
  end if;
end;
$$;

create temporary table inventory_costing_before_atomic_delete as
select data
from public.scoopies_state
where id = 'main';

select public.pos_inventory_prepare_source_delete(
  (select business_id from inventory_context),
  'ingredient-milk', 'purchased', 'Fresh Milk', 'ml'
);

create temporary table inventory_deactivated as
select *
from public.pos_inventory_get_items(
  (select business_id from inventory_context), true
)
where inventory_item_id = (select milk_id from inventory_context);

do $$
declare
  v_expected jsonb;
begin
  select jsonb_set(
    before_delete.data,
    '{ingredients}',
    (
      select coalesce(
        jsonb_agg(source.value order by source.ordinality)
          filter (where source.value ->> 'id' <> 'ingredient-milk'),
        '[]'::jsonb
      )
      from jsonb_array_elements(before_delete.data -> 'ingredients')
        with ordinality as source(value, ordinality)
    )
  )
  into v_expected
  from inventory_costing_before_atomic_delete as before_delete;

  if (select revision from inventory_deactivated) <> 11
    or (select active from inventory_deactivated)
    or exists (
      select 1 from public.pos_inventory_get_items(
        (select business_id from inventory_context), false
      ) where inventory_item_id = (select milk_id from inventory_context)
    )
    or not exists (
      select 1 from public.pos_inventory_get_items(
        (select business_id from inventory_context), true
      ) where inventory_item_id = (select milk_id from inventory_context)
        and not active and current_balance_base = 0
    )
    or (select data from public.scoopies_state where id = 'main')
      is distinct from v_expected then
    raise exception 'Atomic deletion changed unrelated costing data or failed to create the zero-stock tombstone.';
  end if;

  begin
    update public.scoopies_state as costing
    set data = jsonb_set(
      costing.data,
      '{ingredients}',
      (costing.data -> 'ingredients') || jsonb_build_array(
        jsonb_build_object(
          'id', 'ingredient-milk', 'kind', 'purchased',
          'name', 'Fresh Milk', 'unit', 'ml'
        )
      )
    )
    where costing.id = 'main';
    raise exception 'A stale full-document save revived a deleted source.';
  exception when sqlstate '55000' then null;
  end;

  begin
    update public.scoopies_state
    set data = jsonb_set(
      data, '{recipes}',
      jsonb_build_array(jsonb_build_object(
        'id', 'dangling-after-delete', 'name', 'Dangling Recipe',
        'lines', jsonb_build_array(jsonb_build_object(
          'ingredientId', 'ingredient-milk', 'qty', 1, 'unit', 'ml'
        ))
      ))
    )
    where id = 'main';
    raise exception 'A stale save added a recipe reference to an absent source.';
  exception when sqlstate '55000' then null;
  end;

  begin
    update public.scoopies_state
    set data = jsonb_set(
      data, '{mixtureDrafts}',
      jsonb_build_array(jsonb_build_object(
        'id', 'dangling-draft-after-delete',
        'data', jsonb_build_object(
          'name', 'Dangling Draft',
          'components', jsonb_build_array(jsonb_build_object(
            'ingredientId', 'ingredient-milk', 'qty', 1, 'unit', 'ml'
          ))
        )
      ))
    )
    where id = 'main';
    raise exception 'A stale save added a draft reference to an absent source.';
  exception when sqlstate '55000' then null;
  end;

  if not public.pos_inventory_validate_source_delete(
      (select business_id from inventory_context), 'ingredient-milk'
    ) or not exists (
      select 1
      from public.pos_inventory_get_items(
        (select business_id from inventory_context), true
      )
      where inventory_item_id = (select milk_id from inventory_context)
        and not active and current_balance_base = 0 and revision = 11
    ) then
    raise exception 'Inactive-source deletion preflight was not mutation-free.';
  end if;

  if not public.pos_inventory_prepare_source_delete(
      (select business_id from inventory_context),
      'ingredient-milk', 'purchased', 'Fresh Milk', 'ml'
    )
    or not public.pos_inventory_prepare_source_delete(
      (select business_id from inventory_context),
      'ingredient-milk', 'purchased', 'Fresh Milk', 'ml'
    ) then
    raise exception 'Prepared source deletion was not idempotent.';
  end if;

  if not public.pos_inventory_prepare_source_delete(
      (select business_id from inventory_context),
      'ingredient-vanilla', 'purchased', 'Vanilla', 'ml'
    ) then
    raise exception 'Zero-balance source deletion preparation failed.';
  end if;
end;
$$;

-- Deleting a cloud source before its first inventory sync still creates the
-- durable inactive identity in the same transaction.
update public.scoopies_state as costing
set data = jsonb_set(
  costing.data,
  '{ingredients}',
  (costing.data -> 'ingredients') || jsonb_build_array(
    jsonb_build_object(
      'id', 'ingredient-unsynced-delete', 'kind', 'purchased',
      'name', 'Unsynced Delete', 'unit', 'piece', 'price', 10
    )
  )
)
where costing.id = 'main';

select public.pos_inventory_prepare_source_delete(
  (select business_id from inventory_context),
  'ingredient-unsynced-delete', 'purchased', 'Unsynced Delete', 'piece'
);
select public.pos_inventory_prepare_source_delete(
  (select business_id from inventory_context),
  'ingredient-unsynced-delete', 'purchased', 'Unsynced Delete', 'piece'
);

do $$
begin
  if exists (
    select 1
    from public.scoopies_state as costing,
      jsonb_array_elements(costing.data -> 'ingredients') as source(value)
    where costing.id = 'main'
      and source.value ->> 'id' = 'ingredient-unsynced-delete'
  ) or (
    select count(*)
    from public.pos_inventory_get_items(
      (select business_id from inventory_context), true
    )
    where source_costing_ingredient_id = 'ingredient-unsynced-delete'
      and item_kind = 'purchased' and name = 'Unsynced Delete'
      and base_unit = 'piece' and not active and revision = 1
  ) <> 1 then
    raise exception 'Unsynced atomic deletion did not preserve one inactive tombstone.';
  end if;
end;
$$;

-- Legacy cloud data may contain a never-synchronized source with a blank
-- name. It remains deletable by exact identity, while its durable inventory
-- tombstone receives a valid nonblank snapshot label.
update public.scoopies_state as costing
set data = jsonb_set(
  costing.data,
  '{ingredients}',
  (costing.data -> 'ingredients') || jsonb_build_array(
    jsonb_build_object(
      'id', 'ingredient-blank-name-delete', 'kind', 'purchased',
      'name', '', 'unit', 'ml', 'price', 0
    )
  )
)
where costing.id = 'main';

select public.pos_inventory_prepare_source_delete(
  (select business_id from inventory_context),
  'ingredient-blank-name-delete', 'purchased', '', 'ml'
);

do $$
begin
  if exists (
    select 1
    from public.scoopies_state as costing,
      jsonb_array_elements(costing.data -> 'ingredients') as source(value)
    where costing.id = 'main'
      and source.value ->> 'id' = 'ingredient-blank-name-delete'
  ) or (
    select count(*)
    from public.pos_inventory_get_items(
      (select business_id from inventory_context), true
    )
    where source_costing_ingredient_id = 'ingredient-blank-name-delete'
      and item_kind = 'purchased' and name = 'Unnamed ingredient'
      and base_unit = 'ml' and not active and revision = 1
  ) <> 1 then
    raise exception 'Blank-name source deletion did not create its safe inactive tombstone.';
  end if;
end;
$$;

create temporary table inventory_inactive_sync as
select *
from public.pos_inventory_sync_items(
  (select business_id from inventory_context),
  jsonb_build_array(jsonb_build_object(
    'sourceCostingIngredientId', 'ingredient-milk',
    'kind', 'purchased', 'name', 'Fresh Milk', 'baseUnit', 'ml'
  ))
);

do $$
begin
  if (select sync_result from inventory_inactive_sync) <> 'inactive'
    or (select active from inventory_inactive_sync)
    or (select revision from inventory_inactive_sync) <> 11
    or (select inventory_item_id from inventory_inactive_sync)
      is distinct from (select milk_id from inventory_context)
    or not (
      select initialized
      from public.pos_inventory_get_items(
        (select business_id from inventory_context), true
      )
      where inventory_item_id = (select milk_id from inventory_context)
    ) then
    raise exception 'Stale sync revived or revised an inactive inventory tombstone.';
  end if;

  begin
    perform public.pos_inventory_prepare_source_change(
      (select business_id from inventory_context),
      'ingredient-milk', 'purchased', 'Fresh Milk', 'ml'
    );
    raise exception 'Source-change preparation reused an inactive inventory identity.';
  exception when sqlstate 'P0002' then null;
  end;
end;
$$;

-- Cashiers can see active quantities, but not tombstones, staff-bearing history,
-- or any mutation/preflight RPC.
select set_config('request.jwt.claim.sub', '55000000-0000-4000-8000-000000000003', true);

do $$
declare
  v_business_id uuid := (select business_id from inventory_context);
begin
  if (select count(*) from public.pos_inventory_get_items(v_business_id, false)) <> 3 then
    raise exception 'Cashier could not read active business inventory quantities.';
  end if;

  begin
    perform public.pos_inventory_get_items(v_business_id, true);
    raise exception 'Cashier included inactive inventory items.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.pos_inventory_items limit 1;
    raise exception 'Cashier directly selected inventory items.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pos_inventory_prepare_source_change(
      v_business_id,
      'ingredient-matcha', 'purchased', 'Matcha Powder', 'g'
    );
    raise exception 'Cashier prepared a costing source change.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pos_inventory_validate_source_delete(
      v_business_id, 'ingredient-matcha'
    );
    raise exception 'Cashier validated a costing source deletion.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.pos_inventory_transactions limit 1;
    raise exception 'Cashier directly selected inventory transactions.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.pos_inventory_transaction_lines limit 1;
    raise exception 'Cashier directly selected inventory transaction lines.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pos_inventory_get_transactions(v_business_id, null, 100);
    raise exception 'Cashier called inventory history RPC.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pos_inventory_sync_items(v_business_id, '[]'::jsonb);
    raise exception 'Cashier synchronized inventory.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pos_inventory_set_threshold(
      v_business_id, (select matcha_id from inventory_context), 20, 3
    );
    raise exception 'Cashier changed an inventory threshold.';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.pos_inventory_transactions (
      business_id, client_transaction_id, request_fingerprint,
      transaction_type, metadata, recorded_by
    ) values (
      v_business_id, gen_random_uuid(), repeat('a', 64),
      'stock_in', '{}'::jsonb, auth.uid()
    );
    raise exception 'Cashier directly inserted an inventory ledger row.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Authenticated outsiders and anonymous callers cannot use inventory RPCs.
select set_config('request.jwt.claim.sub', '55000000-0000-4000-8000-000000000004', true);

do $$
begin
  begin
    perform public.pos_inventory_get_items(
      (select business_id from inventory_context), false
    );
    raise exception 'Authenticated outsider read another business inventory.';
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
    raise exception 'Anonymous role directly selected inventory items.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pos_inventory_get_items(
      (select business_id from inventory_context), false
    );
    raise exception 'Anonymous role executed an inventory RPC.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- One global costing source has one global inventory binding. Cover both
-- lifecycle orderings across two businesses.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '55000000-0000-4000-8000-000000000005', true);

create temporary table inventory_other_business as
select public.pos_bootstrap_business(
  'Other Inventory Business', 'I5O', 'Asia/Manila'
) as business_id;

update public.scoopies_state as costing
set data = jsonb_set(
  costing.data,
  '{ingredients}',
  (costing.data -> 'ingredients') || jsonb_build_array(
    jsonb_build_object(
      'id', 'cross-business-owned', 'kind', 'purchased',
      'name', 'Other Business Ingredient', 'unit', 'g'
    )
  )
)
where costing.id = 'main';

create temporary table inventory_other_item as
select *
from public.pos_inventory_sync_items(
  (select business_id from inventory_other_business),
  jsonb_build_array(jsonb_build_object(
    'sourceCostingIngredientId', 'cross-business-owned',
    'kind', 'purchased', 'name', 'Other Business Ingredient', 'baseUnit', 'g'
  ))
);

select set_config('request.jwt.claim.sub', '55000000-0000-4000-8000-000000000001', true);

do $$
begin
  begin
    perform public.pos_inventory_prepare_source_delete(
      (select business_id from inventory_context),
      'cross-business-owned', 'purchased', 'Other Business Ingredient', 'g'
    );
    raise exception 'A business deleted a source bound to another business.';
  exception when sqlstate '55000' then null;
  end;

  if not exists (
    select 1
    from public.scoopies_state as costing,
      jsonb_array_elements(costing.data -> 'ingredients') as source(value)
    where costing.id = 'main'
      and source.value ->> 'id' = 'cross-business-owned'
  ) then
    raise exception 'Rejected cross-business deletion removed the source.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '55000000-0000-4000-8000-000000000005', true);

do $$
begin
  if not exists (
    select 1
    from public.pos_inventory_get_items(
      (select business_id from inventory_other_business), false
    )
    where inventory_item_id = (select inventory_item_id from inventory_other_item)
      and active
  ) then
    raise exception 'Rejected cross-business deletion changed the owning binding.';
  end if;

  begin
    perform public.pos_inventory_sync_items(
      (select business_id from inventory_other_business),
      jsonb_build_array(jsonb_build_object(
        'sourceCostingIngredientId', 'ingredient-milk',
        'kind', 'purchased', 'name', 'Fresh Milk', 'baseUnit', 'ml'
      ))
    );
    raise exception 'Another business synchronized a globally deleted source.';
  exception when sqlstate '55000' then null;
  end;

  begin
    perform public.pos_inventory_prepare_source_change(
      (select business_id from inventory_other_business),
      'ingredient-milk', 'purchased', 'Fresh Milk', 'ml'
    );
    raise exception 'Another business prepared a globally deleted source.';
  exception when sqlstate 'P0002' then null;
  end;

  if not public.pos_inventory_prepare_source_delete(
      (select business_id from inventory_other_business),
      'ingredient-milk', 'purchased', 'Fresh Milk', 'ml'
    ) then
    raise exception 'Cross-business retry did not recognize completed global deletion.';
  end if;

  if exists (
    select 1
    from public.pos_inventory_get_items(
      (select business_id from inventory_other_business), false
    )
    where source_costing_ingredient_id = 'ingredient-milk'
      and active
  ) then
    raise exception 'Deleted source gained an active cross-business orphan.';
  end if;

  begin
    perform public.pos_inventory_record_transaction(
      (select business_id from inventory_other_business),
      gen_random_uuid(), 'stock_count',
      jsonb_build_array(jsonb_build_object(
        'inventoryItemId', (select milk_id from inventory_context),
        'quantity', 0, 'unit', 'ml', 'expectedRevision', 11
      )),
      null, null
    );
    raise exception 'A cross-business inventory item was accepted.';
  exception when sqlstate 'P0002' then null;
  end;
end;
$$;

-- Even a privileged connection cannot mutate or erase ledger evidence.
reset role;

do $$
begin
  begin
    delete from public.scoopies_state where id = 'main';
    raise exception 'A privileged connection deleted the protected main costing row.';
  exception when sqlstate '55000' then null;
  end;

  if not exists (select 1 from public.scoopies_state where id = 'main') then
    raise exception 'Protected main costing row disappeared after rejected delete.';
  end if;

  if (select count(*) from public.pos_inventory_items
      where source_costing_ingredient_id = 'ingredient-milk'
        and business_id = (select business_id from inventory_context)
        and not active and revision = 11) <> 1 then
    raise exception 'Cross-business completed-delete retry mutated or rebound the tombstone.';
  end if;

  begin
    update public.pos_inventory_transactions
    set note = 'tampered'
    where business_id = (select business_id from inventory_context);
    raise exception 'Inventory transaction header was mutable.';
  exception when sqlstate '55000' then null;
  end;

  begin
    delete from public.pos_inventory_transaction_lines
    where business_id = (select business_id from inventory_context);
    raise exception 'Inventory transaction line was deletable.';
  exception when sqlstate '55000' then null;
  end;

  begin
    delete from public.pos_inventory_items
    where id = (select matcha_id from inventory_context);
    raise exception 'Inventory item identity was deletable.';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

rollback;

select 'PASS: Inventory Phase 1 behavior checks' as result;
