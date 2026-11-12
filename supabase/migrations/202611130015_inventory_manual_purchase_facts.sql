-- Matcha Luna inventory schema 15: inventory-owned purchase facts.
--
-- Costing purchase quantities and prices describe recipe cost inputs. They do
-- not establish a physical inventory purchase. Newly synchronized inventory
-- rows therefore start with blank purchase facts; owners/managers enter those
-- values explicitly in Stocks. Existing inventory rows are not rewritten.

begin;

create or replace function public.pos_inventory_sync_spreadsheet_sources(
  p_business_id uuid
)
returns table (
  inventory_item_id uuid,
  source_type text,
  source_costing_id text,
  item_kind text,
  item_name text,
  base_unit text,
  sync_result text,
  revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_data jsonb;
  v_source record;
  v_item public.pos_inventory_items%rowtype;
  v_source_type text;
  v_source_id text;
  v_kind text;
  v_name text;
  v_unit text;
  v_base text;
  v_compatibility_id text;
  v_result text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can synchronize inventory sources.'
      using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('pos-inventory:' || p_business_id::text, 0)
  );
  select costing.data into strict v_data
  from public.scoopies_state as costing
  where costing.id = 'main'
  for share;

  for v_source in
    select 'ingredient'::text as source_type, source.value,
           source.ordinality::bigint as ordinality
    from jsonb_array_elements(
      case when jsonb_typeof(v_data -> 'ingredients') = 'array'
        then v_data -> 'ingredients' else '[]'::jsonb end
    ) with ordinality as source(value, ordinality)
    union all
    select 'packaging'::text, source.value,
           1000000 + source.ordinality::bigint
    from jsonb_array_elements(
      case when jsonb_typeof(v_data -> 'packaging') = 'array'
        then v_data -> 'packaging' else '[]'::jsonb end
    ) with ordinality as source(value, ordinality)
    order by ordinality
  loop
    v_source_type := v_source.source_type;
    v_source_id := btrim(coalesce(v_source.value ->> 'id', ''));
    v_name := btrim(coalesce(v_source.value ->> 'name', ''));
    if v_name = '' then
      continue;
    end if;
    if char_length(v_source_id) not between 1 and 180
      or char_length(v_name) not between 1 and 120 then
      raise exception 'A costing source has an invalid ID or name.' using errcode = '22023';
    end if;
    if v_source_type = 'packaging' then
      v_kind := 'packaging';
      v_unit := 'piece';
      v_compatibility_id := 'packaging:' || v_source_id;
    else
      v_kind := case when v_source.value ->> 'kind' = 'mixture'
        then 'mixture' else 'purchased' end;
      v_unit := lower(btrim(coalesce(v_source.value ->> 'unit', '')));
      v_compatibility_id := v_source_id;
    end if;
    v_base := public._pos_inventory_base_unit(v_unit);
    if v_base is null then
      raise exception 'Costing source % has an invalid physical unit.', v_source_id
        using errcode = '22023';
    end if;
    select item.* into v_item
    from public.pos_inventory_items as item
    where item.source_type = v_source_type
      and item.source_costing_id = v_source_id
    order by (item.business_id = p_business_id) desc, item.business_id, item.id
    limit 1
    for update;
    if not found then
      insert into public.pos_inventory_items (
        business_id, source_costing_ingredient_id, source_type,
        source_costing_id, item_kind, name, base_unit, preferred_unit,
        created_by, updated_by
      ) values (
        p_business_id, v_compatibility_id, v_source_type,
        v_source_id, v_kind, v_name, v_base, v_unit,
        v_user_id, v_user_id
      ) returning * into v_item;
      v_result := 'created';
    elsif v_item.business_id is distinct from p_business_id then
      raise exception 'Costing source % is already attached to another business inventory.',
        v_source_id using errcode = '55000';
    elsif v_item.item_kind is distinct from v_kind
      or v_item.base_unit is distinct from v_base then
      raise exception 'Costing source % changed physical dimension or kind.', v_source_id
        using errcode = '55000';
    elsif v_item.active and v_item.name is distinct from v_name then
      update public.pos_inventory_items as item
      set name = v_name,
          revision = item.revision + 1,
          updated_by = v_user_id
      where item.business_id = p_business_id and item.id = v_item.id
      returning item.* into v_item;
      v_result := 'updated';
    else
      v_result := case when v_item.active then 'unchanged' else 'inactive' end;
    end if;

    -- A new source introduced during a period remains uncounted until its
    -- Opening Stock cell is explicitly confirmed (including an entered zero).
    insert into public.pos_inventory_period_items (
      business_id, period_id, inventory_item_id
    )
    select p_business_id, period.id, v_item.id
    from public.pos_inventory_periods as period
    where period.business_id = p_business_id and period.status = 'open'
    on conflict on constraint pos_inventory_period_items_pkey do nothing;

    return query select v_item.id, v_item.source_type,
      v_item.source_costing_id, v_item.item_kind, v_item.name,
      v_item.base_unit, v_result, v_item.revision;
  end loop;
end;
$$;

revoke all on function public.pos_inventory_sync_spreadsheet_sources(uuid)
  from public, anon, authenticated;
grant execute on function public.pos_inventory_sync_spreadsheet_sources(uuid)
  to authenticated;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 15, 'name', 'inventory_manual_purchase_facts'),
  now()
)
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;

comment on function public.pos_inventory_sync_spreadsheet_sources(uuid) is
  'Synchronizes Costing identities into Stocks without importing purchase quantity or price; existing inventory facts remain authoritative.';

commit;
