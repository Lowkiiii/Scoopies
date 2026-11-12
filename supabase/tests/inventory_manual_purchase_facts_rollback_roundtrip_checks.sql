-- Destructive disposable-database check for schema-15 rollback and reapply.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('15f00000-0000-4000-8000-000000000001', 'inventory15-roundtrip@example.test');
insert into public.pos_businesses (
  id, name, timezone, currency_code, receipt_prefix, created_by
) values (
  '15f00000-0000-4000-8000-000000000010',
  'Inventory 15 Roundtrip', 'Asia/Manila', 'PHP', 'I15F',
  '15f00000-0000-4000-8000-000000000001'
);
insert into public.pos_business_members (
  business_id, user_id, role, display_name
) values (
  '15f00000-0000-4000-8000-000000000010',
  '15f00000-0000-4000-8000-000000000001',
  'owner', 'Roundtrip Owner'
);

update public.pos_inventory_items as item
set active = false, revision = item.revision + 1
where item.source_costing_id in (
    'inventory-2b-roundtrip-source',
    'i14-backfill-category',
    'i14-backfill-uncategorized',
    'i14-backfill-removed',
    'i14-backfill-cup'
  )
  and item.active and public._pos_inventory_balance(item.business_id, item.id) = 0;

update public.scoopies_state
set data = jsonb_set(
      data,
      '{ingredients}',
      -- Prior rollback checks leave compatibility sources attached to their
      -- own fixture businesses. Exclude only those known disposable sources
      -- before exercising schema-14 synchronization for this business.
      coalesce((
        select jsonb_agg(source.value order by source.ordinality)
        from jsonb_array_elements(coalesce(data -> 'ingredients', '[]'::jsonb))
          with ordinality as source(value, ordinality)
        where btrim(coalesce(source.value ->> 'id', '')) not in (
          'inventory-2b-roundtrip-source',
          'i14-backfill-category',
          'i14-backfill-uncategorized',
          'i14-backfill-removed'
        )
      ), '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'id', 'i15-roundtrip-old', 'kind', 'purchased',
          'name', 'Rollback Seeded Source', 'purchaseQty', 2,
          'amountPerItem', 100, 'unit', 'g', 'price', 50
        )
      ),
      true
    ),
    updated_at = clock_timestamp()
where id = 'main';

\ir ../rollback/202611130015_inventory_manual_purchase_facts.rollback.sql

do $$
begin
  if not exists (
    select 1 from public.pos_system_metadata
    where key = 'schema_version'
      and (value ->> 'version')::integer = 14
      and value ->> 'name' = 'inventory_manual_categories'
  ) then
    raise exception 'Schema-15 rollback did not restore schema 14.';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '15f00000-0000-4000-8000-000000000001', false);
select * from public.pos_inventory_sync_spreadsheet_sources(
  '15f00000-0000-4000-8000-000000000010'
);
reset role;

do $$
begin
  if not exists (
    select 1 from public.pos_inventory_items
    where business_id = '15f00000-0000-4000-8000-000000000010'
      and source_costing_id = 'i15-roundtrip-old'
      and purchase_quantity_base = 200
      and purchase_price_centavos = 5000
  ) then
    raise exception 'Schema-14 rollback behavior did not seed purchase facts.';
  end if;
end;
$$;

\ir ../migrations/202611130015_inventory_manual_purchase_facts.sql

update public.scoopies_state
set data = jsonb_set(
      data,
      '{ingredients}',
      data -> 'ingredients' || jsonb_build_array(
        jsonb_build_object(
          'id', 'i15-roundtrip-new', 'kind', 'purchased',
          'name', 'Manual Purchase Facts Source', 'purchaseQty', 3,
          'amountPerItem', 1000, 'unit', 'ml', 'price', 700
        )
      ),
      true
    ),
    updated_at = clock_timestamp()
where id = 'main';

set role authenticated;
select set_config('request.jwt.claim.sub', '15f00000-0000-4000-8000-000000000001', false);
select * from public.pos_inventory_sync_spreadsheet_sources(
  '15f00000-0000-4000-8000-000000000010'
);
reset role;

do $$
begin
  if not exists (
    select 1 from public.pos_system_metadata
    where key = 'schema_version'
      and (value ->> 'version')::integer = 15
      and value ->> 'name' = 'inventory_manual_purchase_facts'
  ) then
    raise exception 'Schema 15 did not reapply after rollback.';
  end if;
  if not exists (
    select 1 from public.pos_inventory_items
    where business_id = '15f00000-0000-4000-8000-000000000010'
      and source_costing_id = 'i15-roundtrip-old'
      and purchase_quantity_base = 200
      and purchase_price_centavos = 5000
  ) then
    raise exception 'Schema-15 reapply changed an existing row.';
  end if;
  if not exists (
    select 1 from public.pos_inventory_items
    where business_id = '15f00000-0000-4000-8000-000000000010'
      and source_costing_id = 'i15-roundtrip-new'
      and purchase_quantity_base is null
      and purchase_price_centavos is null
  ) then
    raise exception 'Schema-15 reapply still imported new purchase facts.';
  end if;
end;
$$;

