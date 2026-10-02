-- Transaction-scoped sales-history pagination, totals, and access checks.

begin;

insert into auth.users (id, email) values
  ('60000000-0000-4000-8000-000000000001', 'history-owner@example.test'),
  ('60000000-0000-4000-8000-000000000002', 'history-cashier@example.test'),
  ('60000000-0000-4000-8000-000000000003', 'history-outsider@example.test');

create temporary table history_context (
  singleton boolean primary key default true check (singleton),
  business_id uuid not null,
  product_id uuid,
  version_id uuid,
  live_shift_id uuid,
  training_shift_id uuid,
  live_sale_a uuid,
  live_sale_b uuid,
  live_sale_c uuid,
  live_sale_d uuid,
  live_sale_e uuid,
  training_sale_a uuid,
  training_sale_b uuid
) on commit drop;

grant select, insert, update on table history_context to authenticated;
grant select on table history_context to anon;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  true
);

insert into history_context (business_id)
select public.pos_bootstrap_business(
  'Sales History Pagination Test', 'H6T', 'Asia/Manila'
);

select public.pos_add_member_by_email(
  (select business_id from history_context),
  'history-cashier@example.test',
  'cashier',
  'History Cashier'
);

with publication as (
  select * from public.pos_publish_costing_product(
    (select business_id from history_context),
    'history-matcha-product',
    'history-matcha-recipe',
    'History Matcha',
    17000,
    6000,
    1500,
    jsonb_build_object(
      'schemaVersion', 1,
      'sourceProductId', 'history-matcha-product',
      'sourceRecipeId', 'history-matcha-recipe',
      'name', 'History Matcha',
      'size', '12 oz',
      'sellingPriceCentavos', 17000,
      'ingredientCostCentavos', 6000,
      'packagingCostCentavos', 1500
    ),
    '12 oz',
    'History Test',
    null
  )
)
update history_context
set product_id = publication.product_id,
    version_id = publication.version_id
from publication;

with opened as (
  select * from public.pos_open_shift(
    (select business_id from history_context), false, 0
  )
)
update history_context set live_shift_id = opened.shift_id from opened;

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000002',
  true
);

-- Five Live receipts exceed two full test pages. Sale A is voided later.
with completed as (
  select * from public.pos_complete_shift_sale(
    (select business_id from history_context),
    (select live_shift_id from history_context),
    false,
    '61000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from history_context),
      'product_version_id', (select version_id from history_context),
      'quantity', 1
    )),
    'cash', 20000, null, 'void fixture'
  )
)
update history_context set live_sale_a = completed.sale_id from completed;

with completed as (
  select * from public.pos_complete_shift_sale(
    (select business_id from history_context),
    (select live_shift_id from history_context),
    false,
    '61000000-0000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from history_context),
      'product_version_id', (select version_id from history_context),
      'quantity', 2
    )),
    'cash', 40000, null, null
  )
)
update history_context set live_sale_b = completed.sale_id from completed;

with completed as (
  select * from public.pos_complete_shift_sale(
    (select business_id from history_context),
    (select live_shift_id from history_context),
    false,
    '61000000-0000-4000-8000-000000000003',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from history_context),
      'product_version_id', (select version_id from history_context),
      'quantity', 1
    )),
    'gcash', null, 'HISTORY-GCASH-1', null
  )
)
update history_context set live_sale_c = completed.sale_id from completed;

with completed as (
  select * from public.pos_complete_shift_sale(
    (select business_id from history_context),
    (select live_shift_id from history_context),
    false,
    '61000000-0000-4000-8000-000000000004',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from history_context),
      'product_version_id', (select version_id from history_context),
      'quantity', 3
    )),
    'gotyme', null, 'HISTORY-GOTYME-1', null
  )
)
update history_context set live_sale_d = completed.sale_id from completed;

with completed as (
  select * from public.pos_complete_shift_sale(
    (select business_id from history_context),
    (select live_shift_id from history_context),
    false,
    '61000000-0000-4000-8000-000000000005',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from history_context),
      'product_version_id', (select version_id from history_context),
      'quantity', 1
    )),
    'gcash', null, 'HISTORY-GCASH-2', null
  )
)
update history_context set live_sale_e = completed.sale_id from completed;

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  true
);

