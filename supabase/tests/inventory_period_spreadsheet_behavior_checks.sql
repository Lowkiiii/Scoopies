-- Destructive schema-13 behavior checks. Every fixture is rolled back.
begin;

insert into auth.users (id, email) values
  ('13000000-0000-4000-8000-000000000001', 'inventory13-owner@example.test');

create temporary table inventory13_context (
  business_id uuid, period_id uuid, next_period_id uuid,
  milk_id uuid, powder_id uuid, mixture_id uuid, blank_id uuid, cup_id uuid,
  product_id uuid, version_id uuid, bad_product_id uuid, bad_version_id uuid,
  matcha_option_id uuid, guard_shift_id uuid, no_period_sale_id uuid,
  training_shift_id uuid, training_sale_id uuid, live_shift_id uuid,
  void_sale_id uuid, kept_sale_id uuid, upgrade_sale_id uuid, bad_sale_id uuid
) on commit drop;
grant select, insert, update on table inventory13_context to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
insert into inventory13_context (business_id)
select public.pos_bootstrap_business('Inventory 13 Test', 'I13', 'Asia/Manila');

-- The Phase-2B rollback roundtrip intentionally leaves this zero-balance
-- compatibility fixture behind. Archive/remove only that known CI fixture so
-- this behavior transaction can own the single global costing document.
reset role;
update public.pos_inventory_items as item
set active = false, revision = item.revision + 1
where item.source_costing_ingredient_id = 'inventory-2b-roundtrip-source'
  and item.active and public._pos_inventory_balance(item.business_id, item.id) = 0;
update public.scoopies_state
set data = jsonb_set(data, '{ingredients}', (
      select coalesce(jsonb_agg(source.value order by source.ordinality), '[]'::jsonb)
      from jsonb_array_elements(coalesce(data -> 'ingredients', '[]'::jsonb))
        with ordinality as source(value, ordinality)
      where btrim(coalesce(source.value ->> 'id', '')) <>
        'inventory-2b-roundtrip-source'
    ), true),
    updated_at = clock_timestamp()
where id = 'main';
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);

update public.scoopies_state
set data = jsonb_build_object(
  'schemaVersion', 3,
  'ingredientCategories', coalesce(data -> 'ingredientCategories', '[]'::jsonb)
    || jsonb_build_array(
    jsonb_build_object('id', 'milk-category', 'name', 'Milk'),
    jsonb_build_object('id', 'tea-category', 'name', 'Matcha Powder')
  ),
  'ingredients', coalesce(data -> 'ingredients', '[]'::jsonb)
    || jsonb_build_array(
    jsonb_build_object('id', 'i13-milk', 'kind', 'purchased',
      'categoryId', 'milk-category', 'name', 'Oat Milk',
      'purchaseQty', 1, 'amountPerItem', 1, 'unit', 'l', 'price', 180),
    jsonb_build_object('id', 'i13-powder', 'kind', 'purchased',
      'categoryId', 'tea-category', 'name', 'Matcha Powder',
      'purchaseQty', 1, 'amountPerItem', 100, 'unit', 'g', 'price', 500),
    jsonb_build_object('id', 'i13-foam', 'kind', 'mixture',
      'categoryId', 'milk-category', 'name', 'Milk Foam',
      'batchYield', 100, 'unit', 'ml',
      'components', jsonb_build_array(jsonb_build_object(
        'ingredientId', 'i13-milk', 'qty', 30, 'unit', 'ml'))),
    -- Named sources may leave purchase facts blank for Stocks to own.
    jsonb_build_object('id', 'i13-blank', 'kind', 'purchased',
      'categoryId', 'tea-category', 'name', 'Unpriced Powder', 'unit', 'g')
  ),
  'packaging', coalesce(data -> 'packaging', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'id', 'i13-cup', 'name', '12oz Cup', 'qty', 50, 'price', 100)),
  'recipes', coalesce(data -> 'recipes', '[]'::jsonb),
  'products', coalesce(data -> 'products', '[]'::jsonb),
  'mixtureDrafts', coalesce(data -> 'mixtureDrafts', '[]'::jsonb)
), updated_at = clock_timestamp()
where id = 'main';

