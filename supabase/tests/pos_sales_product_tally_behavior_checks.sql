-- Transaction-scoped product tally, grouping, mode, and access checks.

begin;

insert into auth.users (id, email) values
  ('70000000-0000-4000-8000-000000000001', 'tally-owner@example.test'),
  ('70000000-0000-4000-8000-000000000002', 'tally-cashier@example.test'),
  ('70000000-0000-4000-8000-000000000003', 'tally-outsider@example.test');

create temporary table tally_context (
  singleton boolean primary key default true check (singleton),
  business_id uuid not null,
  product_a_id uuid,
  product_a_v1 uuid,
  product_a_v2 uuid,
  product_b_id uuid,
  product_b_v1 uuid,
  live_shift_id uuid,
  training_shift_id uuid,
  void_sale_id uuid,
  refund_sale_id uuid,
  refund_before_sale_id uuid
) on commit drop;

grant select, insert, update on table tally_context to authenticated;
grant select on table tally_context to anon;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000001',
  true
);

insert into tally_context (business_id)
select public.pos_bootstrap_business(
  'Sales Product Tally Test', 'T7Y', 'Asia/Manila'
);

select public.pos_add_member_by_email(
  (select business_id from tally_context),
  'tally-cashier@example.test',
  'cashier',
  'Tally Cashier'
);

-- Version 1 deliberately has no size. A later version of this same stable
-- product adds "12 oz" and changes capitalization.
with publication as (
  select * from public.pos_publish_costing_product(
    (select business_id from tally_context),
    'tally-sea-salt-product',
    'tally-sea-salt-recipe-v1',
    'SEA SALT CREAM MATCHA',
    19000,
    7000,
    1500,
    jsonb_build_object(
      'schemaVersion', 1,
      'sourceProductId', 'tally-sea-salt-product',
      'sourceRecipeId', 'tally-sea-salt-recipe-v1',
      'name', 'SEA SALT CREAM MATCHA',
      'size', null,
      'sellingPriceCentavos', 19000,
      'ingredientCostCentavos', 7000,
      'packagingCostCentavos', 1500
    ),
    null,
    'Tally Test',
    null
  )
)
update tally_context
set product_a_id = publication.product_id,
    product_a_v1 = publication.version_id
from publication;

with publication as (
  select * from public.pos_publish_costing_product(
    (select business_id from tally_context),
    'tally-matcha-product',
    'tally-matcha-recipe',
    'Matcha Latte',
    17000,
    6000,
    1500,
    jsonb_build_object(
      'schemaVersion', 1,
      'sourceProductId', 'tally-matcha-product',
      'sourceRecipeId', 'tally-matcha-recipe',
      'name', 'Matcha Latte',
      'size', null,
      'sellingPriceCentavos', 17000,
      'ingredientCostCentavos', 6000,
      'packagingCostCentavos', 1500
    ),
    null,
    'Tally Test',
    null
  )
)
update tally_context
set product_b_id = publication.product_id,
    product_b_v1 = publication.version_id
from publication;

with opened as (
  select * from public.pos_open_shift(
    (select business_id from tally_context), false, 0
  )
)
update tally_context set live_shift_id = opened.shift_id from opened;

select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000002',
  true
);

-- The first Live order freezes v1 (no size): 2 Sea Salt + 1 Matcha Latte.
select * from public.pos_complete_shift_sale(
  (select business_id from tally_context),
  (select live_shift_id from tally_context),
  false,
  '71000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'product_id', (select product_a_id from tally_context),
      'product_version_id', (select product_a_v1 from tally_context),
      'quantity', 2
    ),
    jsonb_build_object(
      'product_id', (select product_b_id from tally_context),
      'product_version_id', (select product_b_v1 from tally_context),
      'quantity', 1
    )
  ),
  'cash', 60000, null, null
);

select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000001',
  true
);

