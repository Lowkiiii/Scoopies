-- Destructive, true two-connection Inventory Phase 1 race checks.
-- Run only in a disposable database named inventory_concurrency* and drop it.

do $$
begin
  if current_database() !~ '^inventory_concurrency' then
    raise exception 'Refusing inventory concurrency fixtures outside an inventory_concurrency* database.';
  end if;
end;
$$;

create extension if not exists dblink;

insert into auth.users (id, email) values
  (
    '57000000-0000-4000-8000-000000000001',
    'inventory-concurrency@example.test'
  ),
  (
    '57000000-0000-4000-8000-000000000002',
    'inventory-concurrency-other@example.test'
  );

create table public.inventory_concurrency_context (
  singleton boolean primary key default true check (singleton),
  business_id uuid not null,
  other_business_id uuid,
  inventory_item_id uuid
);
grant select, insert, update on public.inventory_concurrency_context to authenticated;

set role authenticated;
set request.jwt.claim.sub = '57000000-0000-4000-8000-000000000001';

insert into public.inventory_concurrency_context (business_id)
select public.pos_bootstrap_business(
  'Inventory Concurrency', 'I5C', 'Asia/Manila'
);

set request.jwt.claim.sub = '57000000-0000-4000-8000-000000000002';
update public.inventory_concurrency_context
set other_business_id = public.pos_bootstrap_business(
  'Other Inventory Concurrency', 'I5O', 'Asia/Manila'
);
set request.jwt.claim.sub = '57000000-0000-4000-8000-000000000001';

-- Synchronization is authoritative-only: save the source in the shared cloud
-- costing document before creating its inventory binding.
update public.scoopies_state as costing
set data = jsonb_set(
  costing.data,
  '{ingredients}',
  coalesce(costing.data -> 'ingredients', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'id', 'inventory-concurrency-milk', 'kind', 'purchased',
      'name', 'Concurrency Milk', 'unit', 'ml'
    )),
  true
)
where costing.id = 'main'
  and not exists (
    select 1
    from jsonb_array_elements(
      coalesce(costing.data -> 'ingredients', '[]'::jsonb)
    ) as source(value)
    where source.value ->> 'id' = 'inventory-concurrency-milk'
  );

with synchronized as (
  select *
  from public.pos_inventory_sync_items(
    (select business_id from public.inventory_concurrency_context),
    jsonb_build_array(jsonb_build_object(
      'sourceCostingIngredientId', 'inventory-concurrency-milk',
      'kind', 'purchased', 'name', 'Concurrency Milk', 'baseUnit', 'ml'
    ))
  )
)
update public.inventory_concurrency_context
set inventory_item_id = synchronized.inventory_item_id
from synchronized;

-- Seed the required explicit opening count. The races below exercise only
-- post-initialization stock/configuration concurrency.
select *
from public.pos_inventory_record_transaction(
  (select business_id from public.inventory_concurrency_context),
  '57000000-0000-4000-8000-000000000200',
  'stock_count',
  jsonb_build_array(jsonb_build_object(
    'inventoryItemId',
      (select inventory_item_id from public.inventory_concurrency_context),
    'quantity', 0,
    'unit', 'ml',
    'expectedRevision', 1
  )),
  null,
  'Verified zero opening count'
);

reset role;