-- Exercise the retained schema-12 INSERT path before the schema-13 sync.
create temporary table inventory13_legacy_sync as
select * from public.pos_inventory_sync_items(
  (select business_id from inventory13_context),
  jsonb_build_array(jsonb_build_object(
    'sourceCostingIngredientId', 'i13-blank', 'kind', 'purchased',
    'name', 'Unpriced Powder', 'baseUnit', 'g'))
);

create temporary table inventory13_sync as
select * from public.pos_inventory_sync_spreadsheet_sources(
  (select business_id from inventory13_context));
update inventory13_context
set milk_id = (select inventory_item_id from inventory13_sync
               where source_costing_id = 'i13-milk'),
    powder_id = (select inventory_item_id from inventory13_sync
                 where source_costing_id = 'i13-powder'),
    mixture_id = (select inventory_item_id from inventory13_sync
                  where source_costing_id = 'i13-foam'),
    blank_id = (select inventory_item_id from inventory13_sync
                where source_costing_id = 'i13-blank'),
    cup_id = (select inventory_item_id from inventory13_sync
              where source_type = 'packaging' and source_costing_id = 'i13-cup');

reset role;
do $$
begin
  if not exists (
    select 1 from public.pos_inventory_items as item
    where item.id = (select blank_id from inventory13_context)
      and item.source_type = 'ingredient' and item.source_costing_id = 'i13-blank'
      and item.purchase_quantity_base is null
      and item.purchase_price_centavos is null
  ) then
    raise exception 'Legacy sync compatibility or blank purchase facts are broken.';
  end if;
  if exists (
    select 1 from public.pos_inventory_get_items(
      (select business_id from inventory13_context), false)
    where source_costing_ingredient_id = 'packaging:i13-cup'
  ) then
    raise exception 'Legacy inventory read exposed a packaging row.';
  end if;
end;
$$;

-- Exercise the retained schema-12 atomic-delete tombstone INSERT path.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
update public.scoopies_state
set data = jsonb_set(
      data, '{ingredients}',
      data -> 'ingredients' || jsonb_build_array(jsonb_build_object(
        'id', 'i13-delete', 'kind', 'purchased', 'name', 'Delete Me',
        'amountPerItem', 1, 'purchaseQty', 1, 'unit', 'g', 'price', 1)), true),
    updated_at = clock_timestamp()
where id = 'main';
select public.pos_inventory_prepare_source_delete(
  (select business_id from inventory13_context),
  'i13-delete', 'purchased', 'Delete Me', 'g');

reset role;
do $$
begin
  if not exists (
    select 1 from public.pos_inventory_items
    where source_costing_ingredient_id = 'i13-delete'
      and source_type = 'ingredient' and source_costing_id = 'i13-delete'
      and active = false
  ) then
    raise exception 'Legacy atomic-delete tombstone did not receive canonical identity.';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
