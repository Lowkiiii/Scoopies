-- Destructive, cross-connection Phase 4 lock-order checks.
-- Run only in a disposable database named phase4_concurrency* and drop it.

do $$
begin
  if current_database() !~ '^phase4_concurrency' then
    raise exception 'Refusing concurrency fixtures outside a phase4_concurrency* database.';
  end if;
end;
$$;

create extension if not exists dblink;
insert into auth.users (id, email)
values ('44000000-0000-4000-8000-000000000001', 'phase4-concurrency@example.test');

create table phase4_concurrency_context (
  singleton boolean primary key default true check (singleton),
  business_id uuid not null,
  product_id uuid,
  version_id uuid
);
grant select, insert, update on public.phase4_concurrency_context to authenticated;

set role authenticated;
set request.jwt.claim.sub = '44000000-0000-4000-8000-000000000001';
insert into phase4_concurrency_context (business_id)
select public.pos_bootstrap_business('Phase 4 Concurrency', 'T4C', 'Asia/Manila');

with publication as (
  select * from public.pos_publish_costing_product(
    (select business_id from phase4_concurrency_context),
    'phase4-concurrency-product', 'phase4-concurrency-recipe',
    'Concurrency Matcha', 17000, 6000, 1500,
    jsonb_build_object(
      'schemaVersion', 1, 'sourceProductId', 'phase4-concurrency-product',
      'sourceRecipeId', 'phase4-concurrency-recipe', 'name', 'Concurrency Matcha',
      'size', '12 oz', 'sellingPriceCentavos', 17000,
      'ingredientCostCentavos', 6000, 'packagingCostCentavos', 1500
    ),
    '12 oz', 'Test', null
  )
)
update phase4_concurrency_context
set product_id = publication.product_id, version_id = publication.version_id
from publication;
reset role;

-- Helpers catch the expected losing-side error so asynchronous dblink results
-- stay inspectable instead of aborting the harness.
create function public.phase4_test_checkout(p_shift_id uuid, p_client_id uuid)
returns text language plpgsql set search_path = '' as $$
declare v_result record;
begin
  select * into strict v_result from public.pos_complete_shift_sale(
    (select business_id from public.phase4_concurrency_context where singleton),
    p_shift_id, false, p_client_id,
    jsonb_build_array(jsonb_build_object(
      'product_id', (select product_id from public.phase4_concurrency_context where singleton),
      'product_version_id', (select version_id from public.phase4_concurrency_context where singleton),
      'quantity', 1
    )),
    'cash', 20000, null, null
  );
  return v_result.sale_id::text;
exception when object_not_in_prerequisite_state then
  return 'REJECTED:' || sqlstate;
end;
$$;

create function public.phase4_test_close(p_shift_id uuid, p_counted bigint)
returns text language plpgsql set search_path = '' as $$
declare v_result record;
begin
  select * into strict v_result from public.pos_close_shift(
    (select business_id from public.phase4_concurrency_context where singleton),
    p_shift_id, p_counted, 0, 0, null
  );
  return jsonb_build_object(
    'shift_id', v_result.shift_id,
    'expected_cash', v_result.expected_cash_centavos,
    'gross_sales', v_result.gross_sales_centavos,
    'voided_sales', v_result.voided_sales_centavos,
    'net_sales', v_result.net_sales_centavos
  )::text;
exception when object_not_in_prerequisite_state then
  return 'REJECTED:' || sqlstate;
end;
$$;

create function public.phase4_test_void(p_sale_id uuid)
returns text language plpgsql set search_path = '' as $$
declare v_result record;
begin
  select * into strict v_result from public.pos_void_sale(
    (select business_id from public.phase4_concurrency_context where singleton),
    p_sale_id, 'Concurrency correction'
  );
  return v_result.event_id::text;
exception when object_not_in_prerequisite_state then
  return 'REJECTED:' || sqlstate;
end;
$$;

grant execute on function public.phase4_test_checkout(uuid, uuid) to authenticated;
grant execute on function public.phase4_test_close(uuid, bigint) to authenticated;
grant execute on function public.phase4_test_void(uuid) to authenticated;

select dblink_connect(
  'phase4_worker_a',
  'host=127.0.0.1 port=' || current_setting('port')
    || ' dbname=' || current_database() || ' user=postgres'
);
select dblink_connect(
  'phase4_worker_b',
  'host=127.0.0.1 port=' || current_setting('port')
    || ' dbname=' || current_database() || ' user=postgres'
);
select dblink_exec('phase4_worker_a', 'set role authenticated');
select dblink_exec('phase4_worker_a',
  'set request.jwt.claim.sub = ''44000000-0000-4000-8000-000000000001''');