-- Helpers convert expected race errors into inspectable rows rather than
-- aborting the dblink harness.
create function public.inventory_test_record(
  p_client_transaction_id uuid,
  p_expected_revision bigint,
  p_quantity numeric
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_result record;
begin
  select * into strict v_result
  from public.pos_inventory_record_transaction(
    (select business_id from public.inventory_concurrency_context where singleton),
    p_client_transaction_id,
    'stock_in',
    jsonb_build_array(jsonb_build_object(
      'inventoryItemId',
        (select inventory_item_id from public.inventory_concurrency_context where singleton),
      'quantity', p_quantity,
      'unit', 'ml',
      'expectedRevision', p_expected_revision
    )),
    null,
    'Concurrency check'
  );
  return jsonb_build_object(
    'transaction_id', v_result.transaction_id,
    'is_retry', v_result.is_retry,
    'balance_after', v_result.balance_after_base,
    'revision', v_result.item_revision
  )::text;
exception
  when serialization_failure then return 'REJECTED:' || sqlstate;
  when unique_violation then return 'REJECTED:' || sqlstate;
  when no_data_found then return 'REJECTED:' || sqlstate;
  when object_not_in_prerequisite_state then return 'REJECTED:' || sqlstate;
end;
$$;

create function public.inventory_test_threshold(
  p_expected_revision bigint,
  p_threshold numeric
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_result record;
begin
  select * into strict v_result
  from public.pos_inventory_set_threshold(
    (select business_id from public.inventory_concurrency_context where singleton),
    (select inventory_item_id from public.inventory_concurrency_context where singleton),
    p_threshold,
    p_expected_revision
  );
  return jsonb_build_object(
    'is_retry', v_result.is_retry,
    'threshold', v_result.low_stock_threshold_base,
    'revision', v_result.revision
  )::text;
exception
  when serialization_failure then return 'REJECTED:' || sqlstate;
end;
$$;

create function public.inventory_test_sync()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_result record;
begin
  select * into strict v_result
  from public.pos_inventory_sync_items(
    (select business_id from public.inventory_concurrency_context where singleton),
    jsonb_build_array(jsonb_build_object(
      'sourceCostingIngredientId', 'inventory-concurrency-milk',
      'kind', 'purchased', 'name', 'Concurrency Milk', 'baseUnit', 'ml'
    ))
  );
  return jsonb_build_object(
    'inventory_item_id', v_result.inventory_item_id,
    'sync_result', v_result.sync_result,
    'active', v_result.active,
    'revision', v_result.revision
  )::text;
end;
$$;

create function public.inventory_test_prepare_delete(
  p_source_id text,
  p_kind text,
  p_name text,
  p_base_unit text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_item record;
begin
  perform public.pos_inventory_prepare_source_delete(
    (select business_id from public.inventory_concurrency_context where singleton),
    p_source_id, p_kind, p_name, p_base_unit
  );
  select item.inventory_item_id as id, item.active, item.revision
    into strict v_item
  from public.pos_inventory_get_items(
    (select business_id from public.inventory_concurrency_context where singleton),
    true
  ) as item
  where item.source_costing_ingredient_id = p_source_id;
  return jsonb_build_object(
    'inventory_item_id', v_item.id,
    'active', v_item.active,
    'revision', v_item.revision
  )::text;
exception
  when serialization_failure then return 'REJECTED:' || sqlstate;
  when no_data_found then return 'REJECTED:' || sqlstate;
  when object_not_in_prerequisite_state then return 'REJECTED:' || sqlstate;
end;
$$;

create function public.inventory_test_sync_source(
  p_source_id text,
  p_kind text,
  p_name text,
  p_base_unit text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_result record;
begin
  select * into strict v_result
  from public.pos_inventory_sync_items(
    (select business_id from public.inventory_concurrency_context where singleton),
    jsonb_build_array(jsonb_build_object(
      'sourceCostingIngredientId', p_source_id,
      'kind', p_kind, 'name', p_name, 'baseUnit', p_base_unit
    ))
  );
  return jsonb_build_object(
    'inventory_item_id', v_result.inventory_item_id,
    'source_id', v_result.source_costing_ingredient_id,
    'kind', v_result.item_kind,
    'name', v_result.item_name,
    'base_unit', v_result.base_unit,
    'active', v_result.active,
    'revision', v_result.revision,
    'sync_result', v_result.sync_result
  )::text;
exception
  when serialization_failure then return 'REJECTED:' || sqlstate;
  when no_data_found then return 'REJECTED:' || sqlstate;
  when object_not_in_prerequisite_state then return 'REJECTED:' || sqlstate;
end;
$$;

create function public.inventory_test_sync_for_business(
  p_business_id uuid,
  p_source_id text,
  p_kind text,
  p_name text,
  p_base_unit text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_result record;
begin
  select * into strict v_result
  from public.pos_inventory_sync_items(
    p_business_id,
    jsonb_build_array(jsonb_build_object(
      'sourceCostingIngredientId', p_source_id,
      'kind', p_kind, 'name', p_name, 'baseUnit', p_base_unit
    ))
  );
  return jsonb_build_object(
    'inventory_item_id', v_result.inventory_item_id,
    'source_id', v_result.source_costing_ingredient_id,
    'active', v_result.active,
    'revision', v_result.revision,
    'sync_result', v_result.sync_result
  )::text;
exception
  when serialization_failure then return 'REJECTED:' || sqlstate;
  when unique_violation then return 'REJECTED:' || sqlstate;
  when no_data_found then return 'REJECTED:' || sqlstate;
  when object_not_in_prerequisite_state then return 'REJECTED:' || sqlstate;
end;
$$;

create function public.inventory_test_prepare_source(
  p_source_id text,
  p_kind text,
  p_name text,
  p_base_unit text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_result record;
begin
  perform public.pos_inventory_prepare_source_change(
    (select business_id from public.inventory_concurrency_context where singleton),
    p_source_id, p_kind, p_name, p_base_unit
  );
  select * into strict v_result
  from public.pos_inventory_get_items(
    (select business_id from public.inventory_concurrency_context where singleton),
    true
  ) as item
  where item.source_costing_ingredient_id = p_source_id;
  return jsonb_build_object(
    'inventory_item_id', v_result.inventory_item_id,
    'source_id', v_result.source_costing_ingredient_id,
    'kind', v_result.item_kind,
    'name', v_result.name,
    'base_unit', v_result.base_unit,
    'active', v_result.active,
    'revision', v_result.revision
  )::text;
exception
  when serialization_failure then return 'REJECTED:' || sqlstate;
  when no_data_found then return 'REJECTED:' || sqlstate;
  when object_not_in_prerequisite_state then return 'REJECTED:' || sqlstate;
end;
$$;

create function public.inventory_test_prepare_for_business(
  p_business_id uuid,
  p_source_id text,
  p_kind text,
  p_name text,
  p_base_unit text
)
returns text
language plpgsql
set search_path = ''
as $$
begin
  perform public.pos_inventory_prepare_source_change(
    p_business_id, p_source_id, p_kind, p_name, p_base_unit
  );
  return 'PREPARED';
exception
  when serialization_failure then return 'REJECTED:' || sqlstate;
  when unique_violation then return 'REJECTED:' || sqlstate;
  when no_data_found then return 'REJECTED:' || sqlstate;
  when object_not_in_prerequisite_state then return 'REJECTED:' || sqlstate;
end;
$$;

create function public.inventory_test_delete_for_business(
  p_business_id uuid,
  p_source_id text,
  p_kind text,
  p_name text,
  p_base_unit text
)
returns text
language plpgsql
set search_path = ''
as $$
begin
  perform public.pos_inventory_prepare_source_delete(
    p_business_id, p_source_id, p_kind, p_name, p_base_unit
  );
  return 'DELETED';
exception
  when serialization_failure then return 'REJECTED:' || sqlstate;
  when unique_violation then return 'REJECTED:' || sqlstate;
  when no_data_found then return 'REJECTED:' || sqlstate;
  when object_not_in_prerequisite_state then return 'REJECTED:' || sqlstate;
end;
$$;

create function public.inventory_test_add_recipe_dependency(p_source_id text)
returns text
language plpgsql
set search_path = ''
as $$
begin
  update public.scoopies_state as costing
  set data = pg_catalog.jsonb_set(
    costing.data,
    '{recipes}',
    coalesce(costing.data -> 'recipes', '[]'::jsonb)
      || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'id', 'concurrent-reference-' || p_source_id,
        'name', 'Concurrent Reference',
        'lines', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'ingredientId', p_source_id, 'qty', 1, 'unit', 'g'
        ))
      )),
    true
  )
  where costing.id = 'main';
  return 'ADDED';
exception
  when object_not_in_prerequisite_state then return 'REJECTED:' || sqlstate;
end;
$$;

grant execute on function public.inventory_test_record(uuid, bigint, numeric)
  to authenticated;
grant execute on function public.inventory_test_threshold(bigint, numeric)
  to authenticated;
grant execute on function public.inventory_test_sync() to authenticated;
grant execute on function public.inventory_test_prepare_delete(text, text, text, text)
  to authenticated;
grant execute on function public.inventory_test_sync_source(text, text, text, text)
  to authenticated;
grant execute on function public.inventory_test_sync_for_business(uuid, text, text, text, text)
  to authenticated;
grant execute on function public.inventory_test_prepare_source(text, text, text, text)
  to authenticated;
grant execute on function public.inventory_test_prepare_for_business(uuid, text, text, text, text)
  to authenticated;
grant execute on function public.inventory_test_delete_for_business(uuid, text, text, text, text)
  to authenticated;
grant execute on function public.inventory_test_add_recipe_dependency(text)
  to authenticated;

select dblink_connect(
  'inventory_worker_a',
  'host=127.0.0.1 port=' || current_setting('port')
    || ' dbname=' || current_database() || ' user=postgres'
);
select dblink_connect(
  'inventory_worker_b',
  'host=127.0.0.1 port=' || current_setting('port')
    || ' dbname=' || current_database() || ' user=postgres'
);
select dblink_exec('inventory_worker_a', 'set role authenticated');
select dblink_exec(
  'inventory_worker_a',
  'set request.jwt.claim.sub = ''57000000-0000-4000-8000-000000000001'''
);
select dblink_exec('inventory_worker_b', 'set role authenticated');
select dblink_exec(
  'inventory_worker_b',
  'set request.jwt.claim.sub = ''57000000-0000-4000-8000-000000000001'''
);

create temporary table inventory_concurrency_results (
  label text primary key,
  payload text not null
);

-- Race 1: two different writes use revision 2. The lock winner commits and the
-- waiter must refresh; both cannot append from the same observed revision.
select dblink_exec('inventory_worker_a', 'begin');
select dblink_exec('inventory_worker_a', format(
  'do $lock$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0)); end $lock$',
  'pos-inventory:'
    || (select business_id::text from public.inventory_concurrency_context)
));
select dblink_send_query('inventory_worker_b', $query$
  select public.inventory_test_record(
    '57000000-0000-4000-8000-000000000201'::uuid, 2, 10
  )
$query$);
select dblink_send_query('inventory_worker_a', $query$
  select public.inventory_test_record(
    '57000000-0000-4000-8000-000000000202'::uuid, 2, 5
  )
$query$);
insert into inventory_concurrency_results
select 'different-winner', response.payload
from dblink_get_result('inventory_worker_a') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_a') as response(payload text);
select dblink_exec('inventory_worker_a', 'commit');
insert into inventory_concurrency_results
select 'different-waiter', response.payload
from dblink_get_result('inventory_worker_b') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_b') as response(payload text);

do $$
begin
  if (select payload from inventory_concurrency_results
      where label = 'different-winner') like 'REJECTED:%'
    or (select payload from inventory_concurrency_results
      where label = 'different-waiter') <> 'REJECTED:40001'
    or ((select payload from inventory_concurrency_results
      where label = 'different-winner')::jsonb ->> 'balance_after')::numeric <> 5
    or ((select payload from inventory_concurrency_results
      where label = 'different-winner')::jsonb ->> 'revision')::bigint <> 3 then
    raise exception 'Concurrent different inventory writes did not produce one winner and one stale rejection.';
  end if;
end;
$$;

-- Race 2: two copies of the exact same client request converge on one ledger
-- row. The waiter returns the original result as an idempotent retry even
-- though the item revision has advanced.
select dblink_exec('inventory_worker_a', 'begin');
select dblink_exec('inventory_worker_a', format(
  'do $lock$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0)); end $lock$',
  'pos-inventory:'
    || (select business_id::text from public.inventory_concurrency_context)
));
select dblink_send_query('inventory_worker_b', $query$
  select public.inventory_test_record(
    '57000000-0000-4000-8000-000000000203'::uuid, 3, 7
  )
$query$);
select dblink_send_query('inventory_worker_a', $query$
  select public.inventory_test_record(
    '57000000-0000-4000-8000-000000000203'::uuid, 3, 7
  )
$query$);
insert into inventory_concurrency_results
select 'retry-winner', response.payload
from dblink_get_result('inventory_worker_a') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_a') as response(payload text);
select dblink_exec('inventory_worker_a', 'commit');
insert into inventory_concurrency_results
select 'retry-waiter', response.payload
from dblink_get_result('inventory_worker_b') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_b') as response(payload text);

do $$
begin
  if ((select payload from inventory_concurrency_results
      where label = 'retry-winner')::jsonb ->> 'is_retry')::boolean
    or not ((select payload from inventory_concurrency_results
      where label = 'retry-waiter')::jsonb ->> 'is_retry')::boolean
    or (select payload from inventory_concurrency_results
      where label = 'retry-winner')::jsonb ->> 'transaction_id'
      is distinct from
      (select payload from inventory_concurrency_results
        where label = 'retry-waiter')::jsonb ->> 'transaction_id'
    or ((select payload from inventory_concurrency_results
      where label = 'retry-waiter')::jsonb ->> 'balance_after')::numeric <> 12 then
    raise exception 'Concurrent identical inventory retries did not converge on one transaction.';
  end if;
end;
$$;

-- Race 3: a threshold edit based on revision 4 waits behind a stock movement.
-- Once the movement advances the revision, the stale threshold edit rejects.
select dblink_exec('inventory_worker_a', 'begin');
select dblink_exec('inventory_worker_a', format(
  'do $lock$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0)); end $lock$',
  'pos-inventory:'
    || (select business_id::text from public.inventory_concurrency_context)
));
select dblink_send_query('inventory_worker_b', $query$
  select public.inventory_test_threshold(4, 10)
$query$);
select dblink_send_query('inventory_worker_a', $query$
  select public.inventory_test_record(
    '57000000-0000-4000-8000-000000000204'::uuid, 4, 1
  )
$query$);
insert into inventory_concurrency_results
select 'threshold-race-stock', response.payload
from dblink_get_result('inventory_worker_a') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_a') as response(payload text);
select dblink_exec('inventory_worker_a', 'commit');
insert into inventory_concurrency_results
select 'threshold-race-threshold', response.payload
from dblink_get_result('inventory_worker_b') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_b') as response(payload text);

do $$
declare
  v_business_id uuid :=
    (select business_id from public.inventory_concurrency_context);
  v_item_id uuid :=
    (select inventory_item_id from public.inventory_concurrency_context);
begin
  if (select payload from inventory_concurrency_results
      where label = 'threshold-race-stock') like 'REJECTED:%'
    or (select payload from inventory_concurrency_results
      where label = 'threshold-race-threshold') <> 'REJECTED:40001'
    or (select low_stock_threshold_base from public.pos_inventory_items
      where business_id = v_business_id and id = v_item_id) is not null
    or (select revision from public.pos_inventory_items
      where business_id = v_business_id and id = v_item_id) <> 5
    or (select coalesce(sum(quantity_delta_base), 0)
      from public.pos_inventory_transaction_lines
      where business_id = v_business_id and inventory_item_id = v_item_id) <> 13
    or (select count(*) from public.pos_inventory_transactions
      where business_id = v_business_id) <> 4
    or (select count(*) from public.pos_inventory_transaction_lines
      where business_id = v_business_id) <> 4 then
    raise exception 'Inventory races left stale configuration, duplicate rows, or an incorrect balance.';
  end if;
end;
$$;

-- Bring the item to a verified zero balance before racing a stale costing sync
-- against source deletion preparation.
set role authenticated;
set request.jwt.claim.sub = '57000000-0000-4000-8000-000000000001';
select *
from public.pos_inventory_record_transaction(
  (select business_id from public.inventory_concurrency_context),
  '57000000-0000-4000-8000-000000000205',
  'stock_count',
  jsonb_build_array(jsonb_build_object(
    'inventoryItemId',
      (select inventory_item_id from public.inventory_concurrency_context),
    'quantity', 0,
    'unit', 'ml',
    'expectedRevision', 5
  )),
  null,
  'Verified zero before source deletion'
);
reset role;

-- Race 4: a stock movement owns the business lock first. Atomic deletion must
-- wait, then reject without removing the now-nonzero cloud source.
select dblink_exec('inventory_worker_a', 'begin');
select dblink_exec('inventory_worker_a', format(
  'do $lock$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0)); end $lock$',
  'pos-inventory:'
    || (select business_id::text from public.inventory_concurrency_context)
));
select dblink_send_query(
  'inventory_worker_b',
  $$select public.inventory_test_prepare_delete(
    'inventory-concurrency-milk', 'purchased', 'Concurrency Milk', 'ml'
  )$$
);
select dblink_send_query(
  'inventory_worker_a',
  $$select public.inventory_test_record(
    '57000000-0000-4000-8000-000000000206'::uuid, 6, 1
  )$$
);
insert into inventory_concurrency_results
select 'movement-wins-stock', response.payload
from dblink_get_result('inventory_worker_a') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_a') as response(payload text);
select dblink_exec('inventory_worker_a', 'commit');
insert into inventory_concurrency_results
select 'movement-wins-delete', response.payload
from dblink_get_result('inventory_worker_b') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_b') as response(payload text);

do $$
declare
  v_business_id uuid :=
    (select business_id from public.inventory_concurrency_context);
  v_item_id uuid :=
    (select inventory_item_id from public.inventory_concurrency_context);
begin
  if (select payload from inventory_concurrency_results
      where label = 'movement-wins-stock') like 'REJECTED:%'
    or (select payload from inventory_concurrency_results
      where label = 'movement-wins-delete') <> 'REJECTED:55000'
    or not (select active from public.pos_inventory_items
      where business_id = v_business_id and id = v_item_id)
    or (select revision from public.pos_inventory_items
      where business_id = v_business_id and id = v_item_id) <> 7
    or (select coalesce(sum(quantity_delta_base), 0)
      from public.pos_inventory_transaction_lines
      where business_id = v_business_id and inventory_item_id = v_item_id) <> 1
    or (select count(*) from public.pos_inventory_transactions
      where business_id = v_business_id) <> 6
    or (select count(*) from public.pos_inventory_transaction_lines
      where business_id = v_business_id) <> 6
    or not exists (
      select 1
      from public.scoopies_state as costing,
        jsonb_array_elements(costing.data -> 'ingredients') as source(value)
      where costing.id = 'main'
        and source.value ->> 'id' = 'inventory-concurrency-milk'
    ) then
    raise exception 'Movement-wins delete race removed a nonzero source or corrupted its ledger.';
  end if;
end;
$$;

-- Return to a verified zero so the inverse lock winner can be tested.
set role authenticated;
set request.jwt.claim.sub = '57000000-0000-4000-8000-000000000001';
select *
from public.pos_inventory_record_transaction(
  (select business_id from public.inventory_concurrency_context),
  '57000000-0000-4000-8000-000000000207',
  'stock_count',
  jsonb_build_array(jsonb_build_object(
    'inventoryItemId',
      (select inventory_item_id from public.inventory_concurrency_context),
    'quantity', 0,
    'unit', 'ml',
    'expectedRevision', 7
  )),
  null,
  'Verified zero before inverse delete race'
);
reset role;

-- Race 5: atomic deletion owns the lock first, removes the source, and writes
-- the inactive tombstone. The waiting movement must reject and append nothing.
select dblink_exec('inventory_worker_a', 'begin');
select dblink_exec('inventory_worker_a', format(
  'do $lock$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0)); end $lock$',
  'pos-inventory:'
    || (select business_id::text from public.inventory_concurrency_context)
));
select dblink_send_query('inventory_worker_b', $query$
  select public.inventory_test_record(
    '57000000-0000-4000-8000-000000000208'::uuid, 8, 1
  )
$query$);
select dblink_send_query(
  'inventory_worker_a',
  $$select public.inventory_test_prepare_delete(
    'inventory-concurrency-milk', 'purchased', 'Concurrency Milk', 'ml'
  )$$
);
insert into inventory_concurrency_results
select 'delete-wins-delete', response.payload
from dblink_get_result('inventory_worker_a') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_a') as response(payload text);
select dblink_exec('inventory_worker_a', 'commit');
insert into inventory_concurrency_results
select 'delete-wins-movement', response.payload
from dblink_get_result('inventory_worker_b') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_b') as response(payload text);

do $$
declare
  v_business_id uuid :=
    (select business_id from public.inventory_concurrency_context);
  v_item_id uuid :=
    (select inventory_item_id from public.inventory_concurrency_context);
begin
  if (select payload from inventory_concurrency_results
      where label = 'delete-wins-delete') like 'REJECTED:%'
    or (select payload from inventory_concurrency_results
      where label = 'delete-wins-movement') <> 'REJECTED:P0002'
    or (select active from public.pos_inventory_items
      where business_id = v_business_id and id = v_item_id)
    or (select revision from public.pos_inventory_items
      where business_id = v_business_id and id = v_item_id) <> 9
    or (select coalesce(sum(quantity_delta_base), 0)
      from public.pos_inventory_transaction_lines
      where business_id = v_business_id and inventory_item_id = v_item_id) <> 0
    or (select count(*) from public.pos_inventory_transactions
      where business_id = v_business_id) <> 7
    or (select count(*) from public.pos_inventory_transaction_lines
      where business_id = v_business_id) <> 7
    or exists (
      select 1
      from public.scoopies_state as costing,
        jsonb_array_elements(costing.data -> 'ingredients') as source(value)
      where costing.id = 'main'
        and source.value ->> 'id' = 'inventory-concurrency-milk'
    ) then
    raise exception 'Delete-wins movement race appended stock or failed to remove/tombstone the source.';
  end if;
end;
$$;

-- Race 6: another business synchronizes the authoritative global source first.
-- A deletion by this business waits on the same costing row, then rejects and
-- leaves both the source and the winning global binding intact.
update public.scoopies_state as costing
set data = jsonb_set(
  costing.data,
  '{ingredients}',
  coalesce(costing.data -> 'ingredients', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'id', 'inventory-other-sync-wins', 'kind', 'purchased',
      'name', 'Other Sync Wins', 'unit', 'g'
    )),
  true
)
where costing.id = 'main';

select dblink_exec(
  'inventory_worker_a',
  'set request.jwt.claim.sub = ''57000000-0000-4000-8000-000000000002'''
);
select dblink_exec(
  'inventory_worker_b',
  'set request.jwt.claim.sub = ''57000000-0000-4000-8000-000000000001'''
);
select dblink_exec('inventory_worker_a', 'begin');
select dblink_exec('inventory_worker_a', format(
  'do $lock$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0)); perform 1 from public.scoopies_state where id = ''main'' for update; end $lock$',
  'pos-inventory:'
    || (select other_business_id::text from public.inventory_concurrency_context)
));
select dblink_send_query('inventory_worker_b', $query$
  select public.inventory_test_prepare_delete(
    'inventory-other-sync-wins', 'purchased', 'Other Sync Wins', 'g'
  )
$query$);
select dblink_send_query('inventory_worker_a', format(
  'select public.inventory_test_sync_for_business(%L::uuid, %L, %L, %L, %L)',
  (select other_business_id from public.inventory_concurrency_context),
  'inventory-other-sync-wins', 'purchased', 'Other Sync Wins', 'g'
));
insert into inventory_concurrency_results
select 'other-sync-wins-sync', response.payload
from dblink_get_result('inventory_worker_a') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_a') as response(payload text);
select dblink_exec('inventory_worker_a', 'commit');
insert into inventory_concurrency_results
select 'other-sync-wins-delete', response.payload
from dblink_get_result('inventory_worker_b') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_b') as response(payload text);

do $$
begin
  if (select payload from inventory_concurrency_results
      where label = 'other-sync-wins-sync') like 'REJECTED:%'
    or ((select payload from inventory_concurrency_results
      where label = 'other-sync-wins-sync')::jsonb ->> 'sync_result') <> 'created'
    or (select payload from inventory_concurrency_results
      where label = 'other-sync-wins-delete') <> 'REJECTED:55000'
    or not exists (
      select 1
      from public.scoopies_state as costing,
        jsonb_array_elements(costing.data -> 'ingredients') as source(value)
      where costing.id = 'main'
        and source.value ->> 'id' = 'inventory-other-sync-wins'
    )
    or (select count(*) from public.pos_inventory_items
      where business_id = (
          select other_business_id from public.inventory_concurrency_context
        )
        and source_costing_ingredient_id = 'inventory-other-sync-wins'
        and active and revision = 1) <> 1 then
    raise exception 'Other-business sync winner did not block global source deletion safely.';
  end if;
end;
$$;

-- Race 7: atomic deletion wins before another business can synchronize the
-- source. The waiting sync and a later post-save validation both reject, and
-- no active cross-business orphan can appear.
update public.scoopies_state as costing
set data = jsonb_set(
  costing.data,
  '{ingredients}',
  coalesce(costing.data -> 'ingredients', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'id', 'inventory-delete-wins-other', 'kind', 'purchased',
      'name', 'Delete Wins Other', 'unit', 'piece'
    )),
  true
)
where costing.id = 'main';

