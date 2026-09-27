-- Destructive cross-connection Phase 3 concurrency check.
--
-- Run ONLY in a disposable database whose name starts with
-- `phase3_concurrency`. Unlike the transaction-scoped behavior suite, this
-- commits fixture rows so separate dblink sessions can race against them.
-- Drop the disposable database after the test.

do $$
begin
  if current_database() !~ '^phase3_concurrency' then
    raise exception 'Refusing concurrency fixtures outside a phase3_concurrency* database.';
  end if;
end;
$$;

create extension if not exists dblink;

insert into auth.users (id, email)
values ('34000000-0000-4000-8000-000000000001', 'phase3-concurrency@example.test');

set role authenticated;
set request.jwt.claim.sub = '34000000-0000-4000-8000-000000000001';

do $$
declare
  v_business_id uuid;
begin
  v_business_id := public.pos_bootstrap_business(
    'Scoopies Phase 3 Concurrency Test', 'T3C', 'Asia/Manila'
  );

  perform public.pos_publish_costing_product(
    v_business_id,
    'phase3-concurrency-product',
    'phase3-concurrency-recipe',
    'Concurrency Matcha',
    17000,
    6000,
    1500,
    jsonb_build_object(
      'schemaVersion', 1,
      'sourceProductId', 'phase3-concurrency-product',
      'sourceRecipeId', 'phase3-concurrency-recipe',
      'name', 'Concurrency Matcha',
      'size', '12 oz',
      'sellingPriceCentavos', 17000,
      'ingredientCostCentavos', 6000,
      'packagingCostCentavos', 1500
    ),
    '12 oz', 'Test', null
  );
end;
$$;

reset role;

select dblink_connect(
  'phase3_worker_a',
  'host=127.0.0.1 port=' || current_setting('port')
    || ' dbname=' || current_database() || ' user=postgres'
);
select dblink_connect(
  'phase3_worker_b',
  'host=127.0.0.1 port=' || current_setting('port')
    || ' dbname=' || current_database() || ' user=postgres'
);

select dblink_exec('phase3_worker_a', 'set role authenticated');
select dblink_exec(
  'phase3_worker_a',
  'set request.jwt.claim.sub = ''34000000-0000-4000-8000-000000000001'''
);
select dblink_exec('phase3_worker_b', 'set role authenticated');
select dblink_exec(
  'phase3_worker_b',
  'set request.jwt.claim.sub = ''34000000-0000-4000-8000-000000000001'''
);

create temporary table phase3_concurrency_results (
  worker text primary key,
  payload jsonb not null
);

-- Both workers race the same client ID and request. One creates the sale; the
-- other waits on the advisory lock and returns that exact completed sale.
select dblink_send_query('phase3_worker_a', $query$
  with workspace as (
    select business_id from public.pos_get_my_businesses() limit 1
  ), catalog as (
    select catalog.*
    from workspace
    cross join lateral public.pos_get_catalog(workspace.business_id) as catalog
    limit 1
  )
  select row_to_json(result)::text
  from workspace, catalog
  cross join lateral public.pos_complete_sale(
    workspace.business_id,
    '34000000-0000-4000-8000-000000000101',
    jsonb_build_array(jsonb_build_object(
      'product_id', catalog.product_id,
      'product_version_id', catalog.active_version_id,
      'quantity', 1
    )),
    'cash', 20000, null, null
  ) as result
$query$);
select dblink_send_query('phase3_worker_b', $query$
  with workspace as (
    select business_id from public.pos_get_my_businesses() limit 1
  ), catalog as (
    select catalog.*
    from workspace
    cross join lateral public.pos_get_catalog(workspace.business_id) as catalog
    limit 1
  )
  select row_to_json(result)::text
  from workspace, catalog
  cross join lateral public.pos_complete_sale(
    workspace.business_id,
    '34000000-0000-4000-8000-000000000101',
    jsonb_build_array(jsonb_build_object(
      'product_id', catalog.product_id,
      'product_version_id', catalog.active_version_id,
      'quantity', 1
    )),
    'cash', 20000, null, null
  ) as result
$query$);

