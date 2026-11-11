-- Destructive schema-14 behavior checks. Every fixture is rolled back.
begin;

insert into auth.users (id, email) values
  ('14000000-0000-4000-8000-000000000001', 'inventory14-owner@example.test'),
  ('14000000-0000-4000-8000-000000000002', 'inventory14-cashier@example.test');

create temporary table inventory14_context (
  business_id uuid,
  item_id uuid
) on commit drop;
grant select, insert, update on table inventory14_context to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);
insert into inventory14_context (business_id)
select public.pos_bootstrap_business('Inventory 14 Test', 'I14', 'Asia/Manila');
select public.pos_add_member_by_email(
  (select business_id from inventory14_context),
  'inventory14-cashier@example.test', 'cashier', 'Cashier'
);

reset role;
with inserted as (
  insert into public.pos_inventory_items (
    business_id, source_costing_ingredient_id, source_type, source_costing_id,
    item_kind, name, base_unit, created_by, updated_by
  ) values (
    (select business_id from inventory14_context),
    'inventory14-manual-item', 'ingredient', 'inventory14-manual-item',
    'purchased', 'Manual Category Ingredient', 'g',
    '14000000-0000-4000-8000-000000000001',
    '14000000-0000-4000-8000-000000000001'
  )
  returning id
)
update inventory14_context set item_id = inserted.id from inserted;

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);

do $$
begin
  if not exists (
    select 1
    from public.pos_inventory_get_spreadsheet(
      (select business_id from inventory14_context), null
    )
    where inventory_item_id = (select item_id from inventory14_context)
      and category_name = ''
      and active_period_id is null
  ) then
    raise exception 'A newly synced/manual item did not expose a blank category without a period.';
  end if;
end;
$$;

create temporary table inventory14_category_save as
select * from public.pos_inventory_update_item_category(
  (select business_id from inventory14_context),
  (select item_id from inventory14_context),
  '  Matcha Powder / Premium 月  ',
  1
);

do $$
begin
  if not exists (
    select 1 from inventory14_category_save
    where category_name = 'Matcha Powder / Premium 月'
      and revision = 2 and is_retry = false
  ) then
    raise exception 'Manual category was not trimmed, saved, or revisioned.';
  end if;
  if exists (
    select 1 from public.pos_inventory_periods
    where business_id = (select business_id from inventory14_context)
  ) then
    raise exception 'Saving a manual category created an inventory period.';
  end if;
end;
$$;

create temporary table inventory14_category_retry as
select * from public.pos_inventory_update_item_category(
  (select business_id from inventory14_context),
  (select item_id from inventory14_context),
  'Matcha Powder / Premium 月',
  1
);

do $$
begin
  if not exists (
    select 1 from inventory14_category_retry
    where revision = 2 and is_retry = true
  ) then
    raise exception 'A repeated category save was not handled as a safe retry.';
  end if;

  begin
    perform public.pos_inventory_update_item_category(
      (select business_id from inventory14_context),
      (select item_id from inventory14_context),
      'Different category', 1
    );
    raise exception 'Expected stale category revision rejection.';
  exception when serialization_failure then
    null;
  end;

  begin
    perform public.pos_inventory_update_item_category(
      (select business_id from inventory14_context),
      (select item_id from inventory14_context),
      repeat('x', 121), 2
    );
    raise exception 'Expected overlong category rejection.';
  exception when invalid_parameter_value then
    null;
  end;
end;
$$;

create temporary table inventory14_category_clear as
select * from public.pos_inventory_update_item_category(
  (select business_id from inventory14_context),
  (select item_id from inventory14_context),
  '   ',
  2
);

create temporary table inventory14_color_save as
select * from public.pos_inventory_update_item_row_color(
  (select business_id from inventory14_context),
  (select item_id from inventory14_context),
  '#aabbcc',
  3
);

do $$
begin
  if not exists (
    select 1 from inventory14_category_clear
    where category_name = '' and revision = 3 and is_retry = false
  ) then
    raise exception 'Blank category did not clear to the canonical empty value.';
  end if;
  if not exists (
    select 1 from inventory14_color_save
    where row_color = '#AABBCC' and revision = 4 and is_retry = false
  ) then
    raise exception 'Period-independent row color save failed.';
  end if;

  begin
    perform public.pos_inventory_update_item_row_color(
      (select business_id from inventory14_context),
      (select item_id from inventory14_context),
      'red', 4
    );
    raise exception 'Expected invalid row color rejection.';
  exception when invalid_parameter_value then
    null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.pos_inventory_update_item_category(
      (select business_id from inventory14_context),
      (select item_id from inventory14_context),
      'Cashier category', 4
    );
    raise exception 'Expected cashier category mutation rejection.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
do $$
begin
  if not exists (
    select 1 from public.pos_inventory_items
    where id = (select item_id from inventory14_context)
      and inventory_category is null
      and row_color_hex = '#AABBCC'
      and revision = 4
  ) then
    raise exception 'Final item-profile state is incorrect.';
  end if;
  if exists (
    select 1 from public.pos_inventory_transactions
    where business_id = (select business_id from inventory14_context)
  ) or exists (
    select 1 from public.pos_inventory_cell_events
    where business_id = (select business_id from inventory14_context)
  ) then
    raise exception 'Item-profile edits wrote period quantity audit records.';
  end if;
end;
$$;

rollback;