select dblink_exec(
  'inventory_worker_a',
  'set request.jwt.claim.sub = ''57000000-0000-4000-8000-000000000001'''
);
select dblink_exec(
  'inventory_worker_b',
  'set request.jwt.claim.sub = ''57000000-0000-4000-8000-000000000002'''
);
select dblink_exec('inventory_worker_a', 'begin');
select dblink_exec('inventory_worker_a', format(
  'do $lock$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0)); perform 1 from public.scoopies_state where id = ''main'' for update; end $lock$',
  'pos-inventory:'
    || (select business_id::text from public.inventory_concurrency_context)
));
select dblink_send_query('inventory_worker_b', format(
  'select public.inventory_test_sync_for_business(%L::uuid, %L, %L, %L, %L)',
  (select other_business_id from public.inventory_concurrency_context),
  'inventory-delete-wins-other', 'purchased', 'Delete Wins Other', 'piece'
));
select dblink_send_query('inventory_worker_a', $query$
  select public.inventory_test_prepare_delete(
    'inventory-delete-wins-other', 'purchased', 'Delete Wins Other', 'piece'
  )
$query$);
insert into inventory_concurrency_results
select 'other-delete-wins-delete', response.payload
from dblink_get_result('inventory_worker_a') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_a') as response(payload text);
select dblink_exec('inventory_worker_a', 'commit');
insert into inventory_concurrency_results
select 'other-delete-wins-sync', response.payload
from dblink_get_result('inventory_worker_b') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_b') as response(payload text);
select dblink_send_query('inventory_worker_b', format(
  'select public.inventory_test_prepare_for_business(%L::uuid, %L, %L, %L, %L)',
  (select other_business_id from public.inventory_concurrency_context),
  'inventory-delete-wins-other', 'purchased', 'Delete Wins Other', 'piece'
));
insert into inventory_concurrency_results
select 'other-delete-wins-prepare', response.payload
from dblink_get_result('inventory_worker_b') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_b') as response(payload text);
select dblink_send_query('inventory_worker_b', format(
  'select public.inventory_test_delete_for_business(%L::uuid, %L, %L, %L, %L)',
  (select other_business_id from public.inventory_concurrency_context),
  'inventory-delete-wins-other', 'purchased', 'Delete Wins Other', 'piece'
));
insert into inventory_concurrency_results
select 'other-delete-wins-retry', response.payload
from dblink_get_result('inventory_worker_b') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_b') as response(payload text);