select dblink_exec('phase4_worker_b', 'set role authenticated');
select dblink_exec('phase4_worker_b',
  'set request.jwt.claim.sub = ''44000000-0000-4000-8000-000000000001''');

create temporary table phase4_concurrency_results (
  label text primary key,
  payload text not null
);

-- Race 1: checkout owns the shift lock first; close waits and must include it.
set role authenticated;
set request.jwt.claim.sub = '44000000-0000-4000-8000-000000000001';
create temporary table race1_shift as
select * from public.pos_open_shift(
  (select business_id from phase4_concurrency_context), false, 0
);
reset role;

select dblink_exec('phase4_worker_a', 'begin');
select dblink_exec('phase4_worker_a', format(
  'do $lock$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0)); end $lock$',
  'pos-shift:' || (select business_id::text from phase4_concurrency_context)
));
select dblink_send_query('phase4_worker_b', format(
  'select public.phase4_test_close(%L::uuid, 17000)',
  (select shift_id from race1_shift)
));
select dblink_send_query('phase4_worker_a', format(
  'select public.phase4_test_checkout(%L::uuid, %L::uuid)',
  (select shift_id from race1_shift), '44000000-0000-4000-8000-000000000101'
));
insert into phase4_concurrency_results
select 'checkout-wins-checkout', response.payload
from dblink_get_result('phase4_worker_a') as response(payload text);
select count(*) from dblink_get_result('phase4_worker_a') as response(payload text);
select dblink_exec('phase4_worker_a', 'commit');
insert into phase4_concurrency_results
select 'checkout-wins-close', response.payload
from dblink_get_result('phase4_worker_b') as response(payload text);
select count(*) from dblink_get_result('phase4_worker_b') as response(payload text);

do $$
begin
  if (select payload from phase4_concurrency_results where label = 'checkout-wins-checkout') like 'REJECTED:%'
    or ((select payload from phase4_concurrency_results where label = 'checkout-wins-close')::jsonb ->> 'expected_cash')::bigint <> 17000
    or ((select payload from phase4_concurrency_results where label = 'checkout-wins-close')::jsonb ->> 'net_sales')::bigint <> 17000 then
    raise exception 'Checkout-wins race closed with stale totals.';
  end if;
end;
$$;

-- Race 2: close owns the lock first; blocked checkout must reject after commit.
set role authenticated;
set request.jwt.claim.sub = '44000000-0000-4000-8000-000000000001';
create temporary table race2_shift as
select * from public.pos_open_shift(
  (select business_id from phase4_concurrency_context), false, 0
);
reset role;

select dblink_exec('phase4_worker_a', 'begin');
select dblink_exec('phase4_worker_a', format(
  'do $lock$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0)); end $lock$',
  'pos-shift:' || (select business_id::text from phase4_concurrency_context)
));
select dblink_send_query('phase4_worker_b', format(
  'select public.phase4_test_checkout(%L::uuid, %L::uuid)',
  (select shift_id from race2_shift), '44000000-0000-4000-8000-000000000102'
));
select dblink_send_query('phase4_worker_a', format(
  'select public.phase4_test_close(%L::uuid, 0)', (select shift_id from race2_shift)
));
insert into phase4_concurrency_results
select 'close-wins-close', response.payload
from dblink_get_result('phase4_worker_a') as response(payload text);
select count(*) from dblink_get_result('phase4_worker_a') as response(payload text);
select dblink_exec('phase4_worker_a', 'commit');
insert into phase4_concurrency_results
select 'close-wins-checkout', response.payload
from dblink_get_result('phase4_worker_b') as response(payload text);
select count(*) from dblink_get_result('phase4_worker_b') as response(payload text);

do $$
begin
  if (select payload from phase4_concurrency_results where label = 'close-wins-checkout') <> 'REJECTED:55000'
    or ((select payload from phase4_concurrency_results where label = 'close-wins-close')::jsonb ->> 'net_sales')::bigint <> 0 then
    raise exception 'Close-wins race admitted a late checkout.';
  end if;
end;
$$;

-- Race 3: void owns the lock first; close waits and must reconcile net zero.
set role authenticated;
set request.jwt.claim.sub = '44000000-0000-4000-8000-000000000001';
create temporary table race3_shift as
select * from public.pos_open_shift(
  (select business_id from phase4_concurrency_context), false, 0
);
create temporary table race3_sale as
select * from public.pos_complete_shift_sale(
  (select business_id from phase4_concurrency_context),
  (select shift_id from race3_shift), false,
  '44000000-0000-4000-8000-000000000103',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_id from phase4_concurrency_context),
    'product_version_id', (select version_id from phase4_concurrency_context),
    'quantity', 1
  )), 'cash', 20000, null, null
);
reset role;

