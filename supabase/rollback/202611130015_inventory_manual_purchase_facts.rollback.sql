-- Safe rollback for schema 15. This restores schema-14 synchronization for
-- future rows only; it never changes purchase facts already stored in Stocks.

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

  if v_version is distinct from 15
    or v_name is distinct from 'inventory_manual_purchase_facts' then
    raise exception 'Refusing schema-15 rollback: found %:%.',
      coalesce(v_version::text, '<missing>'), coalesce(v_name, '<missing>');
  end if;
end;
$$;

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
  v_quantity_base numeric;
  v_price bigint;
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
    if v_name = ''
      and nullif(btrim(coalesce(v_source.value ->> 'price', '')), '') is null
      and nullif(btrim(coalesce(v_source.value ->> 'qty', '')), '') is null
      and nullif(btrim(coalesce(v_source.value ->> 'amountPerItem', '')), '') is null
      and nullif(btrim(coalesce(v_source.value ->> 'batchYield', '')), '') is null then
      continue;
    end if;
    if char_length(v_source_id) not between 1 and 180
      or char_length(v_name) not between 1 and 120 then
      raise exception 'A costing source has an invalid ID or name.' using errcode = '22023';
    end if;
    if v_source_type = 'packaging' then
      v_kind := 'packaging';
      v_unit := 'piece';
      v_quantity_base := nullif(v_source.value ->> 'qty', '')::numeric;
      v_price := case when nullif(v_source.value ->> 'price', '') is null then null
        else round((v_source.value ->> 'price')::numeric * 100)::bigint end;
      v_compatibility_id := 'packaging:' || v_source_id;
    else
      v_kind := case when v_source.value ->> 'kind' = 'mixture'
        then 'mixture' else 'purchased' end;
      v_unit := lower(btrim(coalesce(v_source.value ->> 'unit', '')));
      if v_kind = 'purchased' then
        v_quantity_base := public._pos_inventory_to_base(
          coalesce(nullif(v_source.value ->> 'amountPerItem', '')::numeric,
                   nullif(v_source.value ->> 'qty', '')::numeric)
          * coalesce(nullif(v_source.value ->> 'purchaseQty', '')::numeric, 1),
          v_unit
        );
        v_price := case when nullif(v_source.value ->> 'price', '') is null then null
          else round((v_source.value ->> 'price')::numeric * 100)::bigint end;
      else
        v_quantity_base := public._pos_inventory_to_base(
          nullif(v_source.value ->> 'batchYield', '')::numeric, v_unit
        );
        v_price := null;
      end if;
      v_compatibility_id := v_source_id;
    end if;
    v_base := public._pos_inventory_base_unit(v_unit);
    if v_base is null then
      raise exception 'Costing source % has an invalid physical unit.', v_source_id
        using errcode = '22023';
    end if;
    if v_quantity_base is not null and v_quantity_base <= 0 then
      raise exception 'Costing source % has an invalid purchase quantity.', v_source_id
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
        purchase_quantity_base, purchase_price_centavos,
        created_by, updated_by
      ) values (
        p_business_id, v_compatibility_id, v_source_type,
        v_source_id, v_kind, v_name, v_base, v_unit,
        v_quantity_base, v_price, v_user_id, v_user_id
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
  jsonb_build_object('version', 14, 'name', 'inventory_manual_categories'),
  now()
)
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;

comment on function public.pos_inventory_sync_spreadsheet_sources(uuid) is
  'Synchronizes Costing identities and seeds purchase facts for newly created inventory rows.';

commit;
