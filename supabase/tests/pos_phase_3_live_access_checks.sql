-- Live Supabase Phase 3 role/RPC smoke test.
--
-- Run through a project-owner SQL connection after the Phase 3 migration.
-- It needs two existing Auth accounts. All fixtures, sales, and role changes
-- are isolated in this transaction and rolled back after a successful run.

begin;

do $$
begin
  if (select count(*) from auth.users) < 2 then
    raise exception 'This check needs at least two existing auth accounts.';
  end if;

  if to_regclass('public.scoopies_state') is null
    or not exists (select 1 from public.scoopies_state where id = 'main') then
    raise exception 'The main costing row is required for the checksum invariant.';
  end if;
end;
$$;

create temporary table phase3_live_context (
  owner_id uuid not null,
  cashier_id uuid not null,
  business_id uuid not null,
  product_id uuid,
  version_id uuid
) on commit drop;

create temporary table phase3_live_costing_before as
select
  count(*)::bigint as row_count,
  md5(string_agg(id || ':' || data::text, '|' order by id)) as checksum,
  sum(pg_column_size(data))::bigint as data_bytes
from public.scoopies_state;

with selected_accounts as (
  select id, row_number() over (
    order by last_sign_in_at desc nulls last, created_at, id
  ) as account_number
  from auth.users
), fixture_business as (
  insert into public.pos_businesses (
    name, timezone, currency_code, receipt_prefix, created_by
  )
  select 'Scoopies Phase 3 Live Test', 'Asia/Manila', 'PHP', 'T3S', owner.id
  from selected_accounts as owner
  where owner.account_number = 1
  returning id, created_by
)
insert into phase3_live_context (owner_id, cashier_id, business_id)
select fixture_business.created_by, cashier.id, fixture_business.id
from fixture_business
join selected_accounts as cashier on cashier.account_number = 2;

insert into public.pos_business_members (
  business_id, user_id, role, display_name
)
select business_id, owner_id, 'owner', 'Phase 3 Test Owner'
from phase3_live_context
union all
select business_id, cashier_id, 'cashier', 'Phase 3 Test Cashier'
from phase3_live_context;

insert into public.pos_registers (business_id, name, created_by)
select business_id, 'Phase 3 Test Register', owner_id
from phase3_live_context;

grant select, update on table phase3_live_context to authenticated;
grant select on table phase3_live_context to anon;

select set_config(
  'request.jwt.claim.sub',
  (select owner_id::text from phase3_live_context),
  true
);
set local role authenticated;

with publication as (
  select *
  from public.pos_publish_costing_product(
    (select business_id from phase3_live_context),
    'phase3-live-matcha-product',
    'phase3-live-matcha-recipe',
    'Phase 3 Live Matcha',
    17000,
    6200,
    1500,
    jsonb_build_object(
      'schemaVersion', 1,
      'sourceProductId', 'phase3-live-matcha-product',
      'sourceRecipeId', 'phase3-live-matcha-recipe',
      'name', 'Phase 3 Live Matcha',
      'size', '12 oz',
      'sellingPriceCentavos', 17000,
      'ingredientCostCentavos', 6200,
      'packagingCostCentavos', 1500,
      'fixture', 'phase3-live-access'
    ),
    '12 oz',
    'Live Test',
    null
  )
)
update phase3_live_context
set product_id = publication.product_id,
    version_id = publication.version_id
from publication;

do $$
declare
  v_checkout record;
begin
  select * into strict v_checkout
  from public.pos_complete_sale(
    (select business_id from phase3_live_context),
    '32000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from phase3_live_context),
      'product_version_id', (select version_id from phase3_live_context),
      'quantity', 2
    )),
    'cash', 40000, null, 'live access owner sale'
  );

  if v_checkout.total_centavos <> 34000
    or v_checkout.change_given_centavos <> 6000
    or v_checkout.is_retry then
    raise exception 'Live owner cash checkout returned incorrect totals.';
  end if;

  if not (select can_view_costs from public.pos_get_today_summary(
      (select business_id from phase3_live_context)
    )) then
    raise exception 'Live owner summary did not expose cost permission.';
  end if;
end;
$$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  (select cashier_id::text from phase3_live_context),
  true
);
set local role authenticated;

