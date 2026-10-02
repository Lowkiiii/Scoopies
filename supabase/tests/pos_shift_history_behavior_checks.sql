-- Transaction-scoped filter, aggregation, pagination, reconciliation, and
-- access-control checks for schema v8.

begin;

insert into auth.users (id, email) values
  ('80000000-0000-4000-8000-000000000001', 'shift-owner@example.test'),
  ('80000000-0000-4000-8000-000000000002', 'shift-cashier@example.test'),
  ('80000000-0000-4000-8000-000000000003', 'shift-outsider@example.test');

create temporary table shift_history_context (
  singleton boolean primary key default true check (singleton),
  business_id uuid not null,
  product_a_id uuid,
  product_a_version_id uuid,
  product_b_id uuid,
  product_b_version_id uuid,
  live_shift_1_id uuid,
  live_shift_2_id uuid,
  training_shift_id uuid,
  void_sale_id uuid,
  refund_sale_id uuid
) on commit drop;

grant select, insert, update on table shift_history_context to authenticated;
grant select on table shift_history_context to anon;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '80000000-0000-4000-8000-000000000001',
  true
);

insert into shift_history_context (business_id)
select public.pos_bootstrap_business(
  'Shift History Test', 'S8H', 'Asia/Manila'
);

select public.pos_add_member_by_email(
  (select business_id from shift_history_context),
  'shift-cashier@example.test',
  'cashier',
  'Shift Cashier'
);

with publication as (
  select * from public.pos_publish_costing_product(
    (select business_id from shift_history_context),
    'shift-sea-salt-product',
    'shift-sea-salt-recipe',
    'Sea Salt Cream Matcha',
    19000,
    7000,
    1500,
    jsonb_build_object(
      'schemaVersion', 1,
      'sourceProductId', 'shift-sea-salt-product',
      'sourceRecipeId', 'shift-sea-salt-recipe',
      'name', 'Sea Salt Cream Matcha',
      'size', '12 oz',
      'sellingPriceCentavos', 19000,
      'ingredientCostCentavos', 7000,
      'packagingCostCentavos', 1500
    ),
    '12 oz',
    'Shift Test',
    null
  )
)
update shift_history_context
set product_a_id = publication.product_id,
    product_a_version_id = publication.version_id
from publication;

with publication as (
  select * from public.pos_publish_costing_product(
    (select business_id from shift_history_context),
    'shift-matcha-product',
    'shift-matcha-recipe',
    'Matcha Latte',
    17000,
    6000,
    1500,
    jsonb_build_object(
      'schemaVersion', 1,
      'sourceProductId', 'shift-matcha-product',
      'sourceRecipeId', 'shift-matcha-recipe',
      'name', 'Matcha Latte',
      'size', '12 oz',
      'sellingPriceCentavos', 17000,
      'ingredientCostCentavos', 6000,
      'packagingCostCentavos', 1500
    ),
    '12 oz',
    'Shift Test',
    null
  )
)
update shift_history_context
set product_b_id = publication.product_id,
    product_b_version_id = publication.version_id
from publication;

-- Live shift 1: one net cash order and one GCash order voided before close.
with opened as (
  select * from public.pos_open_shift(
    (select business_id from shift_history_context), false, 10000
  )
)
update shift_history_context
set live_shift_1_id = opened.shift_id
from opened;

select * from public.pos_complete_shift_sale(
  (select business_id from shift_history_context),
  (select live_shift_1_id from shift_history_context),
  false,
  '81000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'product_id', (select product_a_id from shift_history_context),
      'product_version_id',
        (select product_a_version_id from shift_history_context),
      'quantity', 2
    ),
    jsonb_build_object(
      'product_id', (select product_b_id from shift_history_context),
      'product_version_id',
        (select product_b_version_id from shift_history_context),
      'quantity', 1
    )
  ),
  'cash', 60000, null, 'Net cash order'
);

with completed as (
  select * from public.pos_complete_shift_sale(
    (select business_id from shift_history_context),
    (select live_shift_1_id from shift_history_context),
    false,
    '81000000-0000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_b_id from shift_history_context),
      'product_version_id',
        (select product_b_version_id from shift_history_context),
      'quantity', 4
    )),
    'gcash', null, 'SHIFT-VOID-1', 'Void fixture'
  )
)
update shift_history_context
set void_sale_id = completed.sale_id
from completed;

select * from public.pos_void_sale(
  (select business_id from shift_history_context),
  (select void_sale_id from shift_history_context),
  'Customer cancelled before preparation'
);

