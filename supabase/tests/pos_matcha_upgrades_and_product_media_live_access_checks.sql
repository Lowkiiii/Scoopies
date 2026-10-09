-- Live Supabase schema-9 smoke check. Every fixture and ledger mutation is
-- transaction-scoped and rolled back; the legacy costing document is verified
-- byte-for-byte at the end.

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

create temporary table schema9_live_context (
  owner_id uuid not null,
  cashier_id uuid not null,
  business_id uuid not null,
  matcha_product_id uuid,
  matcha_version_id uuid,
  hojicha_product_id uuid,
  hojicha_version_id uuid,
  wakatake_id uuid,
  shift_id uuid,
  sale_id uuid,
  image_path text
) on commit drop;

create temporary table schema9_live_costing_before as
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
  select 'Scoopies Schema 9 Live Test', 'Asia/Manila', 'PHP', 'T9L', owner.id
  from accounts as owner where owner.account_number = 1
  returning id, created_by
)
insert into schema9_live_context (owner_id, cashier_id, business_id)
select business.created_by, cashier.id, business.id
from business join accounts as cashier on cashier.account_number = 2;

insert into public.pos_business_members (
  business_id, user_id, role, display_name
)
select business_id, owner_id, 'owner', 'Schema 9 Live Owner'
from schema9_live_context
union all
select business_id, cashier_id, 'cashier', 'Schema 9 Live Cashier'
from schema9_live_context;

insert into public.pos_registers (business_id, name, created_by)
select business_id, 'Schema 9 Live Register', owner_id
from schema9_live_context;

grant select, update on table schema9_live_context to authenticated;
grant select on table schema9_live_context to anon;

select set_config(
  'request.jwt.claim.sub',
  (select owner_id::text from schema9_live_context), true
);
set local role authenticated;

with publication as (
  select * from public.pos_publish_costing_product(
    (select business_id from schema9_live_context),
    'schema9-live-matcha', 'schema9-live-matcha-recipe', 'Cereal Matcha',
    17000, 6000, 1500,
    jsonb_build_object(
      'schemaVersion', 1, 'sourceProductId', 'schema9-live-matcha',
      'sourceRecipeId', 'schema9-live-matcha-recipe', 'name', 'Cereal Matcha',
      'size', '12oz', 'sellingPriceCentavos', 17000,
      'ingredientCostCentavos', 6000, 'packagingCostCentavos', 1500,
      'fixture', 'schema9-live-access'
    ),
    '12oz', 'Live Test', null
  )
)
update schema9_live_context
set matcha_product_id = publication.product_id,
    matcha_version_id = publication.version_id
from publication;

with publication as (
  select * from public.pos_publish_costing_product(
    (select business_id from schema9_live_context),
    'schema9-live-hojicha', 'schema9-live-hojicha-recipe', 'Hojicha Latte',
    18000, 5000, 1500,
    jsonb_build_object(
      'schemaVersion', 1, 'sourceProductId', 'schema9-live-hojicha',
      'sourceRecipeId', 'schema9-live-hojicha-recipe', 'name', 'Hojicha Latte',
      'size', '12oz', 'sellingPriceCentavos', 18000,
      'ingredientCostCentavos', 5000, 'packagingCostCentavos', 1500,
      'fixture', 'schema9-live-access'
    ),
    '12oz', 'Live Test', null
  )
)
update schema9_live_context
set hojicha_product_id = publication.product_id,
    hojicha_version_id = publication.version_id
from publication;

reset role;
with option_row as (
  insert into public.pos_product_matcha_options (
    business_id, product_id, code, display_name, surcharge_centavos,
    ingredient_cost_delta_centavos, revision, sort_order, active, created_by
  )
  select business_id, matcha_product_id, 'wakatake',
         'Marukyu Koyamaen - Wakatake', 7000, 500, 1, 10, true, owner_id
  from schema9_live_context
  returning id
)
update schema9_live_context set wakatake_id = option_row.id
from option_row;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select owner_id::text from schema9_live_context), true
);
with opened as (
  select * from public.pos_open_shift(
    (select business_id from schema9_live_context), false, 0
  )
)
update schema9_live_context set shift_id = opened.shift_id from opened;

