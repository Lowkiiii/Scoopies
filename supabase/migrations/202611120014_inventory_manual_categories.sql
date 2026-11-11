-- Matcha Luna inventory schema 14: inventory-owned manual categories.
--
-- Categories in Stocks are operational labels, not costing taxonomy.  This
-- migration snapshots the label schema 13 displayed, then lets an owner or
-- manager edit that label without opening an inventory period.  Source sync
-- never overwrites the inventory-owned value.

begin;

do $$
declare
  v_version integer;
  v_name text;
begin
  select (metadata.value ->> 'version')::integer,
         metadata.value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata as metadata
  where metadata.key = 'schema_version'
  for update;

  if v_version is distinct from 13
    or v_name is distinct from 'inventory_period_spreadsheet' then
    raise exception
      'Refusing schema-14 migration: expected 13:inventory_period_spreadsheet, found %:%.',
      coalesce(v_version::text, '<missing>'), coalesce(v_name, '<missing>');
  end if;
end;
$$;

alter table public.pos_inventory_items
  add column inventory_category text,
  add constraint pos_inventory_items_inventory_category_check
    check (
      inventory_category is null
      or (
        inventory_category = btrim(inventory_category)
        and char_length(inventory_category) between 1 and 120
      )
    );

-- Preserve exactly the label schema 13 showed, including inactive rows.  The
-- item guard requires every persisted item change to advance its revision, so
-- cached editors correctly refresh after the ownership transfer.
with category_labels as (
  select item.id,
         case
           when item.source_type = 'packaging' then 'Packaging'::text
           when costing_source.value is null then 'Removed from costing'::text
           else coalesce(
             nullif(btrim(costing_category.value ->> 'name'), ''),
             'Uncategorized'
           )
         end as category_name
  from public.pos_inventory_items as item
  left join public.scoopies_state as costing on costing.id = 'main'
  left join lateral (
    select source.value
    from jsonb_array_elements(
      case when jsonb_typeof(costing.data -> 'ingredients') = 'array'
        then costing.data -> 'ingredients' else '[]'::jsonb end
    ) with ordinality as source(value, ordinality)
    where item.source_type = 'ingredient'
      and jsonb_typeof(source.value) = 'object'
      and btrim(coalesce(source.value ->> 'id', '')) = item.source_costing_id
    order by source.ordinality
    limit 1
  ) as costing_source on true
  left join lateral (
    select category.value
    from jsonb_array_elements(
      case when jsonb_typeof(costing.data -> 'ingredientCategories') = 'array'
        then costing.data -> 'ingredientCategories' else '[]'::jsonb end
    ) with ordinality as category(value, ordinality)
    where jsonb_typeof(category.value) = 'object'
      and btrim(coalesce(category.value ->> 'id', '')) =
        btrim(coalesce(costing_source.value ->> 'categoryId', ''))
    order by category.ordinality
    limit 1
  ) as costing_category on true
)
update public.pos_inventory_items as item
set inventory_category = category_labels.category_name,
    revision = item.revision + 1
from category_labels
where item.id = category_labels.id;

create function public.pos_inventory_update_item_category(
  p_business_id uuid,
  p_inventory_item_id uuid,
  p_category text,
  p_expected_revision bigint
)
returns table (
  inventory_item_id uuid,
  category_name text,
  revision bigint,
  updated_at timestamptz,
  is_retry boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.pos_inventory_items%rowtype;
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can change inventory categories.'
      using errcode = '42501';
  end if;
  if p_inventory_item_id is null then
    raise exception 'Inventory item ID is required.' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'A positive expected item revision is required.' using errcode = '22023';
  end if;
  if v_category is not null and char_length(v_category) > 120 then
    raise exception 'Category must be at most 120 characters.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-inventory:' || p_business_id::text, 0)
  );
  select item.* into v_item
  from public.pos_inventory_items as item
  where item.business_id = p_business_id and item.id = p_inventory_item_id
  for update;
  if not found then
    raise exception 'The inventory item was not found.' using errcode = 'P0002';
  end if;
  if not v_item.active then
    raise exception 'Inactive inventory item categories cannot be changed.'
      using errcode = '55000';
  end if;

  -- A repeated save after a lost response is safe even when its expected
  -- revision is now stale, provided the requested value already won.
  if v_item.inventory_category is not distinct from v_category then
    return query select v_item.id, coalesce(v_item.inventory_category, ''),
      v_item.revision, v_item.updated_at, true;
    return;
  end if;
  if v_item.revision <> p_expected_revision then
    raise exception 'The inventory item changed on another device. Refresh and try again.'
      using errcode = '40001';
  end if;

  update public.pos_inventory_items as item
  set inventory_category = v_category,
      revision = item.revision + 1,
      updated_by = v_user_id,
      updated_at = clock_timestamp()
  where item.business_id = p_business_id and item.id = p_inventory_item_id
  returning item.* into v_item;

  return query select v_item.id, coalesce(v_item.inventory_category, ''),
    v_item.revision, v_item.updated_at, false;
