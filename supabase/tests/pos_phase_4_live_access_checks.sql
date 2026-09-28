-- Live Supabase Phase 4 smoke check. All fixtures and sales are rolled back.
-- Requires two existing Auth users and the production costing document.

begin;

do $$
begin
  if (select count(*) from auth.users) < 2 then
    raise exception 'This check needs at least two existing auth accounts.';
  end if;
  if to_regclass('public.scoopies_state') is null
    or not exists (select 1 from public.scoopies_state where id = 'main') then
    raise exception 'The main costing row is required for checksum protection.';
  end if;
end;
$$;

create temporary table phase4_live_context (
  owner_id uuid not null,
  cashier_id uuid not null,
  business_id uuid not null,
  product_id uuid,
  version_id uuid,
  live_shift_id uuid,
  training_shift_id uuid,
  void_shift_id uuid,
  void_sale_id uuid
) on commit drop;

create temporary table phase4_live_costing_before as
select count(*)::bigint as row_count,
       md5(string_agg(id || ':' || data::text, '|' order by id)) as checksum,
       sum(pg_column_size(data))::bigint as data_bytes
from public.scoopies_state;

with accounts as (
  select id, row_number() over (order by id) as account_number
  from auth.users
), business as (
  insert into public.pos_businesses (
    name, timezone, currency_code, receipt_prefix, created_by
  )
  select 'Scoopies Phase 4 Live Test', 'Asia/Manila', 'PHP', 'T4L', owner.id
  from accounts as owner where owner.account_number = 1
  returning id, created_by
)
insert into phase4_live_context (owner_id, cashier_id, business_id)
select business.created_by, cashier.id, business.id
from business join accounts as cashier on cashier.account_number = 2;

insert into public.pos_business_members (
  business_id, user_id, role, display_name
)
select business_id, owner_id, 'owner', 'Phase 4 Live Owner'
from phase4_live_context
union all
select business_id, cashier_id, 'cashier', 'Phase 4 Live Cashier'
from phase4_live_context;

insert into public.pos_registers (business_id, name, created_by)
select business_id, 'Phase 4 Live Register', owner_id
from phase4_live_context;

grant select, update on table phase4_live_context to authenticated;
grant select on table phase4_live_context to anon;

select set_config('request.jwt.claim.sub', (select owner_id::text from phase4_live_context), true);
set local role authenticated;

with publication as (
  select * from public.pos_publish_costing_product(
    (select business_id from phase4_live_context),
    'phase4-live-product', 'phase4-live-recipe', 'Phase 4 Live Matcha',
    17000, 6000, 1500,
    jsonb_build_object(
      'schemaVersion', 1, 'sourceProductId', 'phase4-live-product',
      'sourceRecipeId', 'phase4-live-recipe', 'name', 'Phase 4 Live Matcha',
      'size', '12 oz', 'sellingPriceCentavos', 17000,
      'ingredientCostCentavos', 6000, 'packagingCostCentavos', 1500,
      'fixture', 'phase4-live-access'
    ),
    '12 oz', 'Live Test', null
  )
)
update phase4_live_context
set product_id = publication.product_id, version_id = publication.version_id
from publication;

with opened as (
  select * from public.pos_open_shift(
    (select business_id from phase4_live_context), false, 0
  )
)
update phase4_live_context set live_shift_id = opened.shift_id from opened;

-- Cashier completes and closes a real cash sale; cost remains masked.
select set_config('request.jwt.claim.sub', (select cashier_id::text from phase4_live_context), true);
do $$
declare v_sale record; v_close record;
begin
  select * into strict v_sale from public.pos_complete_shift_sale(
    (select business_id from phase4_live_context),
    (select live_shift_id from phase4_live_context), false,
    '42000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from phase4_live_context),
      'product_version_id', (select version_id from phase4_live_context),
      'quantity', 2
    )), 'cash', 40000, null, 'live check'
  );
  if v_sale.total_centavos <> 34000 or v_sale.change_given_centavos <> 6000 then
    raise exception 'Live Phase 4 checkout totals are incorrect.';
  end if;

  select * into strict v_close from public.pos_close_shift(
    (select business_id from phase4_live_context),
    (select live_shift_id from phase4_live_context),
    34000, 0, 0, 'Live check close'
  );
  if v_close.expected_cash_centavos <> 34000
    or v_close.cash_variance_centavos <> 0
    or v_close.estimated_cost_centavos is not null
    or v_close.can_view_costs then
    raise exception 'Live cashier close or cost masking is incorrect.';
  end if;
end;
$$;

-- Owner opens training; cashier can transact but cannot close it.
select set_config('request.jwt.claim.sub', (select owner_id::text from phase4_live_context), true);
with opened as (
  select * from public.pos_open_shift(
    (select business_id from phase4_live_context), true, 0
  )
)
update phase4_live_context set training_shift_id = opened.shift_id from opened;

