-- Destructive Phase 3 fixture checks for a disposable/local database only.
-- All fixtures and completed sales are rolled back at the end.

begin;

insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000001', 'phase3-owner@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'phase3-manager@example.test'),
  ('30000000-0000-4000-8000-000000000003', 'phase3-cashier@example.test'),
  ('30000000-0000-4000-8000-000000000004', 'phase3-outsider@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);

create temporary table phase3_context as
select public.pos_bootstrap_business('Scoopies Phase 3 Test', 'SCP', 'Asia/Manila') as business_id;

select public.pos_add_member_by_email(
  (select business_id from phase3_context),
  'phase3-manager@example.test',
  'manager',
  'Test Manager'
);
select public.pos_add_member_by_email(
  (select business_id from phase3_context),
  'phase3-cashier@example.test',
  'cashier',
  'Test Cashier'
);

create temporary table phase3_publication_v1 as
select *
from public.pos_publish_costing_product(
  (select business_id from phase3_context),
  'phase3-matcha-12oz',
  'phase3-matcha-recipe',
  'Matcha Latte 12oz',
  17000,
  6000,
  1500,
  jsonb_build_object(
    'schemaVersion', 1,
    'sourceProductId', 'phase3-matcha-12oz',
    'sourceRecipeId', 'phase3-matcha-recipe',
    'name', 'Matcha Latte 12oz',
    'size', '12 oz',
    'sellingPriceCentavos', 17000,
    'ingredientCostCentavos', 6000,
    'packagingCostCentavos', 1500
  ),
  '12 oz',
  'Matcha',
  null
);

-- A cashier can complete a cash sale. Prices/costs come only from version 1.
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);

create temporary table phase3_cash_sale as
select *
from public.pos_complete_sale(
  (select business_id from phase3_context),
  '31000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_id from phase3_publication_v1),
    'product_version_id', (select version_id from phase3_publication_v1),
    'quantity', 2
  )),
  'cash',
  40000,
  null,
  '  first popup sale  '
);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);

do $$
declare
  v_business_id uuid := (select business_id from phase3_context);
  v_sale_id uuid := (select sale_id from phase3_cash_sale);
begin
  if (select is_retry from phase3_cash_sale)
    or (select total_centavos from phase3_cash_sale) <> 34000
    or (select cash_tendered_centavos from phase3_cash_sale) <> 40000
    or (select change_given_centavos from phase3_cash_sale) <> 6000
    or (select item_count from phase3_cash_sale) <> 1
    or (select units_sold from phase3_cash_sale) <> 2 then
    raise exception 'Cash checkout response totals are incorrect.';
  end if;

  if (select count(*) from public.pos_shifts
      where business_id = v_business_id and status = 'open'
        and is_training = false and opening_cash_centavos = 0) <> 1 then
    raise exception 'Checkout did not auto-open exactly one non-training shift.';
  end if;

  if (select count(*) from public.pos_sale_items
      where business_id = v_business_id and sale_id = v_sale_id
        and product_version_id = (select version_id from phase3_publication_v1)
        and unit_price_centavos = 17000
        and ingredient_unit_cost_centavos = 6000
        and packaging_unit_cost_centavos = 1500) <> 1 then
    raise exception 'Sale item did not preserve the immutable version 1 snapshots.';
  end if;

  if (select count(*) from public.pos_payments
      where business_id = v_business_id and sale_id = v_sale_id
        and method = 'cash' and amount_centavos = 34000
        and cash_tendered_centavos = 40000 and change_given_centavos = 6000) <> 1 then
    raise exception 'Cash payment facts are incorrect.';
  end if;

  if (select count(*) from public.pos_sale_events
      where business_id = v_business_id and sale_id = v_sale_id
        and event_type = 'completed' and amount_centavos = 34000) <> 1 then
    raise exception 'Completed sale audit event is missing.';
  end if;

  if (select note from public.pos_sales where id = v_sale_id) <> 'first popup sale' then
    raise exception 'Sale note was not normalized.';
  end if;
end;
$$;

-- The identical client-generated ID and canonical request is an exact retry,
-- not another sale or receipt.
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
create temporary table phase3_cash_retry as
select *
from public.pos_complete_sale(
  (select business_id from phase3_context),
  '31000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'product_version_id', (select version_id from phase3_publication_v1),
    'quantity', 2,
    'product_id', (select product_id from phase3_publication_v1)
  )),
  ' CASH ',
  40000,
  null,
  'first popup sale'
);

