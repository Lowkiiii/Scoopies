-- Inventory Phase 2A timezone-date rollback.
--
-- This changes no stored item data. It restores the schema-10 validation
-- function and metadata only when schema 11 is currently active.

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

  if v_version is distinct from 11
    or v_name is distinct from 'inventory_phase_2a_timezone_safe_dates' then
    raise exception
      'Inventory Phase 2A timezone rollback blocked: expected schema 11:inventory_phase_2a_timezone_safe_dates, found %:%.',
      coalesce(v_version::text, '<missing>'), coalesce(v_name, '<missing>')
      using errcode = '55000';
  end if;
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
    and p_last_stocked_on > current_date then
    raise exception 'Stocked date cannot be in the future.' using errcode = '22023';
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

revoke all on function public.pos_inventory_update_item_details(
  uuid, uuid, text, text, date, text, text, bigint
) from public, anon, authenticated;
grant execute on function public.pos_inventory_update_item_details(
  uuid, uuid, text, text, date, text, text, bigint
) to authenticated;

comment on function public.pos_inventory_update_item_details(
  uuid, uuid, text, text, date, text, text, bigint
) is
  'Updates compact item details and compatible display unit with optimistic revision protection; physical balance remains ledger-derived.';

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object(
    'version', 10,
    'name', 'inventory_phase_2a_item_details'
  ),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