select dblink_exec('phase4_worker_a', 'begin');
select dblink_exec('phase4_worker_a', format(
  'do $lock$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0)); end $lock$',
  'pos-shift:' || (select business_id::text from phase4_concurrency_context)
));
select dblink_send_query('phase4_worker_b', format(
  'select public.phase4_test_close(%L::uuid, 0)', (select shift_id from race3_shift)
));
select dblink_send_query('phase4_worker_a', format(
  'select public.phase4_test_void(%L::uuid)', (select sale_id from race3_sale)
));
insert into phase4_concurrency_results
select 'void-wins-void', response.payload
from dblink_get_result('phase4_worker_a') as response(payload text);
select count(*) from dblink_get_result('phase4_worker_a') as response(payload text);
select dblink_exec('phase4_worker_a', 'commit');
insert into phase4_concurrency_results
select 'void-wins-close', response.payload
from dblink_get_result('phase4_worker_b') as response(payload text);
select count(*) from dblink_get_result('phase4_worker_b') as response(payload text);

do $$
begin
  if (select payload from phase4_concurrency_results where label = 'void-wins-void') like 'REJECTED:%'
    or ((select payload from phase4_concurrency_results where label = 'void-wins-close')::jsonb ->> 'gross_sales')::bigint <> 17000
    or ((select payload from phase4_concurrency_results where label = 'void-wins-close')::jsonb ->> 'voided_sales')::bigint <> 17000
    or ((select payload from phase4_concurrency_results where label = 'void-wins-close')::jsonb ->> 'net_sales')::bigint <> 0 then
    raise exception 'Void-wins race closed with stale reversal totals.';
  end if;
end;
$$;

-- Race 4: close owns the lock first; blocked void must reject after commit.
set role authenticated;
set request.jwt.claim.sub = '44000000-0000-4000-8000-000000000001';
create temporary table race4_shift as
select * from public.pos_open_shift(
  (select business_id from phase4_concurrency_context), false, 0
);
create temporary table race4_sale as
select * from public.pos_complete_shift_sale(
  (select business_id from phase4_concurrency_context),
  (select shift_id from race4_shift), false,
  '44000000-0000-4000-8000-000000000104',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select product_id from phase4_concurrency_context),
    'product_version_id', (select version_id from phase4_concurrency_context),
    'quantity', 1
  )), 'cash', 20000, null, null
);
reset role;

select dblink_exec('phase4_worker_a', 'begin');
select dblink_exec('phase4_worker_a', format(
  'do $lock$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0)); end $lock$',
  'pos-shift:' || (select business_id::text from phase4_concurrency_context)
));
select dblink_send_query('phase4_worker_b', format(
  'select public.phase4_test_void(%L::uuid)', (select sale_id from race4_sale)
));
select dblink_send_query('phase4_worker_a', format(
  'select public.phase4_test_close(%L::uuid, 17000)', (select shift_id from race4_shift)
));
insert into phase4_concurrency_results
select 'close-wins-void-close', response.payload
from dblink_get_result('phase4_worker_a') as response(payload text);
select count(*) from dblink_get_result('phase4_worker_a') as response(payload text);
select dblink_exec('phase4_worker_a', 'commit');
insert into phase4_concurrency_results
select 'close-wins-void', response.payload
from dblink_get_result('phase4_worker_b') as response(payload text);
select count(*) from dblink_get_result('phase4_worker_b') as response(payload text);

do $$
begin
  if (select payload from phase4_concurrency_results where label = 'close-wins-void') <> 'REJECTED:55000'
    or ((select payload from phase4_concurrency_results where label = 'close-wins-void-close')::jsonb ->> 'net_sales')::bigint <> 17000 then
    raise exception 'Close-wins race admitted a late void.';
  end if;
end;
$$;

do $$
declare v_business_id uuid := (select business_id from phase4_concurrency_context);
begin
  if (select count(*) from public.pos_sales where business_id = v_business_id) <> 3
    or (select count(*) from public.pos_sale_events
        where business_id = v_business_id and event_type = 'void_before_preparation') <> 1
    or exists (
      select 1 from public.pos_shifts
      where business_id = v_business_id and status = 'open'
    ) then
    raise exception 'Concurrency races left duplicate sales, voids, or an open shift.';
  end if;
end;
$$;

select dblink_disconnect('phase4_worker_a');
select dblink_disconnect('phase4_worker_b');

select 'PASS: POS Phase 4 concurrency checks' as result;