with published as (
  select * from public.pos_publish_costing_product(
    (select business_id from inventory13_context),
    'i13-product', 'i13-recipe', 'Matcha Latte', 17000, 6000, 200,
    jsonb_build_object(
      'schemaVersion', 1, 'sourceProductId', 'i13-product',
      'sourceRecipeId', 'i13-recipe', 'name', 'Matcha Latte', 'size', '12oz',
      'sellingPriceCentavos', 17000, 'ingredientCostCentavos', 6000,
      'packagingCostCentavos', 200,
      'recipe', jsonb_build_object(
        'id', 'i13-recipe', 'name', 'Matcha Latte', 'yield', 1,
        'lines', jsonb_build_array(
          jsonb_build_object('id', 'l1', 'ingredientId', 'i13-milk',
                             'qty', 100, 'unit', 'ml'),
          jsonb_build_object('id', 'l2', 'ingredientId', 'i13-foam',
                             'qty', 10, 'unit', 'ml'),
          jsonb_build_object('id', 'l3', 'ingredientId', 'i13-powder',
                             'qty', 2, 'unit', 'g'))),
      'ingredients', jsonb_build_array(
        jsonb_build_object('id', 'i13-milk', 'kind', 'purchased',
          'name', 'Oat Milk', 'purchaseQty', 1, 'amountPerItem', 1,
          'unit', 'l', 'price', 180),
        jsonb_build_object('id', 'i13-powder', 'kind', 'purchased',
          'name', 'Matcha Powder', 'purchaseQty', 1, 'amountPerItem', 100,
          'unit', 'g', 'price', 500),
        jsonb_build_object('id', 'i13-foam', 'kind', 'mixture',
          'name', 'Milk Foam', 'batchYield', 100, 'unit', 'ml',
          'components', jsonb_build_array(jsonb_build_object(
            'ingredientId', 'i13-milk', 'qty', 30, 'unit', 'ml')))),
      'packaging', jsonb_build_array(jsonb_build_object(
        'id', 'i13-cup', 'name', '12oz Cup', 'qty', 50, 'price', 100)),
      'packagingLines', jsonb_build_array(jsonb_build_object(
        'id', 'p1', 'packagingId', 'i13-cup', 'qty', 1))),
    '12oz', 'Drinks', null))
update inventory13_context
set product_id = published.product_id, version_id = published.version_id
from published;

-- This valid immutable snapshot references a source never synchronized.
with published as (
  select * from public.pos_publish_costing_product(
    (select business_id from inventory13_context),
    'i13-bad-product', 'i13-bad-recipe', 'Ghost Latte', 10000, 1000, 0,
    jsonb_build_object(
      'schemaVersion', 1, 'sourceProductId', 'i13-bad-product',
      'sourceRecipeId', 'i13-bad-recipe', 'name', 'Ghost Latte', 'size', '12oz',
      'sellingPriceCentavos', 10000, 'ingredientCostCentavos', 1000,
      'packagingCostCentavos', 0,
      'recipe', jsonb_build_object(
        'id', 'i13-bad-recipe', 'name', 'Ghost Latte', 'yield', 1,
        'lines', jsonb_build_array(jsonb_build_object(
          'id', 'g1', 'ingredientId', 'i13-ghost', 'qty', 1, 'unit', 'g'))),
      'ingredients', jsonb_build_array(jsonb_build_object(
        'id', 'i13-ghost', 'kind', 'purchased', 'name', 'Ghost Powder',
        'purchaseQty', 1, 'amountPerItem', 100, 'unit', 'g', 'price', 100)),
      'packaging', '[]'::jsonb, 'packagingLines', '[]'::jsonb),
    '12oz', 'Drinks', null))
update inventory13_context
set bad_product_id = published.product_id, bad_version_id = published.version_id
from published;

reset role;
with inserted as (
  insert into public.pos_product_matcha_options (
    business_id, product_id, code, display_name, surcharge_centavos,
    ingredient_cost_delta_centavos, created_by
  ) values (
    (select business_id from inventory13_context),
    (select product_id from inventory13_context),
    'inventory13_upgrade', 'Inventory 13 Upgrade', 7000, 1000,
    '13000000-0000-4000-8000-000000000001'
  ) returning id
)
update inventory13_context set matcha_option_id = inserted.id from inserted;

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);

-- Live shift blocks period start; its sale succeeds with a no-period exception.
with opened as (
  select * from public.pos_open_shift(
    (select business_id from inventory13_context), false, 0))
update inventory13_context set guard_shift_id = opened.shift_id from opened;
do $$
begin
  begin
    perform * from public.pos_inventory_start_period(
      (select business_id from inventory13_context),
      '13000000-0000-4000-8000-000000000009', 'Must be blocked', false);
    raise exception 'Start unexpectedly succeeded with an open Live shift.';
  exception when sqlstate '55000' then null;
  end;