with publication as (
  select * from public.pos_publish_costing_product(
    (select business_id from tally_context),
    'tally-sea-salt-product',
    'tally-sea-salt-recipe-v2',
    'Sea Salt Cream Matcha',
    19000,
    7000,
    1500,
    jsonb_build_object(
      'schemaVersion', 1,
      'sourceProductId', 'tally-sea-salt-product',
      'sourceRecipeId', 'tally-sea-salt-recipe-v2',
      'name', 'Sea Salt Cream Matcha',
      'size', '12 oz',
      'sellingPriceCentavos', 19000,
      'ingredientCostCentavos', 7000,
      'packagingCostCentavos', 1500
    ),
    '12 oz',
    'Tally Test',
    (select product_a_v1 from tally_context)
  )
)
update tally_context
set product_a_v2 = publication.version_id
from publication;

select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000002',
  true
);

-- Version 2 contributes three more units to the same product tally row.
select * from public.pos_complete_shift_sale(
  (select business_id from tally_context),
  (select live_shift_id from tally_context),
  false,
  '71000000-0000-4000-8000-000000000002',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_a_id from tally_context),
    'product_version_id', (select product_a_v2 from tally_context),
    'quantity', 3
  )),
  'gcash', null, 'TALLY-LIVE-2', null
);

with completed as (
  select * from public.pos_complete_shift_sale(
    (select business_id from tally_context),
    (select live_shift_id from tally_context),
    false,
    '71000000-0000-4000-8000-000000000003',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_a_id from tally_context),
      'product_version_id', (select product_a_v2 from tally_context),
      'quantity', 4
    )),
    'cash', 80000, null, 'void this tally fixture'
  )
)
update tally_context set void_sale_id = completed.sale_id from completed;

with completed as (
  select * from public.pos_complete_shift_sale(
    (select business_id from tally_context),
    (select live_shift_id from tally_context),
    false,
    '71000000-0000-4000-8000-000000000004',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_b_id from tally_context),
      'product_version_id', (select product_b_v1 from tally_context),
      'quantity', 2
    )),
    'gcash', null, 'TALLY-REFUND', 'refunded sale is excluded from net tally'
  )
)
update tally_context set refund_sale_id = completed.sale_id from completed;

select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000001',
  true
);

select * from public.pos_void_sale(
  (select business_id from tally_context),
  (select void_sale_id from tally_context),
  'Exclude before-preparation void from tally'
);

-- There is no public refund write endpoint yet. Add one append-only test event
-- as the database owner to prove an after-preparation refund is excluded from
-- net product sales. Its retained cost belongs to profit/inventory reporting.
reset role;
insert into public.pos_sale_events (
  business_id, sale_id, event_type, amount_centavos, payment_method,
  retain_cost, reference_number, reason, metadata, acted_by
)
select
  context.business_id, context.refund_sale_id, 'refund_after_preparation',
  34000, 'gcash', true, 'TALLY-REFUND',
  'Refunded receipt leaves net product sales', '{}'::jsonb,
  '70000000-0000-4000-8000-000000000001'::uuid
from tally_context as context;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000001',
  true
);

select * from public.pos_close_shift(
  (select business_id from tally_context),
  (select live_shift_id from tally_context),
  55000,
  57000,
  0,
  'Tally Live fixture close'
);

with opened as (
  select * from public.pos_open_shift(
    (select business_id from tally_context), true, 0
  )
)
update tally_context set training_shift_id = opened.shift_id from opened;

select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000002',
  true
);

select * from public.pos_complete_shift_sale(
  (select business_id from tally_context),
  (select training_shift_id from tally_context),
  true,
  '71000000-0000-4000-8000-000000000005',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_a_id from tally_context),
    'product_version_id', (select product_a_v2 from tally_context),
    'quantity', 5
  )),
  'cash', 100000, null, null
);

-- A separate Training sale is refunded before preparation. It must not appear
-- in net product sales even though its immutable receipt/items remain.
with completed as (
  select * from public.pos_complete_shift_sale(
    (select business_id from tally_context),
    (select training_shift_id from tally_context),
    true,
    '71000000-0000-4000-8000-000000000006',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_b_id from tally_context),
      'product_version_id', (select product_b_v1 from tally_context),
      'quantity', 6
    )),
    'cash', 102000, null, 'refund before preparation fixture'
  )
)
update tally_context
set refund_before_sale_id = completed.sale_id
from completed;