end;
$$;

create function public.pos_inventory_update_item_row_color(
  p_business_id uuid,
  p_inventory_item_id uuid,
  p_row_color text,
  p_expected_revision bigint
)
returns table (
  inventory_item_id uuid,
  row_color text,
  revision bigint,
  updated_at timestamptz,
  is_retry boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.pos_inventory_items%rowtype;
  v_color text := nullif(upper(btrim(coalesce(p_row_color, ''))), '');
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can change inventory row colors.'
      using errcode = '42501';
  end if;
  if p_inventory_item_id is null then
    raise exception 'Inventory item ID is required.' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'A positive expected item revision is required.' using errcode = '22023';
  end if;
  if v_color is not null and v_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Row color must be a six-digit hex color.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-inventory:' || p_business_id::text, 0)
  );
  select item.* into v_item
  from public.pos_inventory_items as item
  where item.business_id = p_business_id and item.id = p_inventory_item_id
  for update;
  if not found then
    raise exception 'The inventory item was not found.' using errcode = 'P0002';
  end if;
  if not v_item.active then
    raise exception 'Inactive inventory item row colors cannot be changed.'
      using errcode = '55000';
  end if;
  if v_item.row_color_hex is not distinct from v_color then
    return query select v_item.id, coalesce(v_item.row_color_hex, ''),
      v_item.revision, v_item.updated_at, true;
    return;
  end if;
  if v_item.revision <> p_expected_revision then
    raise exception 'The inventory item changed on another device. Refresh and try again.'
      using errcode = '40001';
  end if;

  update public.pos_inventory_items as item
  set row_color_hex = v_color,
      revision = item.revision + 1,
      updated_by = v_user_id,
      updated_at = clock_timestamp()
  where item.business_id = p_business_id and item.id = p_inventory_item_id
  returning item.* into v_item;

  return query select v_item.id, coalesce(v_item.row_color_hex, ''),
    v_item.revision, v_item.updated_at, false;
end;
$$;