end;
$$;
with completed as (
  select * from public.pos_complete_shift_sale_v3(
    (select business_id from inventory13_context),
    (select guard_shift_id from inventory13_context), false,
    '13000000-0000-4000-8000-000000000008',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from inventory13_context),
      'product_version_id', (select version_id from inventory13_context),
      'quantity', 1, 'matcha_option_id', null, 'matcha_option_revision', null)),
    'cash', 17000, null, 'No period sale'))
update inventory13_context set no_period_sale_id = completed.sale_id from completed;
select * from public.pos_close_shift(
  (select business_id from inventory13_context),
  (select guard_shift_id from inventory13_context), 17000, 0, 0, 'Guard shift');
reset role;
do $$
begin
  if not exists (
    select 1 from public.pos_inventory_exceptions
    where sale_id = (select no_period_sale_id from inventory13_context)
      and exception_code = 'no_open_period'
  ) or exists (
    select 1 from public.pos_inventory_transactions
    where source_sale_id = (select no_period_sale_id from inventory13_context)
  ) then raise exception 'No-open-period sale was blocked or moved stock.'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
with started as (
  select * from public.pos_inventory_start_period(
    (select business_id from inventory13_context),
    '13000000-0000-4000-8000-000000000010', 'Popup Day', false))
update inventory13_context set period_id = started.period_id from started;

-- Explicit zero is counted; blank remains NOT COUNTED.
select * from public.pos_inventory_set_spreadsheet_cell(
  (select business_id from inventory13_context), (select period_id from inventory13_context),
  (select mixture_id from inventory13_context),
  '13000000-0000-4000-8000-000000000011', 'opening_stock', '0', 1, 1);
select * from public.pos_inventory_set_spreadsheet_cell(
  (select business_id from inventory13_context), (select period_id from inventory13_context),
  (select powder_id from inventory13_context),
  '13000000-0000-4000-8000-000000000012', 'opening_stock', '1', 1, 1);
select * from public.pos_inventory_set_spreadsheet_cell(
  (select business_id from inventory13_context), (select period_id from inventory13_context),
  (select cup_id from inventory13_context),
  '13000000-0000-4000-8000-000000000013', 'opening_stock', '5', 1, 1);

-- Stocks owns purchase facts after creation.
select * from public.pos_inventory_set_spreadsheet_cell(
  (select business_id from inventory13_context), (select period_id from inventory13_context),
  (select milk_id from inventory13_context),
  '13000000-0000-4000-8000-000000000014', 'purchase_quantity', '2', 1, 1);
select * from public.pos_inventory_set_spreadsheet_cell(
  (select business_id from inventory13_context), (select period_id from inventory13_context),
  (select milk_id from inventory13_context),
  '13000000-0000-4000-8000-000000000015', 'purchase_price', '360', 2, 2);
select * from public.pos_inventory_set_spreadsheet_cell(
  (select business_id from inventory13_context), (select period_id from inventory13_context),
  (select milk_id from inventory13_context),
  '13000000-0000-4000-8000-000000000016', 'row_color', '#ff00aa', 3, 3);
create temporary table inventory13_retry as
select * from public.pos_inventory_set_spreadsheet_cell(
  (select business_id from inventory13_context), (select period_id from inventory13_context),
  (select milk_id from inventory13_context),
  '13000000-0000-4000-8000-000000000016', 'row_color', '#ff00aa', 3, 3);
do $$
begin
  begin
    perform * from public.pos_inventory_set_spreadsheet_cell(
      (select business_id from inventory13_context),
      (select period_id from inventory13_context),
      (select milk_id from inventory13_context),
      '13000000-0000-4000-8000-000000000017', 'row_color', '#00387F', 1, 1);
    raise exception 'A stale concurrent cell save unexpectedly succeeded.';
  exception when sqlstate '40001' then null;
  end;