do $$
begin
  if (select payload from inventory_concurrency_results
      where label = 'other-delete-wins-delete') like 'REJECTED:%'
    or (select payload from inventory_concurrency_results
      where label = 'other-delete-wins-sync') <> 'REJECTED:55000'
    or (select payload from inventory_concurrency_results
      where label = 'other-delete-wins-prepare') <> 'REJECTED:P0002'
    or (select payload from inventory_concurrency_results
      where label = 'other-delete-wins-retry') <> 'DELETED'
    or exists (
      select 1
      from public.scoopies_state as costing,
        jsonb_array_elements(costing.data -> 'ingredients') as source(value)
      where costing.id = 'main'
        and source.value ->> 'id' = 'inventory-delete-wins-other'
    )
    or (select count(*) from public.pos_inventory_items
      where business_id = (
          select business_id from public.inventory_concurrency_context
        )
        and source_costing_ingredient_id = 'inventory-delete-wins-other'
        and not active and revision = 1) <> 1
    or exists (
      select 1 from public.pos_inventory_items
      where source_costing_ingredient_id = 'inventory-delete-wins-other'
        and active
    ) then
    raise exception 'Delete winner allowed a later cross-business active orphan.';
  end if;
end;
$$;

-- Race 8: atomic deletion wins while the cloud source has not yet been synced.
-- It must create an inactive revision-1 tombstone so the waiting stale sync
-- cannot create an active row after the costing deletion.
select dblink_exec(
  'inventory_worker_a',
  'set request.jwt.claim.sub = ''57000000-0000-4000-8000-000000000001'''
);
select dblink_exec(
  'inventory_worker_b',
  'set request.jwt.claim.sub = ''57000000-0000-4000-8000-000000000001'''
);

