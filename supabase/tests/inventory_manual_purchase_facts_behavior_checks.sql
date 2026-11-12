-- Destructive schema-15 behavior checks. Every fixture is rolled back.
begin;

insert into auth.users (id, email) values
  ('15000000-0000-4000-8000-000000000001', 'inventory15-owner@example.test');

create temporary table inventory15_context (
  business_id uuid,
  existing_id uuid
) on commit drop;
grant select, insert, update on table inventory15_context to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
insert into inventory15_context (business_id)
select public.pos_bootstrap_business('Inventory 15 Test', 'I15', 'Asia/Manila');

reset role;
with inserted as (
  insert into public.pos_inventory_items (
    business_id, source_costing_ingredient_id, source_type,
    source_costing_id, item_kind, name, base_unit, preferred_unit,
    purchase_quantity_base, purchase_price_centavos,
    created_by, updated_by
  ) values (
    (select business_id from inventory15_context),
    'i15-existing', 'ingredient', 'i15-existing', 'purchased',
    'Existing Ingredient', 'g', 'g', 777, 88800,
    '15000000-0000-4000-8000-000000000001',
    '15000000-0000-4000-8000-000000000001'
  )
  returning id
)
update inventory15_context set existing_id = inserted.id from inserted;

set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
update public.scoopies_state
set data = jsonb_set(
      jsonb_set(
        data,
        '{ingredients}',
        coalesce(data -> 'ingredients', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'id', 'i15-existing', 'kind', 'purchased',
            'name', 'Existing Ingredient Renamed', 'purchaseQty', 9,
            'amountPerItem', 999, 'unit', 'g', 'price', 9999
          ),
          jsonb_build_object(
            'id', 'i15-new', 'kind', 'purchased',
            'name', 'New Purchased Ingredient', 'purchaseQty', 6,
            'amountPerItem', 1000, 'unit', 'ml', 'price', 780
          ),
          jsonb_build_object(
            'id', 'i15-mixture', 'kind', 'mixture',
            'name', 'New Prepared Mixture', 'batchYield', 500,
            'unit', 'ml', 'components', '[]'::jsonb
          )
        ),
        true
      ),
      '{packaging}',
      coalesce(data -> 'packaging', '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'id', 'i15-cup', 'name', 'New Cup', 'qty', 100, 'price', 250
        )
      ),
      true
    ),
    updated_at = clock_timestamp()
where id = 'main';

create temporary table inventory15_sync as
select * from public.pos_inventory_sync_spreadsheet_sources(
  (select business_id from inventory15_context)
);

reset role;
do $$
begin
  if not exists (
    select 1 from public.pos_inventory_items
    where id = (select existing_id from inventory15_context)
      and name = 'Existing Ingredient Renamed'
      and purchase_quantity_base = 777
      and purchase_price_centavos = 88800
  ) then
    raise exception 'Source synchronization rewrote existing purchase facts.';
  end if;

  if (
    select count(*)
    from public.pos_inventory_items
    where business_id = (select business_id from inventory15_context)
      and source_costing_id in ('i15-new', 'i15-mixture', 'i15-cup')
      and purchase_quantity_base is null
      and purchase_price_centavos is null
  ) <> 3 then
    raise exception 'A new inventory row imported purchase facts from Costing.';
  end if;

  if not exists (
    select 1 from inventory15_sync
    where source_type = 'ingredient' and source_costing_id = 'i15-new'
      and sync_result = 'created' and base_unit = 'ml'
  ) or not exists (
    select 1 from inventory15_sync
    where source_type = 'packaging' and source_costing_id = 'i15-cup'
      and sync_result = 'created' and base_unit = 'piece'
  ) then
    raise exception 'Source identity synchronization no longer works.';
  end if;
end;
$$;

rollback;