select * from public.pos_close_shift(
  (select business_id from shift_history_context),
  (select live_shift_1_id from shift_history_context),
  66000,
  0,
  0,
  'First live close'
);

-- Live shift 2: a valid GoTyme order and one after-preparation GCash refund.
with opened as (
  select * from public.pos_open_shift(
    (select business_id from shift_history_context), false, 0
  )
)
update shift_history_context
set live_shift_2_id = opened.shift_id
from opened;

select * from public.pos_complete_shift_sale(
  (select business_id from shift_history_context),
  (select live_shift_2_id from shift_history_context),
  false,
  '81000000-0000-4000-8000-000000000003',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_a_id from shift_history_context),
    'product_version_id',
      (select product_a_version_id from shift_history_context),
    'quantity', 3
  )),
  'gotyme', null, 'SHIFT-GOTYME-1', 'Net GoTyme order'
);

with completed as (
  select * from public.pos_complete_shift_sale(
    (select business_id from shift_history_context),
    (select live_shift_2_id from shift_history_context),
    false,
    '81000000-0000-4000-8000-000000000004',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_b_id from shift_history_context),
      'product_version_id',
        (select product_b_version_id from shift_history_context),
      'quantity', 2
    )),
    'gcash', null, 'SHIFT-REFUND-1', 'Refund fixture'
  )
)
update shift_history_context
set refund_sale_id = completed.sale_id
from completed;

-- No public refund mutation exists yet. Insert the immutable fixture event as
-- the database owner to verify every reversal type is excluded from tally.
reset role;
insert into public.pos_sale_events (
  business_id, sale_id, event_type, amount_centavos, payment_method,
  retain_cost, reference_number, reason, metadata, acted_by
)
select
  context.business_id,
  context.refund_sale_id,
  'refund_after_preparation',
  34000,
  'gcash',
  true,
  'SHIFT-REFUND-1',
  'After-preparation refund fixture',
  '{}'::jsonb,
  '80000000-0000-4000-8000-000000000001'::uuid
from shift_history_context as context;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '80000000-0000-4000-8000-000000000001',
  true
);

select * from public.pos_close_shift(
  (select business_id from shift_history_context),
  (select live_shift_2_id from shift_history_context),
  0,
  0,
  58000,
  'Second live close'
);

-- Make shift 2 an explicit cross-midnight fixture: it opened on today's
-- Manila date and Close shift was confirmed on the next Manila date. This
-- verifies that shift-history dates follow close confirmation, while the
-- exact shift tally remains independent of the date boundary.
reset role;
update public.pos_shifts as shift
set opened_at = (
      (pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date
        + time '23:55'
    ) at time zone 'Asia/Manila',
    closed_at = (
      ((pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date + 1)
        + time '00:05'
    ) at time zone 'Asia/Manila'
where shift.business_id = (select business_id from shift_history_context)
  and shift.id = (select live_shift_2_id from shift_history_context);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '80000000-0000-4000-8000-000000000001',
  true
);

-- Training stays completely separate from Live reports.
with opened as (
  select * from public.pos_open_shift(
    (select business_id from shift_history_context), true, 0
  )
)
update shift_history_context
set training_shift_id = opened.shift_id
from opened;

select * from public.pos_complete_shift_sale(
  (select business_id from shift_history_context),
  (select training_shift_id from shift_history_context),
  true,
  '81000000-0000-4000-8000-000000000005',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_b_id from shift_history_context),
    'product_version_id',
      (select product_b_version_id from shift_history_context),
    'quantity', 5
  )),
  'cash', 100000, null, 'Training order'
);

select * from public.pos_close_shift(
  (select business_id from shift_history_context),
  (select training_shift_id from shift_history_context),
  null,
  null,
  null,
  'Training close'
);

