-- Transaction-scoped Phase 4 behavior and financial semantics checks.

begin;

insert into auth.users (id, email) values
  ('40000000-0000-4000-8000-000000000001', 'phase4-owner@example.test'),
  ('40000000-0000-4000-8000-000000000002', 'phase4-manager@example.test'),
  ('40000000-0000-4000-8000-000000000003', 'phase4-cashier@example.test'),
  ('40000000-0000-4000-8000-000000000004', 'phase4-outsider@example.test');

create temporary table phase4_context (
  business_id uuid,
  product_id uuid,
  version_id uuid,
  live_shift_id uuid,
  training_shift_id uuid
) on commit drop;
grant select, insert, update on table phase4_context to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
insert into phase4_context (business_id)
select public.pos_bootstrap_business('Scoopies Phase 4 Test', 'T4S', 'Asia/Manila');
select public.pos_add_member_by_email(
  (select business_id from phase4_context),
  'phase4-manager@example.test', 'manager', 'Phase 4 Manager'
);
select public.pos_add_member_by_email(
  (select business_id from phase4_context),
  'phase4-cashier@example.test', 'cashier', 'Phase 4 Cashier'
);

with publication as (
  select * from public.pos_publish_costing_product(
    (select business_id from phase4_context),
    'phase4-matcha-product', 'phase4-matcha-recipe', 'Matcha Latte 12oz',
    17000, 6000, 1500,
    jsonb_build_object(
      'schemaVersion', 1, 'sourceProductId', 'phase4-matcha-product',
      'sourceRecipeId', 'phase4-matcha-recipe', 'name', 'Matcha Latte 12oz',
      'size', '12 oz', 'sellingPriceCentavos', 17000,
      'ingredientCostCentavos', 6000, 'packagingCostCentavos', 1500
    ),
    '12 oz', 'Drinks', null
  )
)
update phase4_context
set product_id = publication.product_id, version_id = publication.version_id
from publication;

-- No checkout path may auto-open a shift or consume a receipt.
do $$
begin
  begin
    perform public.pos_complete_shift_sale(
      (select business_id from phase4_context), gen_random_uuid(), false,
      '41000000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from phase4_context),
        'product_version_id', (select version_id from phase4_context),
        'quantity', 1
      )), 'cash', 20000, null, null
    );
    raise exception 'Shift checkout auto-opened.';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    perform public.pos_complete_sale(
      (select business_id from phase4_context),
      '41000000-0000-4000-8000-000000000002',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from phase4_context),
        'product_version_id', (select version_id from phase4_context),
        'quantity', 1
      )), 'cash', 20000, null, null
    );
    raise exception 'Legacy checkout auto-opened.';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

reset role;
do $$
begin
  if exists (select 1 from public.pos_shifts where business_id = (select business_id from phase4_context))
    or exists (select 1 from public.pos_sales where business_id = (select business_id from phase4_context))
    or exists (select 1 from public.pos_receipt_counters where business_id = (select business_id from phase4_context)) then
    raise exception 'Rejected no-shift checkout changed ledger state.';
  end if;
end;
$$;

-- Cashier can open live, not training. Same open request is idempotent.
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.pos_open_shift((select business_id from phase4_context), true, 0);
    raise exception 'Cashier opened training.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

create temporary table phase4_live_shift on commit drop as
select * from public.pos_open_shift((select business_id from phase4_context), false, 10000);
grant select on table phase4_live_shift to authenticated;
update phase4_context set live_shift_id = (select shift_id from phase4_live_shift);

do $$
declare v_retry record;
begin
  select * into strict v_retry from public.pos_open_shift(
    (select business_id from phase4_context), false, 10000
  );
  if not v_retry.is_retry then raise exception 'Open retry was not idempotent.'; end if;
  begin
    perform public.pos_open_shift((select business_id from phase4_context), false, 0);
    raise exception 'Different opening cash reused shift.';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

-- Mode cannot change while the physical register is open.
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.pos_open_shift((select business_id from phase4_context), true, 0);
    raise exception 'Owner switched an open live shift to training.';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000003', true);