-- Preserve the cached schema-12 read shape while replacing the derived
-- costing category with the inventory-owned manual label.
create or replace function public.pos_inventory_get_items(
  p_business_id uuid,
  p_include_inactive boolean default false
)
returns table (
  inventory_item_id uuid,
  source_costing_ingredient_id text,
  item_kind text,
  name text,
  base_unit text,
  preferred_unit text,
  category_name text,
  brand text,
  purchased_from text,
  last_stocked_on date,
  notes text,
  current_balance_base numeric,
  low_stock_threshold_base numeric,
  is_low_stock boolean,
  has_stock_history boolean,
  initialized boolean,
  active boolean,
  revision bigint,
  last_movement_at timestamptz,
  last_movement_type text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_is_member(p_business_id) then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;
  if p_include_inactive is null then
    raise exception 'Include-inactive flag is required.' using errcode = '22023';
  end if;
  if p_include_inactive
    and not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can include inactive inventory items.'
      using errcode = '42501';
  end if;

  return query
  select item.id, item.source_costing_ingredient_id, item.item_kind,
         item.name, item.base_unit,
         coalesce(item.preferred_unit, item.base_unit),
         coalesce(item.inventory_category, ''),
         item.legacy_brand,
         item.purchased_from, item.last_stocked_on, item.notes,
         coalesce(history.balance, 0)::numeric,
         item.low_stock_threshold_base,
         (item.active and coalesce(history.has_stock_history, false)
           and item.low_stock_threshold_base is not null
           and coalesce(history.balance, 0) <= item.low_stock_threshold_base),
         coalesce(history.has_stock_history, false),
         coalesce(history.has_stock_history, false),
         item.active, item.revision, latest.occurred_at,
         latest.transaction_type, item.updated_at
  from public.pos_inventory_items as item
  left join lateral (
    select coalesce(sum(line.quantity_delta_base), 0)::numeric as balance,
           (count(*) > 0) as has_stock_history
    from public.pos_inventory_transaction_lines as line
    where line.business_id = item.business_id
      and line.inventory_item_id = item.id
  ) as history on true
  left join lateral (
    select inventory_tx.occurred_at, inventory_tx.transaction_type
    from public.pos_inventory_transaction_lines as line
    join public.pos_inventory_transactions as inventory_tx
      on inventory_tx.business_id = line.business_id
     and inventory_tx.id = line.transaction_id
    where line.business_id = item.business_id
      and line.inventory_item_id = item.id
    order by line.item_sequence desc
    limit 1
  ) as latest on true
  where item.business_id = p_business_id
    and item.source_type = 'ingredient'
    and (p_include_inactive or item.active)
  order by item.active desc, pg_catalog.lower(item.name), item.id;
end;
$$;

create or replace function public.pos_inventory_get_spreadsheet(
  p_business_id uuid,
  p_period_id uuid default null
)
returns table (
  active_period_id uuid,
  active_period_name text,
  active_period_status text,
  active_period_opened_at timestamptz,
  active_period_revision bigint,
  inventory_item_id uuid,
  source_type text,
  source_costing_id text,
  source_costing_ingredient_id text,
  item_kind text,
  category_name text,
  name text,
  base_unit text,
  preferred_unit text,
  opening_stock_base numeric,
  stock_added_base numeric,
  stock_used_base numeric,
  wasted_base numeric,
  remaining_stock_base numeric,
  current_balance_base numeric,
  low_stock_threshold_base numeric,
  purchase_quantity_base numeric,
  purchase_price_centavos bigint,
  cost_per_unit_centavos numeric,
  remaining_value_centavos numeric,
  stock_status text,
  row_color text,
  revision bigint,
  period_item_revision bigint,
  has_stock_history boolean,
  initialized boolean,
  active boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_period_id uuid := p_period_id;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_is_member(p_business_id) then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;
  if v_period_id is null then
    select period.id into v_period_id
    from public.pos_inventory_periods as period
    where period.business_id = p_business_id and period.status = 'open'
    order by period.opened_at desc, period.id desc
    limit 1;
  elsif not exists (
    select 1 from public.pos_inventory_periods as period
    where period.business_id = p_business_id and period.id = v_period_id
  ) then
    raise exception 'The inventory period was not found.' using errcode = 'P0002';
  end if;

  return query
  with rows as (
    select period.id as period_id, period.name as period_name,
           period.status as period_status, period.opened_at,
           coalesce(period.revision, 0)::bigint as period_revision,
           item.id as inventory_item_id, item.source_type,
           item.source_costing_id, item.source_costing_ingredient_id,
           item.item_kind, coalesce(item.inventory_category, '') as category_name,
           item.name as item_name, item.base_unit,
           coalesce(item.preferred_unit, item.base_unit) as preferred_unit,
           period_item.opening_quantity_base::numeric as opening_base,
           coalesce(period_item.stock_added_base, 0)::numeric as stock_added_base,
           coalesce(period_item.wasted_damaged_base, 0)::numeric as wasted_base,
           coalesce(movement.quantity_delta_base, 0)::numeric as sale_delta_base,
           item.low_stock_threshold_base,
           item.purchase_quantity_base,
           item.purchase_price_centavos,
           item.row_color_hex, item.revision as item_revision,
           coalesce(period_item.revision, 0)::bigint as period_item_revision,
           item.updated_at
    from public.pos_inventory_items as item
    left join public.pos_inventory_periods as period
      on period.business_id = item.business_id and period.id = v_period_id
    left join public.pos_inventory_period_items as period_item
      on period_item.business_id = item.business_id
     and period_item.period_id = period.id
     and period_item.inventory_item_id = item.id
    left join lateral (
      select coalesce(sum(line.quantity_delta_base), 0)::numeric
        as quantity_delta_base
      from public.pos_inventory_transactions as inventory_tx
      join public.pos_inventory_transaction_lines as line
        on line.business_id = inventory_tx.business_id
       and line.transaction_id = inventory_tx.id
      where inventory_tx.business_id = item.business_id
        and inventory_tx.inventory_period_id = period.id
        and inventory_tx.transaction_type in ('sale_usage', 'sale_reversal')
        and line.inventory_item_id = item.id
    ) as movement on true
    where item.business_id = p_business_id and item.active = true
  ), calculated as (
    select rows.*,
           greatest(0::numeric, -rows.sale_delta_base) as stock_used_base,
           rows.opening_base + rows.stock_added_base - rows.wasted_base
             + rows.sale_delta_base as remaining_base
    from rows
  )
  select calculated.period_id, calculated.period_name,
         calculated.period_status, calculated.opened_at,
         calculated.period_revision, calculated.inventory_item_id,
         calculated.source_type, calculated.source_costing_id,
         calculated.source_costing_ingredient_id, calculated.item_kind,
         calculated.category_name, calculated.item_name,
         calculated.base_unit, calculated.preferred_unit,
         calculated.opening_base,
         calculated.stock_added_base,
         calculated.stock_used_base,
         calculated.wasted_base,
         calculated.remaining_base,
         calculated.remaining_base,
         calculated.low_stock_threshold_base,
         calculated.purchase_quantity_base,
         calculated.purchase_price_centavos,
         case when calculated.purchase_quantity_base > 0
           then calculated.purchase_price_centavos::numeric
             / calculated.purchase_quantity_base
           else null::numeric end,
         case when calculated.purchase_quantity_base > 0
           and calculated.purchase_price_centavos is not null
           then calculated.remaining_base
             * calculated.purchase_price_centavos::numeric
             / calculated.purchase_quantity_base
           else null::numeric end,
         case when calculated.period_id is null
                or calculated.opening_base is null then 'NOT COUNTED'::text
           when calculated.remaining_base <= 0 then 'RESTOCK'::text
           when calculated.low_stock_threshold_base is not null
             and calculated.remaining_base <= calculated.low_stock_threshold_base
             then 'RESTOCK'::text
           else 'OK'::text end,
         calculated.row_color_hex, calculated.item_revision,
         calculated.period_item_revision,
         calculated.opening_base is not null,
         calculated.opening_base is not null,
         true, calculated.updated_at
  from calculated
  order by lower(calculated.category_name), lower(calculated.item_name),
           calculated.inventory_item_id;
end;
$$;

revoke all on function public.pos_inventory_update_item_category(
  uuid, uuid, text, bigint
) from public, anon, authenticated;
revoke all on function public.pos_inventory_update_item_row_color(
  uuid, uuid, text, bigint
) from public, anon, authenticated;
grant execute on function public.pos_inventory_update_item_category(
  uuid, uuid, text, bigint
) to authenticated;
grant execute on function public.pos_inventory_update_item_row_color(
  uuid, uuid, text, bigint
) to authenticated;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 14, 'name', 'inventory_manual_categories'),
  now()
)
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;

comment on column public.pos_inventory_items.inventory_category is
  'Inventory-owned free-text category. Costing sync never overwrites it.';
comment on function public.pos_inventory_update_item_category(uuid, uuid, text, bigint) is
  'Updates one inventory-owned category with optimistic revision protection; no inventory period is required.';
comment on function public.pos_inventory_update_item_row_color(uuid, uuid, text, bigint) is
  'Updates one inventory row color with optimistic revision protection; no inventory period is required.';

commit;