select * from public.pos_void_sale(
  (select business_id from history_context),
  (select live_sale_a from history_context),
  'History pagination void'
);

select * from public.pos_close_shift(
  (select business_id from history_context),
  (select live_shift_id from history_context),
  34000,
  34000,
  51000,
  'History live close'
);

with opened as (
  select * from public.pos_open_shift(
    (select business_id from history_context), true, 0
  )
)
update history_context set training_shift_id = opened.shift_id from opened;

with completed as (
  select * from public.pos_complete_shift_sale(
    (select business_id from history_context),
    (select training_shift_id from history_context),
    true,
    '61000000-0000-4000-8000-000000000006',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from history_context),
      'product_version_id', (select version_id from history_context),
      'quantity', 1
    )),
    'cash', 20000, null, null
  )
)
update history_context set training_sale_a = completed.sale_id from completed;

with completed as (
  select * from public.pos_complete_shift_sale(
    (select business_id from history_context),
    (select training_shift_id from history_context),
    true,
    '61000000-0000-4000-8000-000000000007',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from history_context),
      'product_version_id', (select version_id from history_context),
      'quantity', 2
    )),
    'gcash', null, 'TRAINING-HISTORY', null
  )
)
update history_context set training_sale_b = completed.sale_id from completed;

select * from public.pos_close_shift(
  (select business_id from history_context),
  (select training_shift_id from history_context),
  null, null, null,
  'History training close'
);

-- Freeze deterministic cross-day fixtures. All Live completions intentionally
-- share one timestamp, so only the UUID half of the cursor can separate them.
reset role;
alter table public.pos_sales disable trigger pos_sales_protected;

update public.pos_sales as sale
set completed_at = '2026-10-02 12:00:00+00'::timestamptz,
    business_date = case sale.id
      when (select live_sale_a from history_context) then date '2026-09-28'
      when (select live_sale_b from history_context) then date '2026-09-29'
      when (select live_sale_c from history_context) then date '2026-09-30'
      when (select live_sale_d from history_context) then date '2026-10-01'
      when (select live_sale_e from history_context) then date '2026-10-02'
      when (select training_sale_a from history_context) then date '2026-09-30'
      when (select training_sale_b from history_context) then date '2026-10-03'
      else sale.business_date
    end
where sale.business_id = (select business_id from history_context);

alter table public.pos_sales enable trigger pos_sales_protected;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  true
);

create temporary table history_page_one on commit drop as
select *
from public.pos_get_sales_history_page(
  (select business_id from history_context), false, null, null, 2
);

create temporary table history_page_two on commit drop as
with cursor_row as (
  select completed_at, sale_id
  from history_page_one
  order by completed_at desc, sale_id desc
  offset 1 limit 1
)
select history.*
from cursor_row as cursor
cross join lateral public.pos_get_sales_history_page(
  (select business_id from history_context),
  false,
  cursor.completed_at,
  cursor.sale_id,
  2
) as history;

create temporary table history_page_three on commit drop as
with cursor_row as (
  select completed_at, sale_id
  from history_page_two
  order by completed_at desc, sale_id desc
  offset 1 limit 1
)
select history.*
from cursor_row as cursor
cross join lateral public.pos_get_sales_history_page(
  (select business_id from history_context),
  false,
  cursor.completed_at,
  cursor.sale_id,
  2
) as history;

create temporary table history_all_pages on commit drop as
select * from history_page_one
union all
select * from history_page_two
union all
select * from history_page_three;

do $$
declare
  v_actual uuid[];
  v_expected uuid[];