-- Four gross live sales cover Cash, GCash, and GoTyme. Sale A is voided later.
create temporary table phase4_sale_a on commit drop as
select * from public.pos_complete_shift_sale(
  (select business_id from phase4_context), (select live_shift_id from phase4_context), false,
  '41000000-0000-4000-8000-000000000101',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_id from phase4_context),
    'product_version_id', (select version_id from phase4_context), 'quantity', 1
  )), 'cash', 20000, null, 'void me'
);
create temporary table phase4_sale_b on commit drop as
select * from public.pos_complete_shift_sale(
  (select business_id from phase4_context), (select live_shift_id from phase4_context), false,
  '41000000-0000-4000-8000-000000000102',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_id from phase4_context),
    'product_version_id', (select version_id from phase4_context), 'quantity', 2
  )), 'cash', 40000, null, null
);
create temporary table phase4_sale_c on commit drop as
select * from public.pos_complete_sale(
  (select business_id from phase4_context), '41000000-0000-4000-8000-000000000103',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_id from phase4_context),
    'product_version_id', (select version_id from phase4_context), 'quantity', 1
  )), 'gcash', null, ' GC-4 ', null
);
create temporary table phase4_sale_d on commit drop as
select * from public.pos_complete_shift_sale(
  (select business_id from phase4_context), (select live_shift_id from phase4_context), false,
  '41000000-0000-4000-8000-000000000104',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_id from phase4_context),
    'product_version_id', (select version_id from phase4_context), 'quantity', 1
  )), 'gotyme', null, ' GT-4 ', null
);
grant select on table phase4_sale_a, phase4_sale_b, phase4_sale_c, phase4_sale_d to authenticated;

do $$
begin
  if (select total_centavos from phase4_sale_a) <> 17000
    or (select total_centavos from phase4_sale_b) <> 34000
    or (select total_centavos from phase4_sale_c) <> 17000
    or (select total_centavos from phase4_sale_d) <> 17000 then
    raise exception 'Checkout totals are incorrect.';
  end if;
  begin
    perform public.pos_complete_shift_sale(
      (select business_id from phase4_context), (select live_shift_id from phase4_context), true,
      '41000000-0000-4000-8000-000000000105',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from phase4_context),
        'product_version_id', (select version_id from phase4_context), 'quantity', 1
      )), 'cash', 20000, null, null
    );
    raise exception 'Checkout accepted wrong mode.';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

-- Cashier cannot void. Owner voids A and retries resolve by normalized reason.
do $$
begin
  begin
    perform public.pos_void_sale(
      (select business_id from phase4_context), (select sale_id from phase4_sale_a),
      'Wrong order'
    );
    raise exception 'Cashier voided a sale.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
create temporary table phase4_void_a on commit drop as
select * from public.pos_void_sale(
  (select business_id from phase4_context), (select sale_id from phase4_sale_a),
  '  Wrong order  '
);
grant select on table phase4_void_a to authenticated;

do $$
declare v_retry record;
begin
  select * into strict v_retry from public.pos_void_sale(
    (select business_id from phase4_context), (select sale_id from phase4_sale_a),
    'Wrong order'
  );
  if not v_retry.is_retry or v_retry.event_id <> (select event_id from phase4_void_a) then
    raise exception 'Exact void retry failed.';
  end if;
  begin
    perform public.pos_void_sale(
      (select business_id from phase4_context), (select sale_id from phase4_sale_a),
      'Different reason'
    );
    raise exception 'Different repeat void was accepted.';
  exception when unique_violation then null;
  end;
end;
$$;

-- Ledger fixtures prove drawer math: opening + net cash + pay-in - pay-out -
-- cash expense. Digital expenses do not affect receipt verification because a
-- shift has no opening GCash/GoTyme wallet balance.
reset role;
insert into public.pos_cash_movements (
  business_id, shift_id, is_training, movement_type, amount_centavos,
  reason, recorded_by
) values
  ((select business_id from phase4_context), (select live_shift_id from phase4_context),
   false, 'pay_in', 5000, 'Extra change fund', '40000000-0000-4000-8000-000000000001'),
  ((select business_id from phase4_context), (select live_shift_id from phase4_context),
   false, 'pay_out', 2000, 'Safe drop', '40000000-0000-4000-8000-000000000001');