do $$
begin
  if not (select is_retry from phase3_cash_retry)
    or (select sale_id from phase3_cash_retry) is distinct from (select sale_id from phase3_cash_sale)
    or (select receipt_number from phase3_cash_retry) is distinct from (select receipt_number from phase3_cash_sale) then
    raise exception 'Exact checkout retry did not return the original receipt.';
  end if;

end;
$$;

reset role;
do $$
begin
  if (select count(*) from public.pos_sales
      where business_id = (select business_id from phase3_context)) <> 1
    or (select last_number from public.pos_receipt_counters
        where business_id = (select business_id from phase3_context)
          and is_training = false) <> 1 then
    raise exception 'Exact retry duplicated a sale or consumed a receipt.';
  end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);

do $$
begin
  begin
    perform public.pos_complete_sale(
      (select business_id from phase3_context),
      '31000000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from phase3_publication_v1),
        'product_version_id', (select version_id from phase3_publication_v1),
        'quantity', 1
      )),
      'cash', 40000, null, 'first popup sale'
    );
    raise exception 'Reused checkout ID accepted a changed request.';
  exception when unique_violation then null;
  end;
end;
$$;

-- Publish version 2. A new checkout holding version 1 must fail, while an
-- exact retry of the already-completed version 1 sale must still recover.
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
create temporary table phase3_publication_v2 as
select *
from public.pos_publish_costing_product(
  (select business_id from phase3_context),
  'phase3-matcha-12oz',
  'phase3-matcha-recipe',
  'Matcha Latte 12oz',
  18000,
  6000,
  1500,
  jsonb_build_object(
    'schemaVersion', 1,
    'sourceProductId', 'phase3-matcha-12oz',
    'sourceRecipeId', 'phase3-matcha-recipe',
    'name', 'Matcha Latte 12oz',
    'size', '12 oz',
    'sellingPriceCentavos', 18000,
    'ingredientCostCentavos', 6000,
    'packagingCostCentavos', 1500
  ),
  '12 oz',
  'Matcha',
  (select version_id from phase3_publication_v1)
);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);

do $$
begin
  if not (
    select retry.is_retry
    from public.pos_complete_sale(
      (select business_id from phase3_context),
      '31000000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from phase3_publication_v1),
        'product_version_id', (select version_id from phase3_publication_v1),
        'quantity', 2
      )),
      'cash', 40000, null, 'first popup sale'
    ) as retry
  ) then
    raise exception 'A catalog change prevented recovery of an exact retry.';
  end if;

  begin
    perform public.pos_complete_sale(
      (select business_id from phase3_context),
      '31000000-0000-4000-8000-000000000002',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from phase3_publication_v1),
        'product_version_id', (select version_id from phase3_publication_v1),
        'quantity', 1
      )),
      'cash', 20000, null, null
    );
    raise exception 'A new sale silently accepted a stale product version.';
  exception when serialization_failure then null;
  end;

end;
$$;

reset role;
do $$
begin
  if (select last_number from public.pos_receipt_counters
      where business_id = (select business_id from phase3_context)
        and is_training = false) <> 1 then
    raise exception 'Rejected stale cart consumed a receipt number.';
  end if;
end;
$$;
set local role authenticated;

-- Owner, manager, and cashier can all use checkout. Online references are
-- optional; payment amount is always the database-derived exact total.
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
create temporary table phase3_gcash_sale as
select *
from public.pos_complete_sale(
  (select business_id from phase3_context),
  '31000000-0000-4000-8000-000000000003',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_id from phase3_publication_v2),
    'product_version_id', (select version_id from phase3_publication_v2),
    'quantity', 1
  )),
  'gcash', null, null, null
);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
create temporary table phase3_gotyme_sale as
select *
from public.pos_complete_sale(
  (select business_id from phase3_context),
  '31000000-0000-4000-8000-000000000004',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_id from phase3_publication_v2),
    'product_version_id', (select version_id from phase3_publication_v2),
    'quantity', 1
  )),
  'gotyme', null, '  GT-123  ', null
);

