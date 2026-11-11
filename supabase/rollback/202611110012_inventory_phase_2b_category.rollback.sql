-- Inventory Phase 2B canonical-category rollback.
--
-- The former brand column was renamed, never copied or discarded. This
-- rollback therefore restores the schema-11 name and RPC surface without
-- losing legacy brand values or any Phase 2A item details.

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

  if v_version is distinct from 12
    or v_name is distinct from 'inventory_phase_2b_category' then
    raise exception
      'Inventory Phase 2B rollback blocked: expected schema 12:inventory_phase_2b_category, found %:%.',
      coalesce(v_version::text, '<missing>'), coalesce(v_name, '<missing>')
      using errcode = '55000';
  end if;
end;
$$;

drop function public.pos_inventory_update_item_details_v2(
  uuid, uuid, text, date, text, text, bigint
);
drop function public.pos_inventory_get_items(uuid, boolean);

alter table public.pos_inventory_items
  rename column legacy_brand to brand;

alter table public.pos_inventory_items
  rename constraint pos_inventory_items_legacy_brand_check
  to pos_inventory_items_brand_check;

create function public.pos_inventory_get_items(
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
         item.brand, item.purchased_from, item.last_stocked_on, item.notes,
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
    and (p_include_inactive or item.active)
  order by item.active desc, pg_catalog.lower(item.name), item.id;
end;
$$;

create or replace function public.pos_inventory_update_item_details(
  p_business_id uuid,
  p_inventory_item_id uuid,
  p_brand text,
  p_purchased_from text,
  p_last_stocked_on date,
  p_notes text,
  p_preferred_unit text,
  p_expected_revision bigint
)
returns table (
  inventory_item_id uuid,
  brand text,
  purchased_from text,
  last_stocked_on date,
  notes text,
  preferred_unit text,
  active boolean,
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
  v_timezone text;
  v_business_date date;
  v_brand text := nullif(btrim(coalesce(p_brand, '')), '');
  v_purchased_from text := nullif(btrim(coalesce(p_purchased_from, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_preferred_unit text := nullif(pg_catalog.lower(btrim(coalesce(p_preferred_unit, ''))), '');
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can change inventory item details.'
      using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'A positive expected item revision is required.' using errcode = '22023';
  end if;

  select business.timezone
    into strict v_timezone
  from public.pos_businesses as business
  where business.id = p_business_id;
  v_business_date := (pg_catalog.timezone(v_timezone, pg_catalog.now()))::date;

  if v_brand is not null and char_length(v_brand) > 120 then
    raise exception 'Brand must be at most 120 characters.' using errcode = '22023';
  end if;
  if v_purchased_from is not null and char_length(v_purchased_from) > 160 then
    raise exception 'Purchased-from value must be at most 160 characters.'
      using errcode = '22023';
  end if;
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception 'Notes must be at most 1000 characters.' using errcode = '22023';
  end if;
  if p_last_stocked_on is not null
    and p_last_stocked_on > v_business_date then
    raise exception 'Stocked date cannot be in the future for the business timezone.'
      using errcode = '22023';
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
    raise exception 'Inactive inventory item details cannot be changed.'
      using errcode = '55000';
  end if;

  v_preferred_unit := coalesce(v_preferred_unit, v_item.base_unit);
  if not (
    (v_item.base_unit = 'g' and v_preferred_unit in ('g', 'kg'))
    or (v_item.base_unit = 'ml' and v_preferred_unit in ('ml', 'l'))
    or (v_item.base_unit = 'piece' and v_preferred_unit = 'piece')
  ) then
    raise exception 'Preferred unit % is incompatible with the item base unit %.',
      v_preferred_unit, v_item.base_unit using errcode = '22023';
  end if;

  if v_item.brand is not distinct from v_brand
    and v_item.purchased_from is not distinct from v_purchased_from
    and v_item.last_stocked_on is not distinct from p_last_stocked_on
    and v_item.notes is not distinct from v_notes
    and coalesce(v_item.preferred_unit, v_item.base_unit) = v_preferred_unit then
    return query select v_item.id, v_item.brand, v_item.purchased_from,
      v_item.last_stocked_on, v_item.notes,
      coalesce(v_item.preferred_unit, v_item.base_unit),
      v_item.active, v_item.revision, v_item.updated_at, true;
    return;
  end if;

  if v_item.revision <> p_expected_revision then
    raise exception 'The inventory item changed on another device. Refresh and try again.'
      using errcode = '40001';
  end if;

  update public.pos_inventory_items as item
  set brand = v_brand,
      purchased_from = v_purchased_from,
      last_stocked_on = p_last_stocked_on,
      notes = v_notes,
      preferred_unit = v_preferred_unit,
      revision = item.revision + 1,
      updated_by = v_user_id
  where item.business_id = p_business_id and item.id = p_inventory_item_id
  returning item.* into v_item;

  return query select v_item.id, v_item.brand, v_item.purchased_from,
    v_item.last_stocked_on, v_item.notes,
    coalesce(v_item.preferred_unit, v_item.base_unit),
    v_item.active, v_item.revision, v_item.updated_at, false;
end;
$$;

revoke all on function public.pos_inventory_get_items(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.pos_inventory_update_item_details(
  uuid, uuid, text, text, date, text, text, bigint
) from public, anon, authenticated;

grant execute on function public.pos_inventory_get_items(uuid, boolean)
  to authenticated;
grant execute on function public.pos_inventory_update_item_details(
  uuid, uuid, text, text, date, text, text, bigint
) to authenticated;

comment on function public.pos_inventory_update_item_details(
  uuid, uuid, text, text, date, text, text, bigint
) is
  'Updates compact item details and compatible display unit with optimistic revision protection; dates use the business timezone and physical balance remains ledger-derived.';

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object(
    'version', 11,
    'name', 'inventory_phase_2a_timezone_safe_dates'
  ),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
