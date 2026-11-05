-- Inventory Phase 2A item-details rollback.
--
-- This rollback is intentionally loss-averse. It restores the schema-9 item
-- read contract only when no meaningful Phase 2A profile data or display-unit
-- choice would be discarded.

begin;

lock table public.pos_system_metadata, public.pos_inventory_items
in access exclusive mode;

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

  if v_version is distinct from 10
    or v_name is distinct from 'inventory_phase_2a_item_details' then
    raise exception
      'Inventory Phase 2A rollback blocked: expected schema 10:inventory_phase_2a_item_details, found %:%.',
      coalesce(v_version::text, '<missing>'), coalesce(v_name, '<missing>')
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.pos_inventory_items as item
    where item.brand is not null
       or item.purchased_from is not null
       or item.last_stocked_on is not null
       or item.notes is not null
       or (item.preferred_unit is not null
         and item.preferred_unit is distinct from item.base_unit)
  ) then
    raise exception 'Inventory Phase 2A rollback blocked: item details or a non-default display unit would be lost. Export and reconcile that data before rollback.'
      using errcode = '55000';
  end if;
end;
$$;

drop function public.pos_inventory_update_item_details(
  uuid, uuid, text, text, date, text, text, bigint
);
drop function public.pos_inventory_get_items(uuid, boolean);

alter table public.pos_inventory_items
  drop column preferred_unit,
  drop column notes,
  drop column last_stocked_on,
  drop column purchased_from,
  drop column brand;

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

revoke all on function public.pos_inventory_get_items(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.pos_inventory_get_items(uuid, boolean)
  to authenticated;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object(
    'version', 9,
    'name', 'pos_matcha_upgrades_and_product_media'
  ),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