-- All-time Live tally combines the two live shifts and excludes both the void
-- and the after-preparation refund from units, orders, and item revenue.
do $$
declare
  v_date date := (pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date;
  v_rows jsonb;
begin
  select jsonb_agg(to_jsonb(tally) order by tally.units_sold desc)
    into v_rows
  from public.pos_get_sales_product_tally_v2(
    (select business_id from shift_history_context),
    false, null, null, null
  ) as tally;

  if jsonb_array_length(v_rows) <> 2
    or not exists (
      select 1
      from public.pos_get_sales_product_tally_v2(
        (select business_id from shift_history_context),
        false, null, null, null
      ) as tally
      where tally.product_id =
          (select product_a_id from shift_history_context)
        and tally.item_name = 'Sea Salt Cream Matcha'
        and tally.size_label = '12 oz'
        and tally.order_count = 2
        and tally.units_sold = 5
        and tally.net_sales_centavos = 95000
    )
    or not exists (
      select 1
      from public.pos_get_sales_product_tally_v2(
        (select business_id from shift_history_context),
        false, null, null, null
      ) as tally
      where tally.product_id =
          (select product_b_id from shift_history_context)
        and tally.order_count = 1
        and tally.units_sold = 1
        and tally.net_sales_centavos = 17000
    ) then
    raise exception 'Filtered all-time tally is incorrect: %', v_rows;
  end if;

  if (select count(*)
      from public.pos_get_sales_product_tally_v2(
        (select business_id from shift_history_context),
        false, null, null,
        (select live_shift_1_id from shift_history_context)
      )) <> 2
    or not exists (
      select 1
      from public.pos_get_sales_product_tally_v2(
        (select business_id from shift_history_context),
        false, null, null,
        (select live_shift_2_id from shift_history_context)
      ) as tally
      where tally.product_id =
          (select product_a_id from shift_history_context)
        and tally.order_count = 1
        and tally.units_sold = 3
        and tally.net_sales_centavos = 57000
    )
    or (select count(*)
        from public.pos_get_sales_product_tally_v2(
          (select business_id from shift_history_context),
          false, v_date, v_date, null
        )) <> 2
    or exists (
      select 1
      from public.pos_get_sales_product_tally_v2(
        (select business_id from shift_history_context),
        false, v_date + 1, null, null
      )
    ) then
    raise exception 'Date/shift tally filters did not intersect correctly.';
  end if;

  if not exists (
      select 1
      from public.pos_get_sales_product_tally_v2(
        (select business_id from shift_history_context),
        true, null, null, null
      ) as tally
      where tally.product_id =
          (select product_b_id from shift_history_context)
        and tally.units_sold = 5
        and tally.net_sales_centavos = 85000
    ) then
    raise exception 'Training tally was missing or mixed with Live.';
  end if;
end;
$$;

-- Owner sees exact stored close facts and role-safe cost/profit amounts.
do $$
declare
  v_date date := (pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date;
  v_close_date date :=
    (pg_catalog.timezone('Asia/Manila', pg_catalog.now()))::date + 1;
  v_newest record;
  v_older record;
begin
  select * into strict v_newest
  from public.pos_get_closed_shifts_page(
    (select business_id from shift_history_context),
    false, null, null, null, null, 1
  );

  if v_newest.shift_id is distinct from
      (select live_shift_2_id from shift_history_context)
    or v_newest.opened_business_date is distinct from v_date
    or v_newest.closed_business_date is distinct from v_close_date
    or v_newest.close_notes is distinct from 'Second live close'
    or v_newest.gross_sale_count <> 2
    or v_newest.voided_sale_count <> 0
    or v_newest.net_sale_count <> 2
    or v_newest.net_items_sold <> 5
    or v_newest.gross_sales_centavos <> 91000
    or v_newest.voided_sales_centavos <> 34000
    or v_newest.net_sales_centavos <> 57000
    or v_newest.gcash_net_centavos <> 0
    or v_newest.gotyme_net_centavos <> 57000
    or v_newest.expected_gotyme_centavos <> 57000
    or v_newest.verified_gotyme_centavos <> 58000
    or v_newest.gotyme_variance_centavos <> 1000
    or v_newest.estimated_cost_centavos <> 40500
    or v_newest.estimated_gross_profit_centavos <> 16500
    or v_newest.can_view_costs is not true
    or v_newest.has_more is not true then
    raise exception 'Newest closed-shift result is incorrect: %',
      to_jsonb(v_newest);
  end if;

  select * into strict v_older
  from public.pos_get_closed_shifts_page(
    (select business_id from shift_history_context),
    false, null, null, v_newest.closed_at, v_newest.shift_id, 1
  );

  if v_older.shift_id is distinct from
      (select live_shift_1_id from shift_history_context)
    or v_older.close_notes is distinct from 'First live close'
    or v_older.gross_sale_count <> 2
    or v_older.voided_sale_count <> 1
    or v_older.net_sale_count <> 1
    or v_older.net_items_sold <> 3
    or v_older.gross_sales_centavos <> 123000
    or v_older.voided_sales_centavos <> 68000
    or v_older.net_sales_centavos <> 55000
    or v_older.opening_cash_centavos <> 10000
    or v_older.expected_cash_centavos <> 65000
    or v_older.counted_cash_centavos <> 66000
    or v_older.cash_variance_centavos <> 1000
    or v_older.estimated_cost_centavos <> 24500
    or v_older.estimated_gross_profit_centavos <> 30500
    or v_older.has_more is not false then
    raise exception 'Older closed-shift result or cursor is incorrect: %',
      to_jsonb(v_older);
  end if;

  if exists (
      select 1
      from public.pos_get_closed_shifts_page(
        (select business_id from shift_history_context),
        false, v_close_date + 1, null, null, null, 20
      )
    )
    or (select count(*)
        from public.pos_get_closed_shifts_page(
          (select business_id from shift_history_context),
          false, v_close_date, v_close_date, null, null, 20
        )) <> 1
    or not exists (
      select 1
      from public.pos_get_closed_shifts_page(
        (select business_id from shift_history_context),
        false, v_close_date, v_close_date, null, null, 20
      ) as history
      where history.shift_id =
        (select live_shift_2_id from shift_history_context)
    )
    or (select count(*)
        from public.pos_get_closed_shifts_page(
          (select business_id from shift_history_context),
          true, null, null, null, null, 20
        )) <> 1 then
    raise exception 'Closed-shift date or mode filtering is incorrect.';
  end if;
end;
$$;

-- Tally remains cashier-safe, while historical cash counts, wallet
-- verification, variances, and close notes are restricted to management.
select set_config(
  'request.jwt.claim.sub',
  '80000000-0000-4000-8000-000000000002',
  true
);

do $$
begin
  if (select coalesce(sum(tally.net_sales_centavos), 0)
      from public.pos_get_sales_product_tally_v2(
        (select business_id from shift_history_context),
        false, null, null, null
      ) as tally) <> 112000 then
    raise exception 'Cashier could not read the safe product tally.';
  end if;

  begin
    perform 1 from public.pos_get_closed_shifts_page(
      (select business_id from shift_history_context),
      false, null, null, null, null, 1
    );
    raise exception 'Cashier read sensitive closed-shift reconciliation.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- An authorized owner gets filter validation only after authorization.
select set_config(
  'request.jwt.claim.sub',
  '80000000-0000-4000-8000-000000000001',
  true
);

do $$
begin
  begin
    perform 1 from public.pos_get_sales_product_tally_v2(
      (select business_id from shift_history_context),
      false, current_date, current_date,
      (select live_shift_1_id from shift_history_context)
    );
    raise exception 'Tally accepted both shift and date filters.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform 1 from public.pos_get_sales_product_tally_v2(
      (select business_id from shift_history_context),
      false, current_date, current_date - 1, null
    );
    raise exception 'Tally accepted a reversed date range.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform 1 from public.pos_get_sales_product_tally_v2(
      (select business_id from shift_history_context),
      false, null, null,
      (select training_shift_id from shift_history_context)
    );
    raise exception 'Tally accepted a shift from another mode.';
  exception when no_data_found then null;
  end;

  begin
    perform 1 from public.pos_get_closed_shifts_page(
      (select business_id from shift_history_context),
      false, null, null, pg_catalog.now(), null, 20
    );
    raise exception 'Shift history accepted a partial cursor.';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- Outsiders are denied before malformed inputs are validated.