do $$
declare
  v_checkout record;
  v_business_id uuid := (select business_id from phase3_live_context);
begin
  select * into strict v_checkout
  from public.pos_complete_sale(
    v_business_id,
    '32000000-0000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from phase3_live_context),
      'product_version_id', (select version_id from phase3_live_context),
      'quantity', 1
    )),
    'gcash', null, 'LIVE-GCASH-1', null
  );

  if v_checkout.total_centavos <> 17000
    or v_checkout.payment_method <> 'gcash' then
    raise exception 'Live cashier GCash checkout returned incorrect totals.';
  end if;

  if (select sale_count from public.pos_get_today_summary(v_business_id)) <> 2
    or (select total_sales_centavos from public.pos_get_today_summary(v_business_id)) <> 51000
    or (select cash_sales_centavos from public.pos_get_today_summary(v_business_id)) <> 34000
    or (select gcash_sales_centavos from public.pos_get_today_summary(v_business_id)) <> 17000 then
    raise exception 'Live cashier summary totals are incorrect.';
  end if;

  if (select can_view_costs from public.pos_get_today_summary(v_business_id))
    or (select estimated_cost_centavos from public.pos_get_today_summary(v_business_id)) is not null
    or exists (
      select 1 from public.pos_get_recent_sales(v_business_id, 20) as recent
      where recent.can_view_costs
        or recent.estimated_cost_centavos is not null
        or recent.estimated_gross_profit_centavos is not null
    ) then
    raise exception 'Live cashier reporting leaked cost or profit.';
  end if;

  if (select count(*) from public.pos_get_recent_sales(v_business_id, 20)) <> 2
    or exists (
      select 1 from public.pos_get_recent_sales(v_business_id, 20) as recent
      where recent.item_summary is null or recent.item_summary = ''
    ) then
    raise exception 'Live recent-sales summaries are missing.';
  end if;

  begin
    insert into public.pos_payments (
      business_id, sale_id, method, amount_centavos, confirmed_by
    ) values (
      v_business_id, gen_random_uuid(), 'gcash', 1,
      (select cashier_id from phase3_live_context)
    );
    raise exception 'Cashier directly wrote a payment row.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  (select owner_id::text from phase3_live_context),
  true
);
set local role authenticated;

do $$
declare
  v_business_id uuid := (select business_id from phase3_live_context);
begin
  if (select estimated_cost_centavos from public.pos_get_today_summary(v_business_id)) <> 23100
    or (select estimated_gross_profit_centavos from public.pos_get_today_summary(v_business_id)) <> 27900 then
    raise exception 'Live owner cost/profit totals are incorrect.';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', true);
set local role authenticated;

do $$
begin
  begin
    perform public.pos_get_today_summary((select business_id from phase3_live_context));
    raise exception 'Authenticated outsider read live sales reporting.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pos_complete_sale(
      (select business_id from phase3_live_context),
      '32000000-0000-4000-8000-000000000003',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from phase3_live_context),
        'product_version_id', (select version_id from phase3_live_context),
        'quantity', 1
      )),
      'cash', 20000, null, null
    );
    raise exception 'Authenticated outsider completed a live sale.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;

do $$
begin
  begin
    perform public.pos_get_today_summary((select business_id from phase3_live_context));
    raise exception 'Anonymous role executed the summary RPC.';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.pos_complete_sale(
      (select business_id from phase3_live_context),
      '32000000-0000-4000-8000-000000000004',
      '[]'::jsonb, 'cash', 1, null, null
    );
    raise exception 'Anonymous role executed the checkout RPC.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
declare
  v_before record;
  v_after record;
begin
  select * into strict v_before from phase3_live_costing_before;

  select
    count(*)::bigint as row_count,
    md5(string_agg(id || ':' || data::text, '|' order by id)) as checksum,
    sum(pg_column_size(data))::bigint as data_bytes
    into v_after
  from public.scoopies_state;

  if v_after.row_count is distinct from v_before.row_count
    or v_after.checksum is distinct from v_before.checksum
    or v_after.data_bytes is distinct from v_before.data_bytes then
    raise exception 'The costing document changed during Phase 3 live checks.';
  end if;
end;
$$;

select 'PASS: POS Phase 3 live access checks' as result;

rollback;