end;
$$;

select * from public.pos_inventory_sync_spreadsheet_sources(
  (select business_id from inventory13_context));
reset role;
do $$
begin
  if not (select is_retry from inventory13_retry)
    or (select count(*) from public.pos_inventory_cell_events
        where client_mutation_id = '13000000-0000-4000-8000-000000000016') <> 1 then
    raise exception 'Cell mutation retry was not idempotent.';
  end if;
  if not exists (
    select 1 from public.pos_inventory_get_spreadsheet(
      (select business_id from inventory13_context), null)
    where inventory_item_id = (select milk_id from inventory13_context)
      and opening_stock_base is null and remaining_stock_base is null
      and stock_status = 'NOT COUNTED' and purchase_quantity_base = 2000
      and purchase_price_centavos = 36000 and cost_per_unit_centavos = 18
      and row_color = '#FF00AA' and preferred_unit = 'l'
  ) then raise exception 'Blank count or spreadsheet-owned purchase facts are wrong.'; end if;
  if not exists (
    select 1 from public.pos_inventory_get_spreadsheet(
      (select business_id from inventory13_context), null)
    where inventory_item_id = (select mixture_id from inventory13_context)
      and opening_stock_base = 0 and remaining_stock_base = 0
      and stock_status = 'RESTOCK'
  ) then raise exception 'Explicit zero did not become a counted empty row.'; end if;
  if not exists (
    select 1 from public.pos_inventory_get_spreadsheet(
      (select business_id from inventory13_context), null)
    where inventory_item_id = (select blank_id from inventory13_context)
      and purchase_quantity_base is null and purchase_price_centavos is null
      and stock_status = 'NOT COUNTED'
  ) then raise exception 'Blank purchase facts did not synchronize.'; end if;
end;
$$;

-- Legacy free-form movements are forbidden while a period is open.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform * from public.pos_inventory_record_transaction(
      (select business_id from inventory13_context),
      '13000000-0000-4000-8000-000000000018', 'stock_in',
      jsonb_build_array(jsonb_build_object(
        'inventoryItemId', (select milk_id from inventory13_context),
        'quantity', 1, 'unit', 'ml', 'expectedRevision', 4)),
      null, 'Must be blocked');
    raise exception 'Legacy movement unexpectedly succeeded in an open period.';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

-- Training sales never affect inventory.
with opened as (
  select * from public.pos_open_shift(
    (select business_id from inventory13_context), true, 0))
update inventory13_context set training_shift_id = opened.shift_id from opened;
with completed as (
  select * from public.pos_complete_shift_sale_v3(
    (select business_id from inventory13_context),
    (select training_shift_id from inventory13_context), true,
    '13000000-0000-4000-8000-000000000019',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from inventory13_context),
      'product_version_id', (select version_id from inventory13_context),
      'quantity', 1, 'matcha_option_id', null, 'matcha_option_revision', null)),
    'cash', 17000, null, 'Training'))
update inventory13_context set training_sale_id = completed.sale_id from completed;
select * from public.pos_close_shift(
  (select business_id from inventory13_context),
  (select training_shift_id from inventory13_context), null, null, null, 'Training close');
reset role;
do $$
begin
  if exists (select 1 from public.pos_inventory_transactions
             where source_sale_id = (select training_sale_id from inventory13_context))
    or exists (select 1 from public.pos_inventory_exceptions
               where sale_id = (select training_sale_id from inventory13_context)) then
    raise exception 'Training sale reached inventory accounting.';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
with opened as (
  select * from public.pos_open_shift(
    (select business_id from inventory13_context), false, 0))
update inventory13_context set live_shift_id = opened.shift_id from opened;