update public.scoopies_state as costing
set data = jsonb_set(
  costing.data,
  '{ingredients}',
  coalesce(costing.data -> 'ingredients', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'id', 'inventory-delete-before-sync', 'kind', 'purchased',
      'name', 'Deleted Before Sync', 'unit', 'piece'
    )),
  true
)
where costing.id = 'main';

select dblink_exec('inventory_worker_a', 'begin');
select dblink_exec('inventory_worker_a', format(
  'do $lock$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0)); end $lock$',
  'pos-inventory:'
    || (select business_id::text from public.inventory_concurrency_context)
));
select dblink_send_query('inventory_worker_b', $query$
  select public.inventory_test_sync_source(
    'inventory-delete-before-sync', 'purchased', 'Deleted Before Sync', 'piece'
  )
$query$);
select dblink_send_query('inventory_worker_a', $query$
  select public.inventory_test_prepare_delete(
    'inventory-delete-before-sync', 'purchased', 'Deleted Before Sync', 'piece'
  )
$query$);
insert into inventory_concurrency_results
select 'absent-delete-winner', response.payload
from dblink_get_result('inventory_worker_a') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_a') as response(payload text);
select dblink_exec('inventory_worker_a', 'commit');
insert into inventory_concurrency_results
select 'absent-delete-stale-sync', response.payload
from dblink_get_result('inventory_worker_b') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_b') as response(payload text);