insert into public.pos_expenses (
  business_id, shift_id, is_training, category, description, payment_source,
  amount_centavos, business_date, recorded_by
) values
  ((select business_id from phase4_context), (select live_shift_id from phase4_context),
   false, 'Supplies', 'Cash test expense', 'cash', 1000,
   (pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date,
   '40000000-0000-4000-8000-000000000001'),
  ((select business_id from phase4_context), (select live_shift_id from phase4_context),
   false, 'Supplies', 'GCash wallet expense', 'gcash', 5000,
   (pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date,
   '40000000-0000-4000-8000-000000000001'),
  ((select business_id from phase4_context), (select live_shift_id from phase4_context),
   false, 'Supplies', 'GoTyme wallet expense', 'gotyme', 4000,
   (pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date,
   '40000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);

-- Gross 85,000; void 17,000; net 68,000. Net costs 30,000 and estimated
-- gross profit 38,000. Expenses are intentionally outside gross-profit math.
do $$
declare v_business_id uuid := (select business_id from phase4_context);
begin
  if (select gross_sale_count from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 4
    or (select voided_sale_count from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 1
    or (select net_sale_count from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 3
    or (select gross_items_sold from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 5
    or (select voided_items_sold from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 1
    or (select net_items_sold from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 4
    or (select gross_sales_centavos from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 85000
    or (select voided_sales_centavos from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 17000
    or (select net_sales_centavos from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 68000
    or (select cash_net_centavos from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 34000
    or (select gcash_net_centavos from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 17000
    or (select gotyme_net_centavos from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 17000
    or (select estimated_cost_centavos from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 30000
    or (select estimated_gross_profit_centavos from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 38000 then
    raise exception 'Owner end-of-day totals are incorrect.';
  end if;
  if (select sale_count from public.pos_get_today_summary(v_business_id)) <> 3
    or (select items_sold from public.pos_get_today_summary(v_business_id)) <> 4
    or (select total_sales_centavos from public.pos_get_today_summary(v_business_id)) <> 68000 then
    raise exception 'Cached today summary is not live-only/net-of-void.';
  end if;
  if not exists (
    select 1 from public.pos_get_recent_sales_v2(v_business_id, false, 20) as recent
    where recent.sale_id = (select sale_id from phase4_sale_a)
      and recent.sale_state = 'voided' and recent.void_reason = 'Wrong order'
      and recent.net_total_centavos = 0 and recent.estimated_cost_centavos = 0
      and not recent.can_void
  ) then
    raise exception 'Recent v2 void audit is incorrect.';
  end if;
end;
$$;

-- Cashier blind-close returns authoritative expected balances and hides costs.
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000003', true);
create temporary table phase4_live_close on commit drop as
select * from public.pos_close_shift(
  (select business_id from phase4_context), (select live_shift_id from phase4_context),
  47000, 17000, 17000, '  Popup close  '
);
grant select on table phase4_live_close to authenticated;

do $$
declare v_retry record;
begin
  if (select expected_cash_centavos from phase4_live_close) <> 46000
    or (select cash_variance_centavos from phase4_live_close) <> 1000
    or (select expected_gcash_centavos from phase4_live_close) <> 17000
    or (select expected_gotyme_centavos from phase4_live_close) <> 17000
    or (select gcash_variance_centavos from phase4_live_close) <> 0
    or (select gotyme_variance_centavos from phase4_live_close) <> 0
    or (select estimated_cost_centavos from phase4_live_close) is not null
    or (select can_view_costs from phase4_live_close) then
    raise exception 'Live close math or cashier cost masking is incorrect.';
  end if;
  select * into strict v_retry from public.pos_close_shift(
    (select business_id from phase4_context), (select live_shift_id from phase4_context),
    47000, 17000, 17000, 'Popup close'
  );
  if not v_retry.is_retry then raise exception 'Exact close retry failed.'; end if;
  begin
    perform public.pos_close_shift(
      (select business_id from phase4_context), (select live_shift_id from phase4_context),
      46000, 17000, 17000, 'Popup close'
    );
    raise exception 'Changed close retry was accepted.';
  exception when unique_violation then null;
  end;
  if (select estimated_cost_centavos from public.pos_get_end_of_day_summary(
      (select business_id from phase4_context), null, false
    )) is not null then
    raise exception 'Cashier report leaked costs.';
  end if;
end;
$$;

-- Exact new and legacy retries recover after close; new work and new voids do not.
do $$
declare v_retry record;
begin
  select * into strict v_retry from public.pos_complete_shift_sale(
    (select business_id from phase4_context), (select live_shift_id from phase4_context), false,
    '41000000-0000-4000-8000-000000000102',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from phase4_context),
      'product_version_id', (select version_id from phase4_context), 'quantity', 2
    )), 'cash', 40000, null, null
  );
  if not v_retry.is_retry then raise exception 'New checkout retry failed after close.'; end if;

  select * into strict v_retry from public.pos_complete_sale(
    (select business_id from phase4_context), '41000000-0000-4000-8000-000000000103',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from phase4_context),
      'product_version_id', (select version_id from phase4_context), 'quantity', 1
    )), 'gcash', null, 'GC-4', null
  );
  if not v_retry.is_retry then raise exception 'Legacy v1 retry failed after close.'; end if;

  begin
    perform public.pos_complete_shift_sale(
      (select business_id from phase4_context), (select live_shift_id from phase4_context), false,
      '41000000-0000-4000-8000-000000000106',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from phase4_context),
        'product_version_id', (select version_id from phase4_context), 'quantity', 1
      )), 'cash', 20000, null, null
    );
    raise exception 'New checkout entered closed shift.';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
do $$
declare v_retry record;
begin
  select * into strict v_retry from public.pos_void_sale(
    (select business_id from phase4_context), (select sale_id from phase4_sale_a), 'Wrong order'
  );
  if not v_retry.is_retry then raise exception 'Void retry failed after close.'; end if;
  begin
    perform public.pos_void_sale(
      (select business_id from phase4_context), (select sale_id from phase4_sale_b), 'Late mistake'
    );
    raise exception 'Closed-shift sale was newly voided.';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

-- Training always starts at zero and remains completely separate from live.
do $$
begin
  begin
    perform public.pos_open_shift((select business_id from phase4_context), true, 100);
    raise exception 'Training accepted nonzero opening cash.';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

create temporary table phase4_training_shift on commit drop as
select * from public.pos_open_shift((select business_id from phase4_context), true, 0);
grant select on table phase4_training_shift to authenticated;
update phase4_context set training_shift_id = (select shift_id from phase4_training_shift);

do $$
begin
  begin
    perform public.pos_open_shift((select business_id from phase4_context), false, 0);
    raise exception 'Live shift opened while training occupied the register.';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.pos_complete_sale(
      (select business_id from phase4_context), '41000000-0000-4000-8000-000000000201',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from phase4_context),
        'product_version_id', (select version_id from phase4_context), 'quantity', 1
      )), 'cash', 20000, null, null
    );
    raise exception 'Legacy live checkout entered training.';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

create temporary table phase4_training_sale on commit drop as
select * from public.pos_complete_shift_sale(
  (select business_id from phase4_context), (select training_shift_id from phase4_context), true,
  '41000000-0000-4000-8000-000000000202',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_id from phase4_context),
    'product_version_id', (select version_id from phase4_context), 'quantity', 1
  )), 'cash', 20000, null, null
);
grant select on table phase4_training_sale to authenticated;

do $$
begin
  if (select receipt_number from phase4_training_sale) not like 'TRN-%'
    or not (select is_training from phase4_training_sale)
    or (select sale_count from public.pos_get_today_summary(
      (select business_id from phase4_context)
    )) <> 3 then
    raise exception 'Training receipt or live dashboard isolation is incorrect.';
  end if;
  begin
    perform public.pos_close_shift(
      (select business_id from phase4_context), (select training_shift_id from phase4_context),
      null, null, null, 'Training done'
    );
    raise exception 'Cashier closed training.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.pos_close_shift(
      (select business_id from phase4_context), (select training_shift_id from phase4_context),
      17000, 0, 0, 'Training done'
    );
    raise exception 'Training accepted real account counts.';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

create temporary table phase4_training_close on commit drop as
select * from public.pos_close_shift(
  (select business_id from phase4_context), (select training_shift_id from phase4_context),
  null, null, null, 'Training done'
);

do $$
declare
  v_retry record;
  v_business_id uuid := (select business_id from phase4_context);
begin
  if (select expected_cash_centavos from phase4_training_close) <> 17000
    or (select counted_cash_centavos from phase4_training_close) <> 17000
    or (select cash_variance_centavos from phase4_training_close) <> 0
    or (select expected_gcash_centavos from phase4_training_close) <> 0
    or (select verified_gcash_centavos from phase4_training_close) <> 0 then
    raise exception 'Training did not auto-reconcile.';
  end if;
  select * into strict v_retry from public.pos_close_shift(
    v_business_id, (select training_shift_id from phase4_context),
    null, null, null, '  Training done  '
  );
  if not v_retry.is_retry then raise exception 'Training close retry failed.'; end if;
  begin
    perform public.pos_close_shift(
      v_business_id, (select training_shift_id from phase4_context),
      null, null, null, 'Changed note'
    );
    raise exception 'Changed training close retry was accepted.';
  exception when unique_violation then null;
  end;
  if (select gross_sale_count from public.pos_get_end_of_day_summary(v_business_id, null, true)) <> 1
    or (select net_sales_centavos from public.pos_get_end_of_day_summary(v_business_id, null, true)) <> 17000
    or (select cash_net_centavos from public.pos_get_end_of_day_summary(v_business_id, null, true)) <> 17000
    or (select gross_sale_count from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 4 then
    raise exception 'Training/live report isolation is incorrect.';
  end if;
end;
$$;

-- Future refund semantics retain consumed costs after preparation.
create temporary table phase4_refund_shift on commit drop as
select * from public.pos_open_shift((select business_id from phase4_context), false, 0);
create temporary table phase4_refund_sale on commit drop as
select * from public.pos_complete_shift_sale(
  (select business_id from phase4_context), (select shift_id from phase4_refund_shift), false,
  '41000000-0000-4000-8000-000000000301',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_id from phase4_context),
    'product_version_id', (select version_id from phase4_context), 'quantity', 1
  )), 'cash', 20000, null, null
);

