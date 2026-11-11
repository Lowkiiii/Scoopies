-- Safe rollback for schema 13. This is intentionally validation-only after
-- any period, spreadsheet audit, packaging identity, exception, or automatic
-- movement exists. Never erase an operational inventory ledger to roll back.

begin;

do $$
declare
  v_version integer;
  v_name text;
begin
  select (value ->> 'version')::integer, value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata
  where key = 'schema_version'
  for update;
  if v_version is distinct from 13
    or v_name is distinct from 'inventory_period_spreadsheet' then
    raise exception 'Refusing schema-13 rollback: found %:%.',
      coalesce(v_version::text, '<missing>'), coalesce(v_name, '<missing>');
  end if;
  if exists (select 1 from public.pos_inventory_periods)
    or exists (select 1 from public.pos_inventory_cell_events)
    or exists (select 1 from public.pos_inventory_exceptions)
    or exists (
      select 1 from public.pos_inventory_transactions
      where transaction_type in ('period_cell_adjustment', 'sale_usage', 'sale_reversal')
    )
    or exists (
      select 1 from public.pos_inventory_items where source_type <> 'ingredient'
    )
    or exists (
      select source_costing_id
      from public.pos_inventory_items
      group by source_costing_id having count(*) > 1
    )
    or exists (
      select 1 from public.pos_inventory_transaction_lines
      where balance_before_base < 0 or balance_after_base < 0
    ) then
    raise exception 'Schema 13 contains operational data and cannot be destructively rolled back. Deploy a forward fix instead.'
      using errcode = '55000';
  end if;
end;
$$;

drop trigger pos_inventory_packaging_state_guard on public.scoopies_state;
drop trigger pos_inventory_sale_events_apply on public.pos_sale_events;
drop trigger pos_inventory_items_fill_source_identity on public.pos_inventory_items;
drop trigger pos_inventory_transactions_period_guard on public.pos_inventory_transactions;
drop trigger pos_inventory_cell_events_immutable on public.pos_inventory_cell_events;

drop function public.pos_inventory_get_spreadsheet(uuid, uuid);
drop function public.pos_inventory_set_spreadsheet_cell(
  uuid, uuid, uuid, uuid, text, text, bigint, bigint
);
drop function public.pos_inventory_close_period(uuid, uuid, uuid, text);
drop function public.pos_inventory_start_period(uuid, uuid, text, boolean);
drop function public.pos_inventory_sync_spreadsheet_sources(uuid);
drop function public._pos_inventory_sale_event_trigger();
drop function public._pos_inventory_snapshot_components(jsonb);
drop function public._pos_inventory_expand_snapshot_ingredient(
  jsonb, text, numeric, integer, text[]
);
drop function public._pos_inventory_display_factor(text);
drop function public.pos_inventory_guard_packaging_state();
drop function public.pos_inventory_protect_period_append_only();
drop function public.pos_inventory_fill_source_identity();
drop function public.pos_inventory_guard_legacy_period_movement();

drop index public.pos_inventory_transactions_sale_usage_uq;
drop index public.pos_inventory_transactions_sale_event_uq;

alter table public.pos_inventory_transactions
  drop column inventory_period_id,
  drop column source_sale_id,
  drop column source_sale_event_id,
  drop column reverses_transaction_id,
  drop constraint pos_inventory_transactions_transaction_type_check,
  add constraint pos_inventory_transactions_transaction_type_check
    check (transaction_type in ('stock_in', 'waste', 'correction', 'stock_count'));

alter table public.pos_inventory_transaction_lines
  drop constraint pos_inventory_transaction_lines_balance_before_base_check,
  drop constraint pos_inventory_transaction_lines_balance_after_base_check,
  add constraint pos_inventory_transaction_lines_balance_before_base_check
    check (balance_before_base between 0 and 1000000000000),
  add constraint pos_inventory_transaction_lines_balance_after_base_check
    check (balance_after_base between 0 and 1000000000000);

drop table public.pos_inventory_exceptions;
drop table public.pos_inventory_cell_events;
drop table public.pos_inventory_period_items;
drop table public.pos_inventory_periods;

drop index public.pos_inventory_items_business_source_uq;
drop index public.pos_inventory_items_ingredient_compat_source_uq;

alter table public.pos_inventory_items
  drop constraint pos_inventory_items_item_kind_check,
  drop column source_type,
  drop column source_costing_id,
  drop column row_color_hex,
  drop column purchase_quantity_base,
  drop column purchase_price_centavos,
  add constraint pos_inventory_items_item_kind_check
    check (item_kind in ('purchased', 'mixture')),
  add unique (business_id, source_costing_ingredient_id),
  add unique (source_costing_ingredient_id);

create or replace function public.pos_inventory_protect_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Inventory items cannot be deleted; deactivate the item instead.'
      using errcode = '55000';
  end if;
  if new.business_id is distinct from old.business_id
    or new.id is distinct from old.id
    or new.source_costing_ingredient_id is distinct from old.source_costing_ingredient_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Inventory item identity fields cannot be changed.' using errcode = '55000';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'Inventory item revision must increase exactly once per change.'
      using errcode = '55000';
  end if;
  if new.item_kind is distinct from old.item_kind
    or new.base_unit is distinct from old.base_unit then
    raise exception 'An inventory item kind or base unit cannot change after its identity is created; create a new costing ingredient instead.'
      using errcode = '55000';
  end if;
  if old.active = true and new.active = false
    and public._pos_inventory_balance(old.business_id, old.id) <> 0 then
    raise exception 'Stock must be zero before an inventory item can be deactivated.'
      using errcode = '55000';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

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
  left join public.scoopies_state as costing
    on costing.id = 'main'
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
    and (p_include_inactive or item.active)
  order by item.active desc, pg_catalog.lower(item.name), item.id;
end;
$$;

update public.pos_system_metadata
set value = jsonb_build_object('version', 12, 'name', 'inventory_phase_2b_category'),
    updated_at = now()
where key = 'schema_version';

commit;