do $$
declare
  v_business_id uuid :=
    (select business_id from public.inventory_concurrency_context);
  v_delete_id uuid := ((select payload from inventory_concurrency_results
    where label = 'absent-delete-winner')::jsonb ->> 'inventory_item_id')::uuid;
begin
  if ((select payload from inventory_concurrency_results
      where label = 'absent-delete-winner')::jsonb ->> 'active')::boolean
    or ((select payload from inventory_concurrency_results
      where label = 'absent-delete-winner')::jsonb ->> 'revision')::bigint <> 1
    or ((select payload from inventory_concurrency_results
      where label = 'absent-delete-stale-sync')::jsonb ->> 'sync_result') <> 'inactive'
    or ((select payload from inventory_concurrency_results
      where label = 'absent-delete-stale-sync')::jsonb ->> 'active')::boolean
    or ((select payload from inventory_concurrency_results
      where label = 'absent-delete-stale-sync')::jsonb ->> 'revision')::bigint <> 1
    or ((select payload from inventory_concurrency_results
      where label = 'absent-delete-stale-sync')::jsonb ->> 'inventory_item_id')::uuid
      is distinct from v_delete_id
    or (select count(*) from public.pos_inventory_items
      where business_id = v_business_id
        and source_costing_ingredient_id = 'inventory-delete-before-sync'
        and id = v_delete_id and item_kind = 'purchased'
        and name = 'Deleted Before Sync' and base_unit = 'piece'
        and not active and revision = 1) <> 1 then
    raise exception 'Absent-source delete versus stale-sync race failed to preserve one inactive tombstone.';
  end if;

  if exists (
    select 1
    from public.scoopies_state as costing,
      jsonb_array_elements(costing.data -> 'ingredients') as source(value)
    where costing.id = 'main'
      and source.value ->> 'id' = 'inventory-delete-before-sync'
  ) then
    raise exception 'Unsynced source remained in the costing document after atomic deletion.';
  end if;