select set_config('request.jwt.claim.sub', (select cashier_id::text from phase4_live_context), true);
do $$
begin
  perform public.pos_complete_shift_sale(
    (select business_id from phase4_live_context),
    (select training_shift_id from phase4_live_context), true,
    '42000000-0000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from phase4_live_context),
      'product_version_id', (select version_id from phase4_live_context),
      'quantity', 1
    )), 'gcash', null, 'TRAINING-GCASH', null
  );
  begin
    perform public.pos_close_shift(
      (select business_id from phase4_live_context),
      (select training_shift_id from phase4_live_context),
      null, null, null, null
    );
    raise exception 'Live cashier closed training mode.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', (select owner_id::text from phase4_live_context), true);
do $$
declare v_close record;
begin
  select * into strict v_close from public.pos_close_shift(
    (select business_id from phase4_live_context),
    (select training_shift_id from phase4_live_context),
    null, null, null, 'Auto reconcile'
  );
  if v_close.expected_gcash_centavos <> 17000
    or v_close.verified_gcash_centavos <> 17000
    or v_close.gcash_variance_centavos <> 0 then
    raise exception 'Live training auto-reconciliation is incorrect.';
  end if;
end;
$$;

-- An open live GoTyme sale is voided, then close must reconcile zero receipts.
with opened as (
  select * from public.pos_open_shift(
    (select business_id from phase4_live_context), false, 0
  )
)
update phase4_live_context set void_shift_id = opened.shift_id from opened;

select set_config('request.jwt.claim.sub', (select cashier_id::text from phase4_live_context), true);
with sale as (
  select * from public.pos_complete_shift_sale(
    (select business_id from phase4_live_context),
    (select void_shift_id from phase4_live_context), false,
    '42000000-0000-4000-8000-000000000003',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from phase4_live_context),
      'product_version_id', (select version_id from phase4_live_context),
      'quantity', 1
    )), 'gotyme', null, 'LIVE-GOTYME', null
  )
)
update phase4_live_context set void_sale_id = sale.sale_id from sale;

select set_config('request.jwt.claim.sub', (select owner_id::text from phase4_live_context), true);
do $$
declare v_close record; v_business_id uuid := (select business_id from phase4_live_context);
begin
  perform public.pos_void_sale(
    v_business_id, (select void_sale_id from phase4_live_context), 'Live check void'
  );
  select * into strict v_close from public.pos_close_shift(
    v_business_id, (select void_shift_id from phase4_live_context),
    0, 0, 0, null
  );
  if v_close.expected_gotyme_centavos <> 0
    or v_close.voided_sales_centavos <> 17000
    or v_close.net_sales_centavos <> 0 then
    raise exception 'Live void reconciliation is incorrect.';
  end if;

  if (select gross_sale_count from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 2
    or (select voided_sale_count from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 1
    or (select net_sales_centavos from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 34000
    or (select cash_net_centavos from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 34000
    or (select gotyme_net_centavos from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 0
    or (select estimated_cost_centavos from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 15000
    or (select estimated_gross_profit_centavos from public.pos_get_end_of_day_summary(v_business_id, null, false)) <> 19000
    or (select net_sales_centavos from public.pos_get_end_of_day_summary(v_business_id, null, true)) <> 17000 then
    raise exception 'Live Phase 4 day reports are incorrect or modes mixed.';
  end if;
end;
$$;

-- Cashier cost masking, outsider denial, anonymous denial, and costing checksum.
select set_config('request.jwt.claim.sub', (select cashier_id::text from phase4_live_context), true);
do $$
begin
  if (select estimated_cost_centavos from public.pos_get_end_of_day_summary(
      (select business_id from phase4_live_context), null, false
    )) is not null
    or exists (
      select 1 from public.pos_get_recent_sales_v2(
        (select business_id from phase4_live_context), false, 20
      ) where can_view_costs or estimated_cost_centavos is not null
    ) then
    raise exception 'Live cashier reporting leaked costs.';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', true);
set local role authenticated;
do $$
begin
  begin
    perform public.pos_get_shift_status((select business_id from phase4_live_context));
    raise exception 'Live outsider read shift status.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pos_open_shift((select business_id from phase4_live_context), false, 0);
    raise exception 'Live outsider opened a shift.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform public.pos_get_end_of_day_summary(
      (select business_id from phase4_live_context), null, false
    );
    raise exception 'Anonymous role executed Phase 4 reporting.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pos_get_today_summary(
      (select business_id from phase4_live_context)
    );
    raise exception 'Anonymous role executed legacy today reporting.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pos_get_recent_sales(
      (select business_id from phase4_live_context), 20
    );
    raise exception 'Anonymous role executed legacy recent reporting.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pos_close_shift(
      (select business_id from phase4_live_context), gen_random_uuid(),
      0, 0, 0, null
    );
    raise exception 'Anonymous role executed Phase 4 close.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
do $$
declare v_before record; v_after record;
begin
  select * into strict v_before from phase4_live_costing_before;
  select count(*)::bigint as row_count,
         md5(string_agg(id || ':' || data::text, '|' order by id)) as checksum,
         sum(pg_column_size(data))::bigint as data_bytes
    into v_after
  from public.scoopies_state;
  if v_after.row_count is distinct from v_before.row_count
    or v_after.checksum is distinct from v_before.checksum
    or v_after.data_bytes is distinct from v_before.data_bytes then
    raise exception 'Costing document changed during Phase 4 live checks.';
  end if;
end;
$$;

select 'PASS: POS Phase 4 live access checks' as result;

rollback;