begin
  if (select count(*) from history_page_one) <> 2
    or not (select bool_and(has_more) from history_page_one)
    or (select count(*) from history_page_two) <> 2
    or not (select bool_and(has_more) from history_page_two)
    or (select count(*) from history_page_three) <> 1
    or not (select bool_and(not has_more) from history_page_three) then
    raise exception 'History page size or lookahead state is incorrect.';
  end if;

  select array_agg(page.sale_id order by page.completed_at desc, page.sale_id desc)
    into v_actual
  from history_all_pages as page;

  select array_agg(sale.id order by sale.completed_at desc, sale.id desc)
    into v_expected
  from public.pos_sales as sale
  where sale.business_id = (select business_id from history_context)
    and sale.status = 'completed'
    and sale.is_training = false;

  if v_actual is distinct from v_expected
    or (select count(distinct sale_id) from history_all_pages) <> 5
    or (select count(distinct completed_at) from history_all_pages) <> 1 then
    raise exception 'Timestamp/UUID keyset pages have an overlap, gap, or wrong order.';
  end if;

  if not exists (
    select 1
    from history_all_pages as page
    where page.sale_id = (select live_sale_a from history_context)
      and page.sale_state = 'voided'
      and page.voided_amount_centavos = 17000
      and page.net_total_centavos = 0
      and page.void_reason = 'History pagination void'
      and page.estimated_cost_centavos = 0
      and page.estimated_gross_profit_centavos = 0
      and page.can_view_costs
      and not page.can_void
  ) then
    raise exception 'History page did not preserve void or owner cost semantics.';
  end if;
end;
$$;

do $$
declare
  v_live record;
  v_training record;
begin
  select * into strict v_live
  from public.pos_get_sales_history_summary(
    (select business_id from history_context), false
  );

  if v_live.first_business_date <> date '2026-09-28'
    or v_live.last_business_date <> date '2026-10-02'
    or v_live.business_timezone <> 'Asia/Manila'
    or v_live.is_training
    or v_live.gross_sale_count <> 5
    or v_live.voided_sale_count <> 1
    or v_live.net_sale_count <> 4
    or v_live.gross_items_sold <> 8
    or v_live.voided_items_sold <> 1
    or v_live.net_items_sold <> 7
    or v_live.gross_sales_centavos <> 136000
    or v_live.voided_sales_centavos <> 17000
    or v_live.net_sales_centavos <> 119000
    or v_live.cash_net_centavos <> 34000
    or v_live.gcash_net_centavos <> 34000
    or v_live.gotyme_net_centavos <> 51000
    or v_live.estimated_cost_centavos <> 52500
    or v_live.estimated_gross_profit_centavos <> 66500
    or not v_live.can_view_costs then
    raise exception 'Authoritative all-time Live summary is incorrect: %',
      row_to_json(v_live);
  end if;

  select * into strict v_training
  from public.pos_get_sales_history_summary(
    (select business_id from history_context), true
  );

  if v_training.first_business_date <> date '2026-09-30'
    or v_training.last_business_date <> date '2026-10-03'
    or not v_training.is_training
    or v_training.gross_sale_count <> 2
    or v_training.voided_sale_count <> 0
    or v_training.net_sale_count <> 2
    or v_training.gross_items_sold <> 3
    or v_training.net_items_sold <> 3
    or v_training.gross_sales_centavos <> 51000
    or v_training.net_sales_centavos <> 51000
    or v_training.cash_net_centavos <> 17000
    or v_training.gcash_net_centavos <> 34000
    or v_training.gotyme_net_centavos <> 0
    or v_training.estimated_cost_centavos <> 22500
    or v_training.estimated_gross_profit_centavos <> 28500 then
    raise exception 'Training totals mixed with Live history: %',
      row_to_json(v_training);
  end if;

  if (select count(*) from public.pos_get_sales_history_page(
      (select business_id from history_context), true, null, null, 100
    )) <> 2
    or exists (
      select 1 from public.pos_get_sales_history_page(
        (select business_id from history_context), true, null, null, 100
      ) where not is_training or has_more
    ) then
    raise exception 'Training page is incomplete or contains Live receipts.';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000003',
  true
);

create temporary table history_empty_business on commit drop as
select public.pos_bootstrap_business(
  'Empty Sales History Test', 'E6T', 'Asia/Manila'
) as business_id;
grant select on table history_empty_business to authenticated;

do $$
declare
  v_empty record;