end;
$$;

-- Race 9: deletion locks the latest costing row while another tab saves a new
-- recipe line for that source. Once deletion commits, the waiting save must
-- reject rather than leave a dangling dependency.
set role authenticated;
set request.jwt.claim.sub = '57000000-0000-4000-8000-000000000001';
update public.scoopies_state as costing
set data = jsonb_set(
  costing.data,
  '{ingredients}',
  coalesce(costing.data -> 'ingredients', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'id', 'inventory-concurrent-reference', 'kind', 'purchased',
      'name', 'Concurrent Reference Source', 'unit', 'g'
    )),
  true
)
where costing.id = 'main';
select *
from public.pos_inventory_sync_items(
  (select business_id from public.inventory_concurrency_context),
  jsonb_build_array(jsonb_build_object(
    'sourceCostingIngredientId', 'inventory-concurrent-reference',
    'kind', 'purchased', 'name', 'Concurrent Reference Source', 'baseUnit', 'g'
  ))
);
reset role;

select dblink_exec('inventory_worker_a', 'begin');
select dblink_exec('inventory_worker_a', format(
  'do $lock$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0)); perform 1 from public.scoopies_state where id = ''main'' for update; end $lock$',
  'pos-inventory:'
    || (select business_id::text from public.inventory_concurrency_context)
));
select dblink_send_query(
  'inventory_worker_b',
  $$select public.inventory_test_add_recipe_dependency(
    'inventory-concurrent-reference'
  )$$
);
select dblink_send_query(
  'inventory_worker_a',
  $$select public.inventory_test_prepare_delete(
    'inventory-concurrent-reference', 'purchased',
    'Concurrent Reference Source', 'g'
  )$$
);
insert into inventory_concurrency_results
select 'reference-race-delete', response.payload
from dblink_get_result('inventory_worker_a') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_a') as response(payload text);
select dblink_exec('inventory_worker_a', 'commit');
insert into inventory_concurrency_results
select 'reference-race-save', response.payload
from dblink_get_result('inventory_worker_b') as response(payload text);
select count(*) from dblink_get_result('inventory_worker_b') as response(payload text);