-- Two standard sales are posted; one is later exactly reversed.
with completed as (
  select * from public.pos_complete_shift_sale_v3(
    (select business_id from inventory13_context),
    (select live_shift_id from inventory13_context), false,
    '13000000-0000-4000-8000-000000000020',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from inventory13_context),
      'product_version_id', (select version_id from inventory13_context),
      'quantity', 1, 'matcha_option_id', null, 'matcha_option_revision', null)),
    'cash', 17000, null, null))
update inventory13_context set void_sale_id = completed.sale_id from completed;
with completed as (
  select * from public.pos_complete_shift_sale_v3(
    (select business_id from inventory13_context),
    (select live_shift_id from inventory13_context), false,
    '13000000-0000-4000-8000-000000000021',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from inventory13_context),
      'product_version_id', (select version_id from inventory13_context),
      'quantity', 1, 'matcha_option_id', null, 'matcha_option_revision', null)),
    'cash', 17000, null, null))
update inventory13_context set kept_sale_id = completed.sale_id from completed;

-- Enter Opening after sales; prior period movement must not be double-applied.
select * from public.pos_inventory_set_spreadsheet_cell(
  (select business_id from inventory13_context), (select period_id from inventory13_context),
  (select milk_id from inventory13_context),
  '13000000-0000-4000-8000-000000000022', 'opening_stock', '1',
  (select revision from public.pos_inventory_get_spreadsheet(
     (select business_id from inventory13_context),
     (select period_id from inventory13_context))
   where inventory_item_id = (select milk_id from inventory13_context)),
  (select period_item_revision from public.pos_inventory_get_spreadsheet(
     (select business_id from inventory13_context),
     (select period_id from inventory13_context))
   where inventory_item_id = (select milk_id from inventory13_context)));
reset role;
do $$
begin
  if not exists (
    select 1 from public.pos_inventory_get_spreadsheet(
      (select business_id from inventory13_context), null)
    where inventory_item_id = (select milk_id from inventory13_context)
      and opening_stock_base = 1000 and stock_used_base = 206
      and remaining_stock_base = 794 and current_balance_base = 794
  ) then
    raise exception 'Late Opening confirmation double-applied movement.';
  end if;
end;
$$;

-- Upgrades are skipped in full until physical substitution is mapped.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
with completed as (
  select * from public.pos_complete_shift_sale_v3(
    (select business_id from inventory13_context),
    (select live_shift_id from inventory13_context), false,
    '13000000-0000-4000-8000-000000000023',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from inventory13_context),
      'product_version_id', (select version_id from inventory13_context),
      'quantity', 1,
      'matcha_option_id', (select matcha_option_id from inventory13_context),
      'matcha_option_revision', 1)),
    'cash', 24000, null, 'Upgrade'))
update inventory13_context set upgrade_sale_id = completed.sale_id from completed;

-- Missing source mapping records an exception without rejecting POS.
with completed as (
  select * from public.pos_complete_shift_sale_v3(
    (select business_id from inventory13_context),
    (select live_shift_id from inventory13_context), false,
    '13000000-0000-4000-8000-000000000024',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select bad_product_id from inventory13_context),
      'product_version_id', (select bad_version_id from inventory13_context),
      'quantity', 1, 'matcha_option_id', null, 'matcha_option_revision', null)),
    'cash', 10000, null, 'Missing mapping'))
update inventory13_context set bad_sale_id = completed.sale_id from completed;
reset role;
do $$
begin
  if not exists (
    select 1 from public.pos_inventory_exceptions
    where sale_id = (select upgrade_sale_id from inventory13_context)
      and exception_code = 'matcha_upgrade_mapping_required'
  ) or exists (
    select 1 from public.pos_inventory_transactions
    where source_sale_id = (select upgrade_sale_id from inventory13_context)
  ) then raise exception 'Upgrade sale was not skipped with an exception.'; end if;
  if not exists (
    select 1 from public.pos_inventory_exceptions
    where sale_id = (select bad_sale_id from inventory13_context)
      and exception_code = 'inventory_source_missing'
  ) or exists (
    select 1 from public.pos_inventory_transactions
    where source_sale_id = (select bad_sale_id from inventory13_context)
  ) then raise exception 'Missing source did not fail open.'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