reset role;
insert into public.pos_sale_events (
  business_id, sale_id, event_type, amount_centavos, payment_method,
  retain_cost, reason, acted_by
) values (
  (select business_id from phase4_context), (select sale_id from phase4_refund_sale),
  'refund_after_preparation', 17000, 'cash', true,
  'Future refund semantics fixture', '40000000-0000-4000-8000-000000000001'
);

do $$
declare v_metrics record;
begin
  select * into strict v_metrics from public._pos_phase4_metrics(
    (select business_id from phase4_context), (select shift_id from phase4_refund_shift),
    null, false
  );
  if v_metrics.net_sales_centavos <> 0
    or v_metrics.net_estimated_cost_centavos <> 7500
    or v_metrics.estimated_gross_profit_centavos <> -7500
    or v_metrics.net_items_sold <> 1 then
    raise exception 'retain_cost=true reversal semantics are incorrect.';
  end if;
  begin
    insert into public.pos_sale_events (
      business_id, sale_id, event_type, amount_centavos, payment_method,
      retain_cost, reason, acted_by
    ) values (
      (select business_id from phase4_context), (select sale_id from phase4_refund_sale),
      'void_before_preparation', 17000, 'cash', false,
      'Second reversal', '40000000-0000-4000-8000-000000000001'
    );
    raise exception 'Second reversal bypassed unique guard.';
  exception when unique_violation then null;
  end;