do $$
begin
  if (select total_centavos from phase3_gcash_sale) <> 18000
    or (select total_centavos from phase3_gotyme_sale) <> 18000 then
    raise exception 'Online checkout did not use the active immutable price.';
  end if;

  if (select reference_number from public.pos_payments
      where sale_id = (select sale_id from phase3_gcash_sale)) is not null then
    raise exception 'Optional blank GCash reference was not stored as NULL.';
  end if;

  if (select reference_number from public.pos_payments
      where sale_id = (select sale_id from phase3_gotyme_sale)) <> 'GT-123' then
    raise exception 'GoTyme reference was not normalized.';
  end if;

  if (select count(distinct receipt_number) from public.pos_sales
      where business_id = (select business_id from phase3_context)) <> 3
    or (select max(receipt_sequence) from public.pos_sales
        where business_id = (select business_id from phase3_context)) <> 3 then
    raise exception 'Receipt allocation is not sequential and unique.';
  end if;
end;
$$;

-- Invalid payments/carts are fully rolled back and consume no receipts.
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.pos_complete_sale(
      (select business_id from phase3_context),
      '31000000-0000-4000-8000-000000000005',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from phase3_publication_v2),
        'product_version_id', (select version_id from phase3_publication_v2),
        'quantity', 1
      )),
      'cash', 10000, null, null
    );
    raise exception 'Underpaid cash sale completed.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.pos_complete_sale(
      (select business_id from phase3_context),
      '31000000-0000-4000-8000-000000000006',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from phase3_publication_v2),
        'product_version_id', (select version_id from phase3_publication_v2),
        'quantity', 1
      )),
      'gcash', 18000, null, null
    );
    raise exception 'Online payment accepted cash received.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.pos_complete_sale(
      (select business_id from phase3_context),
      '31000000-0000-4000-8000-000000000007',
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select product_id from phase3_publication_v2),
          'product_version_id', (select version_id from phase3_publication_v2),
          'quantity', 1
        ),
        jsonb_build_object(
          'product_id', (select product_id from phase3_publication_v2),
          'product_version_id', (select version_id from phase3_publication_v2),
          'quantity', 1
        )
      ),
      'cash', 40000, null, null
    );
    raise exception 'Duplicate product lines passed validation.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.pos_complete_sale(
      (select business_id from phase3_context),
      '31000000-0000-4000-8000-000000000010',
      jsonb_build_object('product_id', (select product_id from phase3_publication_v2)),
      'cash', 40000, null, null
    );
    raise exception 'Non-array cart passed validation.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.pos_complete_sale(
      (select business_id from phase3_context),
      '31000000-0000-4000-8000-000000000011',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from phase3_publication_v2),
        'product_version_id', (select version_id from phase3_publication_v2),
        'quantity', 1,
        'unit_price_centavos', 1
      )),
      'cash', 40000, null, null
    );
    raise exception 'A cart-supplied price field passed validation.';
  exception when invalid_parameter_value then null;
  end;

end;
$$;

reset role;
do $$
begin
  if (select last_number from public.pos_receipt_counters
      where business_id = (select business_id from phase3_context)
        and is_training = false) <> 3 then
    raise exception 'Rejected checkout consumed a receipt.';
  end if;

  if (select count(*) from public.pos_sales
      where business_id = (select business_id from phase3_context)) <> 3
    or (select count(*) from public.pos_sale_items
        where business_id = (select business_id from phase3_context)) <> 3
    or (select count(*) from public.pos_payments
        where business_id = (select business_id from phase3_context)) <> 3
    or (select count(*) from public.pos_sale_events
        where business_id = (select business_id from phase3_context)) <> 3 then
    raise exception 'Rejected checkout left an orphan sale, item, payment, or event.';
  end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);

-- Cashiers see revenue/payment operations but never cost or profit.
do $$
declare
  v_business_id uuid := (select business_id from phase3_context);
