-- Safe rollback for schema 14.  Manual category intent must never be dropped.
-- Rollback is allowed only while every stored value still equals the exact
-- schema-13 label captured by the forward migration.

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

  if v_version is distinct from 14
    or v_name is distinct from 'inventory_manual_categories' then
    raise exception 'Refusing schema-14 rollback: found %:%.',
      coalesce(v_version::text, '<missing>'), coalesce(v_name, '<missing>');
  end if;

  if exists (
    select 1
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
    where item.inventory_category is distinct from (
      case
        when item.source_type = 'packaging' then 'Packaging'::text
        when costing_source.value is null then 'Removed from costing'::text
        else coalesce(
          nullif(btrim(costing_category.value ->> 'name'), ''),
          'Uncategorized'
        )
      end
    )
  ) then
    raise exception 'Schema-14 rollback blocked: one or more manual inventory categories would be lost.';
  end if;
end;
$$;

drop function public.pos_inventory_update_item_category(uuid, uuid, text, bigint);
drop function public.pos_inventory_update_item_row_color(uuid, uuid, text, bigint);

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
         case
           when costing_source.value is null then 'Removed from costing'::text
           else coalesce(
             nullif(btrim(costing_category.value ->> 'name'), ''),
             'Uncategorized'
           )
         end,
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
  left join public.scoopies_state as costing on costing.id = 'main'
  left join lateral (
    select source.value
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(costing.data -> 'ingredients') = 'array'
          then costing.data -> 'ingredients'
        else '[]'::jsonb
      end
    ) with ordinality as source(value, ordinality)
    where pg_catalog.jsonb_typeof(source.value) = 'object'
      and btrim(coalesce(source.value ->> 'id', '')) =
        item.source_costing_ingredient_id
    order by source.ordinality
    limit 1
  ) as costing_source on true
  left join lateral (
    select category.value
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(costing.data -> 'ingredientCategories') = 'array'
          then costing.data -> 'ingredientCategories'
        else '[]'::jsonb
      end
    ) with ordinality as category(value, ordinality)
    where pg_catalog.jsonb_typeof(category.value) = 'object'
      and btrim(coalesce(category.value ->> 'id', '')) =
        btrim(coalesce(costing_source.value ->> 'categoryId', ''))
    order by category.ordinality
    limit 1
  ) as costing_category on true
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
           item.item_kind,
           case when item.source_type = 'packaging' then 'Packaging'::text
             when costing_source.value is null then 'Removed from costing'::text
             else coalesce(nullif(btrim(category.value ->> 'name'), ''),
                           'Uncategorized') end as category_name,
           item.name as item_name,
           item.base_unit,
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
    left join public.scoopies_state as costing on costing.id = 'main'
    left join lateral (
      select source.value
      from jsonb_array_elements(
        case when jsonb_typeof(costing.data -> 'ingredients') = 'array'
          then costing.data -> 'ingredients' else '[]'::jsonb end
      ) with ordinality as source(value, ordinality)
      where item.source_type = 'ingredient'
        and btrim(coalesce(source.value ->> 'id', '')) = item.source_costing_id
      order by source.ordinality
      limit 1
    ) as costing_source on true
    left join lateral (
      select source.value
      from jsonb_array_elements(
        case when jsonb_typeof(costing.data -> 'ingredientCategories') = 'array'
          then costing.data -> 'ingredientCategories' else '[]'::jsonb end
      ) with ordinality as source(value, ordinality)
      where btrim(coalesce(source.value ->> 'id', '')) =
        btrim(coalesce(costing_source.value ->> 'categoryId', ''))
      order by source.ordinality
      limit 1
    ) as category on true
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

alter table public.pos_inventory_items
  drop constraint pos_inventory_items_inventory_category_check,
  drop column inventory_category;

update public.pos_system_metadata
set value = jsonb_build_object(
      'version', 13,
      'name', 'inventory_period_spreadsheet'
    ),
    updated_at = now()
where key = 'schema_version';

commit;