select * from public.pos_void_sale(
  (select business_id from inventory13_context),
  (select void_sale_id from inventory13_context), 'Test void before preparation');
reset role;
do $$
begin
  if (select count(*) from public.pos_inventory_transactions
      where source_sale_id = (select void_sale_id from inventory13_context)
        and transaction_type = 'sale_usage') <> 1
    or (select count(*) from public.pos_inventory_transactions
        where source_sale_id = (select void_sale_id from inventory13_context)
          and transaction_type = 'sale_reversal') <> 1 then
    raise exception 'Void did not create one exact usage reversal.';
  end if;
  if not exists (
    select 1 from public.pos_inventory_get_spreadsheet(
      (select business_id from inventory13_context), null)
    where inventory_item_id = (select milk_id from inventory13_context)
      and stock_used_base = 103 and remaining_stock_base = 897
  ) or not exists (
    select 1 from public.pos_inventory_get_spreadsheet(
      (select business_id from inventory13_context), null)
    where inventory_item_id = (select powder_id from inventory13_context)
      and stock_used_base = 2 and remaining_stock_base = -1
      and stock_status = 'RESTOCK'
  ) or not exists (
    select 1 from public.pos_inventory_get_spreadsheet(
      (select business_id from inventory13_context), null)
    where inventory_item_id = (select cup_id from inventory13_context)
      and stock_used_base = 1 and remaining_stock_base = 4
  ) or not exists (
    select 1 from public.pos_inventory_get_spreadsheet(
      (select business_id from inventory13_context), null)
    where inventory_item_id = (select mixture_id from inventory13_context)
      and stock_used_base = 0
  ) then raise exception 'Recursive use, packaging, negative balance, or reversal is wrong.'; end if;
end;
$$;

-- Period close is blocked while Live shift is open.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform * from public.pos_inventory_close_period(
      (select business_id from inventory13_context),
      (select period_id from inventory13_context),
      '13000000-0000-4000-8000-000000000029', 'Must be blocked');
    raise exception 'Period close unexpectedly succeeded with Live shift open.';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

select * from public.pos_close_shift(
  (select business_id from inventory13_context),
  (select live_shift_id from inventory13_context), 51000, 0, 0, 'Inventory test close');
create temporary table inventory13_close as
select * from public.pos_inventory_close_period(
  (select business_id from inventory13_context), (select period_id from inventory13_context),
  '13000000-0000-4000-8000-000000000030', 'Completed test period');
create temporary table inventory13_close_retry as
select * from public.pos_inventory_close_period(
  (select business_id from inventory13_context), (select period_id from inventory13_context),
  '13000000-0000-4000-8000-000000000030', 'Completed test period');

-- A stale older positive close must never win when the latest close is
-- negative. Insert the historical row after the real close so this regression
-- specifically proves that carry-forward orders first and only then decides
-- whether the latest value is safe to carry.
reset role;
insert into public.pos_inventory_periods (
  id, business_id, client_period_id, request_fingerprint, name, status,
  opened_by, opened_at, client_close_id, close_fingerprint, close_note,
  closed_by, closed_at, revision
) values (
  '13000000-0000-4000-8000-000000000090',
  (select business_id from inventory13_context),
  '13000000-0000-4000-8000-000000000091', repeat('a', 64),
  'Older Positive Period', 'closed',
  '13000000-0000-4000-8000-000000000001', '2026-01-01 08:00:00+00',
  '13000000-0000-4000-8000-000000000092', repeat('b', 64),
  'Regression fixture', '13000000-0000-4000-8000-000000000001',
  '2026-01-01 09:00:00+00', 2
);
insert into public.pos_inventory_period_items (
  business_id, period_id, inventory_item_id, opening_quantity_base,
  expected_closing_quantity_base, revision
) values (
  (select business_id from inventory13_context),
  '13000000-0000-4000-8000-000000000090',
  (select powder_id from inventory13_context), 50, 50, 1
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);