begin
  if (select sale_count from public.pos_get_today_summary(v_business_id)) <> 3
    or (select items_sold from public.pos_get_today_summary(v_business_id)) <> 4
    or (select total_sales_centavos from public.pos_get_today_summary(v_business_id)) <> 70000
    or (select cash_sales_centavos from public.pos_get_today_summary(v_business_id)) <> 34000
    or (select gcash_sales_centavos from public.pos_get_today_summary(v_business_id)) <> 18000
    or (select gotyme_sales_centavos from public.pos_get_today_summary(v_business_id)) <> 18000 then
    raise exception 'Today summary sales/payment totals are incorrect.';
  end if;

  if (select can_view_costs from public.pos_get_today_summary(v_business_id))
    or (select estimated_cost_centavos from public.pos_get_today_summary(v_business_id)) is not null
    or (select estimated_gross_profit_centavos from public.pos_get_today_summary(v_business_id)) is not null then
    raise exception 'Cashier today summary leaked cost or profit.';
  end if;

  if (select count(*) from public.pos_get_recent_sales(v_business_id, 20)) <> 3
    or exists (
      select 1 from public.pos_get_recent_sales(v_business_id, 20) as recent
      where recent.can_view_costs
        or recent.estimated_cost_centavos is not null
        or recent.estimated_gross_profit_centavos is not null
    ) then
    raise exception 'Cashier recent sales are missing or leaked costs.';
  end if;

  if not exists (
    select 1
    from public.pos_get_recent_sales(v_business_id, 20) as recent
    where recent.sale_id = (select sale_id from phase3_cash_sale)
      and recent.item_summary = '2 x Matcha Latte 12oz (12 oz)'
  ) then
    raise exception 'Recent sales item summary is missing or incorrect.';
  end if;

  begin
    insert into public.pos_sales (
      business_id, shift_id, client_sale_id, request_fingerprint,
      is_training, cashier_id
    ) values (
      v_business_id,
      (select id from public.pos_shifts where business_id = v_business_id limit 1),
      gen_random_uuid(), repeat('a', 64), false,
      '30000000-0000-4000-8000-000000000003'
    );
    raise exception 'Cashier directly inserted a sale.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Owners/managers can see estimated cost and gross profit, and historical
-- version 1 sale snapshots remain unchanged after version 2 publication.
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
do $$
declare
  v_business_id uuid := (select business_id from phase3_context);
begin
  if not (select can_view_costs from public.pos_get_today_summary(v_business_id))
    or (select estimated_cost_centavos from public.pos_get_today_summary(v_business_id)) <> 30000
    or (select estimated_gross_profit_centavos from public.pos_get_today_summary(v_business_id)) <> 40000 then
    raise exception 'Owner cost/profit summary is incorrect.';
  end if;

  if exists (
    select 1 from public.pos_get_recent_sales(v_business_id, 20) as recent
    where not recent.can_view_costs
      or recent.estimated_cost_centavos is null
      or recent.estimated_gross_profit_centavos is null
  ) then
    raise exception 'Owner recent sales did not expose cost/profit.';
  end if;

  if (select item.unit_price_centavos
      from public.pos_sale_items as item
      where item.sale_id = (select sale_id from phase3_cash_sale)) <> 17000 then
    raise exception 'Later publication changed a historical sale price snapshot.';
  end if;
end;
$$;

-- Unavailable products are rejected before receipt allocation.
select public.pos_set_product_availability(
  (select business_id from phase3_context),
  (select product_id from phase3_publication_v2),
  false
);
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.pos_complete_sale(
      (select business_id from phase3_context),
      '31000000-0000-4000-8000-000000000008',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from phase3_publication_v2),
        'product_version_id', (select version_id from phase3_publication_v2),
        'quantity', 1
      )),
      'cash', 20000, null, null
    );
    raise exception 'Unavailable product was sold.';
  exception when serialization_failure then null;
  end;
end;
$$;

reset role;
do $$
begin
  if (select count(*) from public.pos_sales
      where business_id = (select business_id from phase3_context)) <> 3
    or (select last_number from public.pos_receipt_counters
        where business_id = (select business_id from phase3_context)
          and is_training = false) <> 3 then
    raise exception 'Unavailable-product rejection changed sales or receipt state.';
  end if;
end;
$$;
set local role authenticated;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);
do $$
begin
  begin
    perform public.pos_get_today_summary((select business_id from phase3_context));
    raise exception 'Outsider read another business summary.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pos_complete_sale(
      (select business_id from phase3_context),
      '31000000-0000-4000-8000-000000000009',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from phase3_publication_v2),
        'product_version_id', (select version_id from phase3_publication_v2),
        'quantity', 1
      )),
      'cash', 20000, null, null
    );
    raise exception 'Outsider completed a sale.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;

select 'PASS: POS Phase 3 behavior checks' as result;