reset role;
insert into public.pos_sale_events (
  business_id, sale_id, event_type, amount_centavos, payment_method,
  retain_cost, reason, metadata, acted_by
)
select
  context.business_id, context.refund_before_sale_id,
  'refund_before_preparation', 102000, 'cash', false,
  'Drink was refunded before preparation', '{}'::jsonb,
  '70000000-0000-4000-8000-000000000001'::uuid
from tally_context as context;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000002',
  true
);

-- A cashier and an owner see the same non-financial tally.
do $$
declare
  v_live jsonb;
begin
  select jsonb_agg(to_jsonb(tally) order by tally.units_sold desc, tally.item_name)
    into v_live
  from public.pos_get_sales_product_tally(
    (select business_id from tally_context), false
  ) as tally;

  if jsonb_array_length(v_live) <> 2
    or not exists (
      select 1
      from public.pos_get_sales_product_tally(
        (select business_id from tally_context), false
      ) as tally
      where tally.item_name = 'Sea Salt Cream Matcha'
        and tally.size_label = '12 oz'
        and tally.order_count = 2
        and tally.units_sold = 5
    )
    or not exists (
      select 1
      from public.pos_get_sales_product_tally(
        (select business_id from tally_context), false
      ) as tally
      where tally.item_name = 'Matcha Latte'
        and tally.size_label is null
        and tally.order_count = 1
        and tally.units_sold = 1
    ) then
    raise exception 'Live product tally did not combine versions or exclude voided/refunded receipts: %',
      v_live;
  end if;

  if (select count(*)
      from public.pos_get_sales_product_tally(
        (select business_id from tally_context), true
      )) <> 1
    or not exists (
      select 1
      from public.pos_get_sales_product_tally(
        (select business_id from tally_context), true
      ) as tally
      where tally.item_name = 'Sea Salt Cream Matcha'
        and tally.size_label = '12 oz'
        and tally.order_count = 1
        and tally.units_sold = 5
    )
    or exists (
      select 1
      from public.pos_get_sales_product_tally(
        (select business_id from tally_context), true
      ) as tally
      where tally.item_name = 'Matcha Latte'
    ) then
    raise exception 'Training tally is incomplete, mixed with Live sales, or retained a refunded receipt.';
  end if;
end;
$$;

-- Owner results must be byte-for-byte identical to cashier results.
create temporary table cashier_tally on commit drop as
select *
from public.pos_get_sales_product_tally(
  (select business_id from tally_context), false
);

select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000001',
  true
);

do $$
begin
  if exists (
      select * from cashier_tally
      except
      select * from public.pos_get_sales_product_tally(
        (select business_id from tally_context), false
      )
    )
    or exists (
      select * from public.pos_get_sales_product_tally(
        (select business_id from tally_context), false
      )
      except
      select * from cashier_tally
    ) then
    raise exception 'Owner and cashier received different product tallies.';
  end if;
end;
$$;

-- An active member receives an explicit validation error only after access is
-- established.
do $$
begin
  begin
    perform 1 from public.pos_get_sales_product_tally(
      (select business_id from tally_context), null
    );
    raise exception 'Product tally accepted a missing mode.';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- Outsiders are denied before malformed input is validated.
select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000003',
  true
);

do $$
begin
  begin
    perform 1 from public.pos_get_sales_product_tally(
      (select business_id from tally_context), null
    );
    raise exception 'Outsider executed or validated product tally.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Inactive members are denied even though their membership row remains.
reset role;
update public.pos_business_members
set active = false
where business_id = (select business_id from tally_context)
  and user_id = '70000000-0000-4000-8000-000000000002'::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000002',
  true
);

do $$
begin
  begin
    perform 1 from public.pos_get_sales_product_tally(
      (select business_id from tally_context), false
    );
    raise exception 'Inactive member read the product tally.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;

do $$
begin
  begin
    perform 1 from public.pos_get_sales_product_tally(
      (select business_id from tally_context), false
    );
    raise exception 'Authenticated role without a user read the product tally.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;

do $$
begin
  begin
    perform 1 from public.pos_get_sales_product_tally(
      (select business_id from tally_context), false
    );
    raise exception 'Anonymous role executed the product tally.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select 'PASS: POS sales-product tally behavior checks' as result;
rollback;