with started as (
  select * from public.pos_inventory_start_period(
    (select business_id from inventory13_context),
    '13000000-0000-4000-8000-000000000031', 'Next Popup', true))
update inventory13_context set next_period_id = started.period_id from started;
do $$
begin
  if (select is_retry from inventory13_close)
    or not (select is_retry from inventory13_close_retry)
    or (select status from inventory13_close) <> 'closed' then
    raise exception 'Period close retry failed.';
  end if;
  if not exists (
    select 1 from public.pos_inventory_get_spreadsheet(
      (select business_id from inventory13_context),
      (select next_period_id from inventory13_context))
    where inventory_item_id = (select powder_id from inventory13_context)
      and opening_stock_base is null and stock_status = 'NOT COUNTED'
  ) then raise exception 'Latest negative close incorrectly fell back to an older positive close.'; end if;
  if not exists (
    select 1 from public.pos_inventory_get_spreadsheet(
      (select business_id from inventory13_context),
      (select next_period_id from inventory13_context))
    where inventory_item_id = (select milk_id from inventory13_context)
      and opening_stock_base = 897
  ) then raise exception 'Nonnegative close did not carry forward.'; end if;
end;
$$;

-- Nonzero packaging deletion blocks; zero-balance deletion archives atomically.
do $$
begin
  begin
    update public.scoopies_state
    set data = jsonb_set(data, '{packaging}', (
          select coalesce(jsonb_agg(package.value order by package.ordinality), '[]'::jsonb)
          from jsonb_array_elements(coalesce(data -> 'packaging', '[]'::jsonb))
            with ordinality as package(value, ordinality)
          where btrim(coalesce(package.value ->> 'id', '')) <> 'i13-cup'
        ), true),
        updated_at = clock_timestamp()
    where id = 'main';
    raise exception 'Nonzero packaging deletion unexpectedly succeeded.';
  exception when sqlstate '55000' then null;
  end;
end;
$$;
select * from public.pos_inventory_set_spreadsheet_cell(
  (select business_id from inventory13_context),
  (select next_period_id from inventory13_context),
  (select cup_id from inventory13_context),
  '13000000-0000-4000-8000-000000000032', 'opening_stock', '0',
  (select revision from public.pos_inventory_get_spreadsheet(
     (select business_id from inventory13_context),
     (select next_period_id from inventory13_context))
   where inventory_item_id = (select cup_id from inventory13_context)),
  (select period_item_revision from public.pos_inventory_get_spreadsheet(
     (select business_id from inventory13_context),
     (select next_period_id from inventory13_context))
   where inventory_item_id = (select cup_id from inventory13_context)));
update public.scoopies_state
set data = jsonb_set(data, '{packaging}', (
      select coalesce(jsonb_agg(package.value order by package.ordinality), '[]'::jsonb)
      from jsonb_array_elements(coalesce(data -> 'packaging', '[]'::jsonb))
        with ordinality as package(value, ordinality)
      where btrim(coalesce(package.value ->> 'id', '')) <> 'i13-cup'
    ), true),
    updated_at = clock_timestamp()
where id = 'main';
reset role;
do $$
begin
  if not exists (
    select 1 from public.pos_inventory_items
    where id = (select cup_id from inventory13_context) and active = false
  ) then raise exception 'Zero-balance packaging deletion did not archive its row.'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    update public.scoopies_state
    set data = jsonb_set(data, '{packaging}',
          coalesce(data -> 'packaging', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'id', 'i13-cup', 'name', '12oz Cup', 'qty', 50, 'price', 100)), true),
        updated_at = clock_timestamp()
    where id = 'main';
    raise exception 'A stale save restored archived packaging identity.';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

rollback;