begin
  select * into strict v_empty
  from public.pos_get_sales_history_summary(
    (select business_id from history_empty_business), false
  );

  if v_empty.first_business_date is not null
    or v_empty.last_business_date is not null
    or v_empty.gross_sale_count <> 0
    or v_empty.voided_sale_count <> 0
    or v_empty.net_sale_count <> 0
    or v_empty.gross_items_sold <> 0
    or v_empty.net_items_sold <> 0
    or v_empty.gross_sales_centavos <> 0
    or v_empty.net_sales_centavos <> 0
    or v_empty.cash_net_centavos <> 0
    or v_empty.gcash_net_centavos <> 0
    or v_empty.gotyme_net_centavos <> 0
    or v_empty.estimated_cost_centavos <> 0
    or v_empty.estimated_gross_profit_centavos <> 0
    or not v_empty.can_view_costs
    or (select count(*) from public.pos_get_sales_history_page(
      (select business_id from history_empty_business), false, null, null, 20
    )) <> 0 then
    raise exception 'Empty sales history did not return one zero aggregate and no receipts.';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  true
);

-- Deterministic page validation rejects malformed limits/cursor pairs.
do $$
declare
  v_business_id uuid := (select business_id from history_context);
begin
  begin
    perform 1 from public.pos_get_sales_history_page(
      v_business_id, false, null, null, 0
    );
    raise exception 'History accepted a zero page limit.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform 1 from public.pos_get_sales_history_page(
      v_business_id, false, null, null, 101
    );
    raise exception 'History accepted a page limit over 100.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform 1 from public.pos_get_sales_history_page(
      v_business_id, false,
      '2026-10-02 12:00:00+00'::timestamptz,
      null,
      20
    );
    raise exception 'History accepted a half timestamp/UUID cursor.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform 1 from public.pos_get_sales_history_page(
      v_business_id, false,
      null,
      '61000000-0000-4000-8000-000000000001'::uuid,
      20
    );
    raise exception 'History accepted a half UUID/timestamp cursor.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform 1 from public.pos_get_sales_history_summary(v_business_id, null);
    raise exception 'History summary accepted a missing mode.';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- Cashiers receive every non-cost receipt/aggregate field but no cost facts.
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000002',
  true
);

do $$
declare
  v_summary record;
begin
  if (select count(*) from public.pos_get_sales_history_page(
      (select business_id from history_context), false, null, null, 100
    )) <> 5
    or exists (
      select 1
      from public.pos_get_sales_history_page(
        (select business_id from history_context), false, null, null, 100
      ) as page
      where page.can_view_costs
        or page.estimated_cost_centavos is not null
        or page.estimated_gross_profit_centavos is not null
        or page.can_void
    ) then
    raise exception 'Cashier history is incomplete or leaked cost/void authority.';
  end if;

  select * into strict v_summary
  from public.pos_get_sales_history_summary(
    (select business_id from history_context), false
  );

  if v_summary.net_sales_centavos <> 119000
    or v_summary.can_view_costs
    or v_summary.estimated_cost_centavos is not null
    or v_summary.estimated_gross_profit_centavos is not null then
    raise exception 'Cashier all-time summary is wrong or leaked costs.';
  end if;
end;
$$;

-- Membership is checked before page validation, preventing outsider oracles.
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000003',
  true
);

do $$
begin
  begin
    perform 1 from public.pos_get_sales_history_page(
      (select business_id from history_context), false, null, null, 0
    );
    raise exception 'Outsider executed or validated sales history.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.pos_get_sales_history_summary(
      (select business_id from history_context), false
    );
    raise exception 'Outsider read all-time sales totals.';
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
    perform 1 from public.pos_get_sales_history_page(
      (select business_id from history_context), false, null, null, 20
    );
    raise exception 'Authenticated role without a user executed sales history.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.pos_get_sales_history_summary(
      (select business_id from history_context), false
    );
    raise exception 'Authenticated role without a user read all-time totals.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;

do $$
begin
  begin
    perform 1 from public.pos_get_sales_history_page(
      (select business_id from history_context), false, null, null, 20
    );
    raise exception 'Anonymous role executed sales-history pagination.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.pos_get_sales_history_summary(
      (select business_id from history_context), false
    );
    raise exception 'Anonymous role executed all-time sales summary.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select 'PASS: POS sales-history pagination behavior checks' as result;

rollback;