-- Cashier sees public prices/options, not option costs, and checkout derives
-- every surcharge/cost snapshot on the server.
select set_config(
  'request.jwt.claim.sub',
  (select cashier_id::text from schema9_live_context), true
);
do $$
declare
  v_catalog record;
  v_sale record;
  v_retry record;
begin
  select * into strict v_catalog
  from public.pos_get_catalog_v2((select business_id from schema9_live_context))
  where product_id = (select matcha_product_id from schema9_live_context);
  if jsonb_array_length(v_catalog.matcha_upgrades) <> 1
    or v_catalog.matcha_upgrades @>
      '[{"code":"wakatake","surcharge_centavos":7000,"revision":1}]'::jsonb
       is not true
    or v_catalog.matcha_upgrades::text ilike '%cost%'
    or v_catalog.image_object_path is not null then
    raise exception 'Live catalog v2 option pricing, cost masking, or media is wrong.';
  end if;
  if exists (
    select 1 from public.pos_product_matcha_options
    where business_id = (select business_id from schema9_live_context)
  ) then
    raise exception 'Live cashier bypassed Matcha option-table RLS.';
  end if;

  select * into strict v_sale
  from public.pos_complete_shift_sale_v3(
    (select business_id from schema9_live_context),
    (select shift_id from schema9_live_context), false,
    '99000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_live_context),
        'product_version_id', (select matcha_version_id from schema9_live_context),
        'quantity', 1, 'matcha_option_id', null,
        'matcha_option_revision', null
      ),
      jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_live_context),
        'product_version_id', (select matcha_version_id from schema9_live_context),
        'quantity', 1,
        'matcha_option_id', (select wakatake_id from schema9_live_context),
        'matcha_option_revision', 1
      )
    ), 'gcash', null, 'SCHEMA9-LIVE', 'schema 9 live check'
  );
  if v_sale.item_count <> 2 or v_sale.units_sold <> 2
    or v_sale.total_centavos <> 41000 or v_sale.is_retry then
    raise exception 'Live schema-3 checkout totals are incorrect.';
  end if;
  update schema9_live_context set sale_id = v_sale.sale_id;

  select * into strict v_retry
  from public.pos_complete_shift_sale_v3(
    (select business_id from schema9_live_context),
    (select shift_id from schema9_live_context), false,
    '99000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_live_context),
        'product_version_id', (select matcha_version_id from schema9_live_context),
        'quantity', 1, 'matcha_option_id', null,
        'matcha_option_revision', null
      ),
      jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_live_context),
        'product_version_id', (select matcha_version_id from schema9_live_context),
        'quantity', 1,
        'matcha_option_id', (select wakatake_id from schema9_live_context),
        'matcha_option_revision', 1
      )
    ), 'gcash', null, 'SCHEMA9-LIVE', 'schema 9 live check'
  );
  if not v_retry.is_retry or v_retry.sale_id <> v_sale.sale_id then
    raise exception 'Live schema-3 exact retry failed.';
  end if;

  if not exists (
      select 1 from public.pos_get_recent_sales_v2(
        (select business_id from schema9_live_context), false, 20
      )
      where sale_id = v_sale.sale_id
        and item_summary like '%Wakatake%'
        and estimated_cost_centavos is null and not can_view_costs
    ) or not exists (
      select 1 from public.pos_get_sales_product_tally_v2(
        (select business_id from schema9_live_context), false,
        null, null, null
      )
      where product_id = (select matcha_product_id from schema9_live_context)
        and units_sold = 2 and order_count = 1
        and net_sales_centavos = 41000
    ) then
    raise exception 'Live receipts/tally omitted upgraded sale facts or leaked costs.';
  end if;
end;
$$;