do $$
begin
  if (select payload from inventory_concurrency_results
      where label = 'reference-race-delete') like 'REJECTED:%'
    or (select payload from inventory_concurrency_results
      where label = 'reference-race-save') <> 'REJECTED:55000'
    or exists (
      select 1
      from public.scoopies_state as costing,
        jsonb_array_elements(
          coalesce(costing.data -> 'ingredients', '[]'::jsonb)
        ) as source(value)
      where costing.id = 'main'
        and source.value ->> 'id' = 'inventory-concurrent-reference'
    )
    or pg_catalog.jsonb_path_exists(
      (select data from public.scoopies_state where id = 'main'),
      '$.recipes[*].lines[*] ? (@.ingredientId == "inventory-concurrent-reference")'
    )
    or (select count(*)
      from public.pos_inventory_items
      where business_id = (
          select business_id from public.inventory_concurrency_context
        )
        and source_costing_ingredient_id = 'inventory-concurrent-reference'
        and not active and revision = 2) <> 1 then
    raise exception 'Concurrent post-delete recipe reference was committed or deletion failed.';
  end if;
end;
$$;

select dblink_disconnect('inventory_worker_a');
select dblink_disconnect('inventory_worker_b');

select 'PASS: Inventory Phase 1 concurrency checks' as result;