select set_config(
  'request.jwt.claim.sub',
  '80000000-0000-4000-8000-000000000003',
  true
);

do $$
begin
  begin
    perform 1 from public.pos_get_sales_product_tally_v2(
      (select business_id from shift_history_context),
      null, current_date, current_date - 1, null
    );
    raise exception 'Outsider executed or validated filtered tally.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.pos_get_closed_shifts_page(
      (select business_id from shift_history_context),
      null, current_date, current_date - 1, pg_catalog.now(), null, 0
    );
    raise exception 'Outsider executed or validated shift history.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Inactive memberships and authenticated sessions without a user are denied.
reset role;
update public.pos_business_members
set active = false
where business_id = (select business_id from shift_history_context)
  and user_id = '80000000-0000-4000-8000-000000000002'::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '80000000-0000-4000-8000-000000000002',
  true
);

do $$
begin
  begin
    perform 1 from public.pos_get_closed_shifts_page(
      (select business_id from shift_history_context),
      false, null, null, null, null, 20
    );
    raise exception 'Inactive member read shift history.';
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
    perform 1 from public.pos_get_sales_product_tally_v2(
      (select business_id from shift_history_context),
      false, null, null, null
    );
    raise exception 'Authenticated role without a user read tally.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;

do $$
begin
  begin
    perform 1 from public.pos_get_closed_shifts_page(
      (select business_id from shift_history_context),
      false, null, null, null, null, 20
    );
    raise exception 'Anonymous role executed shift history.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select 'PASS: POS shift-history behavior checks' as result;
rollback;