reset role;
do $$
begin
  if (select estimated_cost_centavos from public.pos_sales
      where id = (select sale_id from schema9_live_context)) <> 15500
    or not exists (
      select 1 from public.pos_sale_items
      where sale_id = (select sale_id from schema9_live_context)
        and matcha_option_code_snapshot = 'wakatake'
        and matcha_option_revision_snapshot = 1
        and matcha_surcharge_centavos = 7000
        and matcha_ingredient_cost_delta_centavos = 500
        and base_unit_price_centavos = 17000
        and unit_price_centavos = 24000
        and base_ingredient_unit_cost_centavos = 6000
        and ingredient_unit_cost_centavos = 6500
    ) then
    raise exception 'Live immutable upgrade financial snapshots are incorrect.';
  end if;
end;
$$;

update schema9_live_context
set image_path = business_id::text || '/' || matcha_product_id::text
  || '/99000000-0000-4000-8000-000000000002.webp';
insert into storage.objects (id, bucket_id, name, metadata)
select '99000000-0000-4000-8000-000000000003',
       'pos-product-images', image_path,
       jsonb_build_object('mimetype', 'image/webp', 'fixture', true)
from schema9_live_context;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select owner_id::text from schema9_live_context), true
);
do $$
declare
  v_set record;
  v_retry record;
begin
  select * into strict v_set from public.pos_set_product_image(
    (select business_id from schema9_live_context),
    (select matcha_product_id from schema9_live_context),
    (select image_path from schema9_live_context), null
  );
  select * into strict v_retry from public.pos_set_product_image(
    (select business_id from schema9_live_context),
    (select matcha_product_id from schema9_live_context),
    (select image_path from schema9_live_context), null
  );
  perform public.pos_set_product_availability(
    (select business_id from schema9_live_context),
    (select hojicha_product_id from schema9_live_context), false
  );
  if v_set.is_retry or not v_retry.is_retry
    or not exists (
      select 1 from public.pos_get_product_media(
        (select business_id from schema9_live_context)
      ) where product_id = (select matcha_product_id from schema9_live_context)
        and image_object_path = (select image_path from schema9_live_context)
    ) or not exists (
      select 1 from public.pos_get_product_media(
        (select business_id from schema9_live_context)
      ) where product_id = (select hojicha_product_id from schema9_live_context)
        and available = false
    ) then
    raise exception 'Live media CAS/retry or unavailable-product listing failed.';
  end if;
  perform public.pos_set_product_image(
    (select business_id from schema9_live_context),
    (select matcha_product_id from schema9_live_context), null,
    (select image_path from schema9_live_context)
  );
end;
$$;

-- Cashier, outsider, and anonymous authorization boundaries.
select set_config(
  'request.jwt.claim.sub',
  (select cashier_id::text from schema9_live_context), true
);
do $$
begin
  begin
    perform public.pos_get_product_media((select business_id from schema9_live_context));
    raise exception 'Live cashier read product-media management data.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pos_set_product_image(
      (select business_id from schema9_live_context),
      (select matcha_product_id from schema9_live_context), null, null
    );
    raise exception 'Live cashier changed a product image.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', true);
set local role authenticated;
do $$
begin
  begin
    perform public.pos_get_catalog_v2((select business_id from schema9_live_context));
    raise exception 'Live outsider read catalog v2.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pos_complete_shift_sale_v3(
      (select business_id from schema9_live_context), null, null, null, null,
      null, null, null, null
    );
    raise exception 'Live outsider reached schema-3 validation.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform public.pos_get_catalog_v2((select business_id from schema9_live_context));
    raise exception 'Anonymous role executed catalog v2.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pos_complete_shift_sale_v3(
      (select business_id from schema9_live_context), null, null, null, null,
      null, null, null, null
    );
    raise exception 'Anonymous role executed schema-3 checkout.';
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
  select * into strict v_before from schema9_live_costing_before;
  select count(*)::bigint as row_count,
         md5(string_agg(id || ':' || data::text, '|' order by id)) as checksum,
         sum(pg_column_size(data))::bigint as data_bytes
    into v_after
  from public.scoopies_state;
  if v_after.row_count is distinct from v_before.row_count
    or v_after.checksum is distinct from v_before.checksum
    or v_after.data_bytes is distinct from v_before.data_bytes then
    raise exception 'Costing document changed during schema-9 live checks.';
  end if;
end;
$$;

select 'PASS: schema 9 Matcha/media live access checks' as result;

rollback;