insert into phase3_concurrency_results
select 'same-a', response.payload::jsonb
from dblink_get_result('phase3_worker_a') as response(payload text);
insert into phase3_concurrency_results
select 'same-b', response.payload::jsonb
from dblink_get_result('phase3_worker_b') as response(payload text);

-- libpq can retain an empty trailing result after an asynchronous query; drain
-- it before reusing each connection.
select count(*)
from dblink_get_result('phase3_worker_a') as response(payload text);
select count(*)
from dblink_get_result('phase3_worker_b') as response(payload text);

do $$
begin
  if (select count(*) from phase3_concurrency_results) <> 2
    or (select count(distinct payload ->> 'sale_id') from phase3_concurrency_results) <> 1
    or (select count(distinct payload ->> 'receipt_number') from phase3_concurrency_results) <> 1
    or (select count(*) from phase3_concurrency_results
        where (payload ->> 'is_retry')::boolean) <> 1 then
    raise exception 'Concurrent exact retry did not converge on one sale and receipt.';
  end if;
end;
$$;

-- Different client IDs race next. They must become two additional sales with
-- different receipt numbers and no counter collision.
select dblink_send_query('phase3_worker_a', $query$
  with workspace as (
    select business_id from public.pos_get_my_businesses() limit 1
  ), catalog as (
    select catalog.*
    from workspace
    cross join lateral public.pos_get_catalog(workspace.business_id) as catalog
    limit 1
  )
  select row_to_json(result)::text
  from workspace, catalog
  cross join lateral public.pos_complete_sale(
    workspace.business_id,
    '34000000-0000-4000-8000-000000000102',
    jsonb_build_array(jsonb_build_object(
      'product_id', catalog.product_id,
      'product_version_id', catalog.active_version_id,
      'quantity', 1
    )),
    'cash', 20000, null, null
  ) as result
$query$);
select dblink_send_query('phase3_worker_b', $query$
  with workspace as (
    select business_id from public.pos_get_my_businesses() limit 1
  ), catalog as (
    select catalog.*
    from workspace
    cross join lateral public.pos_get_catalog(workspace.business_id) as catalog
    limit 1
  )
  select row_to_json(result)::text
  from workspace, catalog
  cross join lateral public.pos_complete_sale(
    workspace.business_id,
    '34000000-0000-4000-8000-000000000103',
    jsonb_build_array(jsonb_build_object(
      'product_id', catalog.product_id,
      'product_version_id', catalog.active_version_id,
      'quantity', 1
    )),
    'cash', 20000, null, null
  ) as result
$query$);

insert into phase3_concurrency_results
select 'different-a', response.payload::jsonb
from dblink_get_result('phase3_worker_a') as response(payload text);
insert into phase3_concurrency_results
select 'different-b', response.payload::jsonb
from dblink_get_result('phase3_worker_b') as response(payload text);

select count(*)
from dblink_get_result('phase3_worker_a') as response(payload text);
select count(*)
from dblink_get_result('phase3_worker_b') as response(payload text);

do $$
declare
  v_business_id uuid := (
    select business_id
    from public.pos_business_members
    where user_id = '34000000-0000-4000-8000-000000000001'
  );
begin
  if (select count(*) from public.pos_sales where business_id = v_business_id) <> 3
    or (select count(distinct receipt_number) from public.pos_sales
        where business_id = v_business_id) <> 3
    or (select max(receipt_sequence) from public.pos_sales
        where business_id = v_business_id) <> 3
    or (select last_number from public.pos_receipt_counters
        where business_id = v_business_id and is_training = false) <> 3 then
    raise exception 'Concurrent different checkouts collided or skipped a receipt.';
  end if;
end;
$$;

select dblink_disconnect('phase3_worker_a');
select dblink_disconnect('phase3_worker_b');

select 'PASS: POS Phase 3 concurrency checks' as result;