end;
$$;

-- Outsiders are rejected before input validation; browsers cannot mutate base
-- shift or reversal rows directly.
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000004', true);
do $$
begin
  begin
    perform public.pos_get_shift_status((select business_id from phase4_context));
    raise exception 'Outsider read shift status.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pos_get_end_of_day_summary(
      (select business_id from phase4_context), null, false
    );
    raise exception 'Outsider read EOD.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pos_open_shift((select business_id from phase4_context), null, -1);
    raise exception 'Outsider reached open-shift validation.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pos_complete_shift_sale(
      (select business_id from phase4_context), null, null, null,
      '[]'::jsonb, 'invalid', null, null, null
    );
    raise exception 'Outsider reached checkout validation.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    insert into public.pos_shifts (
      business_id, register_id, is_training, opening_cash_centavos, opened_by
    ) values (
      (select business_id from phase4_context),
      (select id from public.pos_registers
       where business_id = (select business_id from phase4_context) limit 1),
      false, 0, '40000000-0000-4000-8000-000000000003'
    );
    raise exception 'Cashier directly inserted shift.';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.pos_sale_events (
      business_id, sale_id, event_type, amount_centavos, payment_method,
      retain_cost, reason, acted_by
    ) values (
      (select business_id from phase4_context), (select sale_id from phase4_sale_b),
      'void_before_preparation', 34000, 'cash', false,
      'Direct browser void', '40000000-0000-4000-8000-000000000003'
    );
    raise exception 'Cashier directly inserted void.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
do $$
begin
  if (select count(*) from public.pos_sale_events
      where business_id = (select business_id from phase4_context)
        and event_type = 'void_before_preparation') <> 1 then
    raise exception 'Void idempotency/direct-write controls failed.';
  end if;
  if (select last_number from public.pos_receipt_counters
      where business_id = (select business_id from phase4_context)
        and is_training = false) <> 5
    or (select last_number from public.pos_receipt_counters
      where business_id = (select business_id from phase4_context)
        and is_training = true) <> 1 then
    raise exception 'Rejected operations consumed receipts or counters mixed.';
  end if;
end;
$$;

rollback;

select 'PASS: POS Phase 4 behavior checks' as result;
