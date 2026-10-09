-- Transaction-scoped schema 9 behavior and financial semantics checks.

begin;

insert into auth.users (id, email) values
  ('90000000-0000-4000-8000-000000000001', 'schema9-owner@example.test'),
  ('90000000-0000-4000-8000-000000000002', 'schema9-manager@example.test'),
  ('90000000-0000-4000-8000-000000000003', 'schema9-cashier@example.test'),
  ('90000000-0000-4000-8000-000000000004', 'schema9-outsider@example.test');

create temporary table schema9_context (
  business_id uuid,
  matcha_product_id uuid,
  matcha_version_id uuid,
  hojicha_product_id uuid,
  hojicha_version_id uuid,
  wakatake_id uuid,
  aya_id uuid,
  live_shift_id uuid,
  upgraded_sale_id uuid,
  image_path text
) on commit drop;
grant select, insert, update on table schema9_context to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);

insert into schema9_context (business_id)
select public.pos_bootstrap_business('Schema 9 Test', 'T9S', 'Asia/Manila');
select public.pos_add_member_by_email(
  (select business_id from schema9_context),
  'schema9-manager@example.test', 'manager', 'Schema 9 Manager'
);
select public.pos_add_member_by_email(
  (select business_id from schema9_context),
  'schema9-cashier@example.test', 'cashier', 'Schema 9 Cashier'
);

with published as (
  select * from public.pos_publish_costing_product(
    (select business_id from schema9_context),
    'schema9-matcha', 'schema9-matcha-recipe', 'Cereal Matcha',
    17000, 6000, 1500,
    jsonb_build_object(
      'schemaVersion', 1, 'sourceProductId', 'schema9-matcha',
      'sourceRecipeId', 'schema9-matcha-recipe', 'name', 'Cereal Matcha',
      'size', '12oz', 'sellingPriceCentavos', 17000,
      'ingredientCostCentavos', 6000, 'packagingCostCentavos', 1500
    ),
    '12oz', 'Drinks', null
  )
)
update schema9_context
set matcha_product_id = published.product_id,
    matcha_version_id = published.version_id
from published;

with published as (
  select * from public.pos_publish_costing_product(
    (select business_id from schema9_context),
    'schema9-hojicha', 'schema9-hojicha-recipe', 'Hojicha Latte',
    18000, 5000, 1500,
    jsonb_build_object(
      'schemaVersion', 1, 'sourceProductId', 'schema9-hojicha',
      'sourceRecipeId', 'schema9-hojicha-recipe', 'name', 'Hojicha Latte',
      'size', '12oz', 'sellingPriceCentavos', 18000,
      'ingredientCostCentavos', 5000, 'packagingCostCentavos', 1500
    ),
    '12oz', 'Drinks', null
  )
)
update schema9_context
set hojicha_product_id = published.product_id,
    hojicha_version_id = published.version_id
from published;

reset role;

with inserted as (
  insert into public.pos_product_matcha_options (
    business_id, product_id, code, display_name, surcharge_centavos,
    ingredient_cost_delta_centavos, revision, sort_order, active, created_by
  ) values
  (
    (select business_id from schema9_context),
    (select matcha_product_id from schema9_context),
    'wakatake', 'Marukyu Koyamaen - Wakatake', 7000, 500, 1, 10, true,
    '90000000-0000-4000-8000-000000000001'
  ),
  (
    (select business_id from schema9_context),
    (select matcha_product_id from schema9_context),
    'aya_no_mori', 'Kanbayashi Shunsho - Aya no Mori', 8000, 1000, 1, 20, true,
    '90000000-0000-4000-8000-000000000001'
  )
  returning id, code
)
update schema9_context
set wakatake_id = (select id from inserted where code = 'wakatake'),
    aya_id = (select id from inserted where code = 'aya_no_mori');

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000003', true);

-- Cashiers receive IDs/revisions/prices but never premium ingredient costs.
do $$
declare
  v_matcha record;
  v_hojicha record;
begin
  select * into strict v_matcha
  from public.pos_get_catalog_v2((select business_id from schema9_context))
  where product_id = (select matcha_product_id from schema9_context);
  select * into strict v_hojicha
  from public.pos_get_catalog_v2((select business_id from schema9_context))
  where product_id = (select hojicha_product_id from schema9_context);

  if jsonb_array_length(v_matcha.matcha_upgrades) <> 2
    or (v_matcha.matcha_upgrades @> '[{"code":"wakatake","surcharge_centavos":7000}]'::jsonb) is not true
    or v_matcha.matcha_upgrades::text ilike '%cost%' then
    raise exception 'Catalog v2 Matcha choices or cost masking are incorrect.';
  end if;
  if v_hojicha.matcha_upgrades <> '[]'::jsonb then
    raise exception 'Hojicha unexpectedly received Matcha upgrades.';
  end if;
end;
$$;

with opened as (
  select * from public.pos_open_shift(
    (select business_id from schema9_context), false, 0
  )
)
update schema9_context set live_shift_id = opened.shift_id from opened;

-- One drink can appear as standard, Wakatake, and Aya in distinct cart lines.
do $$
declare
  v_sale record;
begin
  select * into strict v_sale
  from public.pos_complete_shift_sale_v3(
    (select business_id from schema9_context),
    (select live_shift_id from schema9_context), false,
    '91000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_context),
        'product_version_id', (select matcha_version_id from schema9_context),
        'quantity', 1,
        'matcha_option_id', null,
        'matcha_option_revision', null
      ),
      jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_context),
        'product_version_id', (select matcha_version_id from schema9_context),
        'quantity', 2,
        'matcha_option_id', (select wakatake_id from schema9_context),
        'matcha_option_revision', 1
      ),
      jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_context),
        'product_version_id', (select matcha_version_id from schema9_context),
        'quantity', 1,
        'matcha_option_id', (select aya_id from schema9_context),
        'matcha_option_revision', 1
      )
    ),
    'cash', 100000, null, 'three Matcha powders'
  );

  if v_sale.item_count <> 3 or v_sale.units_sold <> 4
    or v_sale.subtotal_centavos <> 90000
    or v_sale.total_centavos <> 90000
    or v_sale.change_given_centavos <> 10000
    or v_sale.is_retry then
    raise exception 'Schema-3 upgraded checkout totals are incorrect.';
  end if;

  update schema9_context set upgraded_sale_id = v_sale.sale_id;
end;
$$;

-- Exact lost-response retry resolves before mutable option or shift checks.
do $$
declare
  v_retry record;
begin
  select * into strict v_retry
  from public.pos_complete_shift_sale_v3(
    (select business_id from schema9_context),
    (select live_shift_id from schema9_context), false,
    '91000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_context),
        'product_version_id', (select matcha_version_id from schema9_context),
        'quantity', 1, 'matcha_option_id', null,
        'matcha_option_revision', null
      ),
      jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_context),
        'product_version_id', (select matcha_version_id from schema9_context),
        'quantity', 2,
        'matcha_option_id', (select wakatake_id from schema9_context),
        'matcha_option_revision', 1
      ),
      jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_context),
        'product_version_id', (select matcha_version_id from schema9_context),
        'quantity', 1,
        'matcha_option_id', (select aya_id from schema9_context),
        'matcha_option_revision', 1
      )
    ), 'cash', 100000, null, 'three Matcha powders'
  );
  if not v_retry.is_retry or v_retry.total_centavos <> 90000 then
    raise exception 'Exact schema-3 checkout retry failed.';
  end if;
end;
$$;

reset role;

do $$
begin
  if (select subtotal_centavos from public.pos_sales
      where id = (select upgraded_sale_id from schema9_context)) <> 90000
    or (select estimated_cost_centavos from public.pos_sales
        where id = (select upgraded_sale_id from schema9_context)) <> 32000
    or (select amount_centavos from public.pos_payments
        where sale_id = (select upgraded_sale_id from schema9_context)) <> 90000
    or (select amount_centavos from public.pos_sale_events
        where sale_id = (select upgraded_sale_id from schema9_context)
          and event_type = 'completed') <> 90000 then
    raise exception 'Upgraded sale/payment/event/cost facts diverged.';
  end if;

  if not exists (
      select 1 from public.pos_sale_items
      where sale_id = (select upgraded_sale_id from schema9_context)
        and matcha_option_code_snapshot = 'wakatake'
        and matcha_option_name_snapshot = 'Marukyu Koyamaen - Wakatake'
        and matcha_option_revision_snapshot = 1
        and matcha_surcharge_centavos = 7000
        and matcha_ingredient_cost_delta_centavos = 500
        and base_unit_price_centavos = 17000
        and base_ingredient_unit_cost_centavos = 6000
        and unit_price_centavos = 24000
        and ingredient_unit_cost_centavos = 6500
    ) or not exists (
      select 1 from public.pos_sale_items
      where sale_id = (select upgraded_sale_id from schema9_context)
        and matcha_option_code_snapshot = 'aya_no_mori'
        and unit_price_centavos = 25000
        and ingredient_unit_cost_centavos = 7000
    ) then
    raise exception 'Immutable option snapshots are incorrect.';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000003', true);

do $$
begin
  if not exists (
      select 1 from public.pos_get_recent_sales_v2(
        (select business_id from schema9_context), false, 20
      )
      where sale_id = (select upgraded_sale_id from schema9_context)
        and item_summary like '%Wakatake%'
        and item_summary like '%Aya no Mori%'
        and estimated_cost_centavos is null
        and not can_view_costs
    ) or not exists (
      select 1 from public.pos_get_sales_history_page(
        (select business_id from schema9_context), false, null, null, 20
      )
      where sale_id = (select upgraded_sale_id from schema9_context)
        and item_summary like '%Wakatake%'
        and item_summary like '%Aya no Mori%'
    ) then
    raise exception 'Receipt reports omitted upgrade snapshots or leaked costs.';
  end if;

  if not exists (
      select 1 from public.pos_get_sales_product_tally_v2(
        (select business_id from schema9_context), false, null, null, null
      )
      where product_id = (select matcha_product_id from schema9_context)
        and units_sold = 4 and order_count = 1
        and net_sales_centavos = 90000
    ) then
    raise exception 'Product tally does not include upgraded line revenue.';
  end if;
end;
$$;

-- Malformed/spoofed/cross-product/stale selections are deterministic failures.
do $$
declare
  v_retry record;
begin
  -- A lost-response retry remains resolvable even after the live option row
  -- has advanced. The stored request fingerprint and receipt snapshots win.
  select * into strict v_retry
  from public.pos_complete_shift_sale_v3(
    (select business_id from schema9_context),
    (select live_shift_id from schema9_context), false,
    '91000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_context),
        'product_version_id', (select matcha_version_id from schema9_context),
        'quantity', 1, 'matcha_option_id', null,
        'matcha_option_revision', null
      ),
      jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_context),
        'product_version_id', (select matcha_version_id from schema9_context),
        'quantity', 2,
        'matcha_option_id', (select wakatake_id from schema9_context),
        'matcha_option_revision', 1
      ),
      jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_context),
        'product_version_id', (select matcha_version_id from schema9_context),
        'quantity', 1,
        'matcha_option_id', (select aya_id from schema9_context),
        'matcha_option_revision', 1
      )
    ), 'cash', 100000, null, 'three Matcha powders'
  );
  if not v_retry.is_retry or v_retry.total_centavos <> 90000 then
    raise exception 'Option revision broke an immutable exact retry.';
  end if;

  begin
    perform public.pos_complete_shift_sale_v3(
      (select business_id from schema9_context),
      (select live_shift_id from schema9_context), false,
      '91000000-0000-4000-8000-000000000010',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select hojicha_product_id from schema9_context),
        'product_version_id', (select hojicha_version_id from schema9_context),
        'quantity', 1,
        'matcha_option_id', (select wakatake_id from schema9_context),
        'matcha_option_revision', 1
      )), 'gcash', null, null, null
    );
    raise exception 'A Matcha option was accepted for Hojicha.';
  exception when serialization_failure then null;
  end;

  begin
    perform public.pos_complete_shift_sale_v3(
      (select business_id from schema9_context),
      (select live_shift_id from schema9_context), false,
      '91000000-0000-4000-8000-000000000011',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_context),
        'product_version_id', (select matcha_version_id from schema9_context),
        'quantity', 1,
        'matcha_option_id', (select wakatake_id from schema9_context),
        'matcha_option_revision', 1,
        'surcharge_centavos', 1
      )), 'gcash', null, null, null
    );
    raise exception 'Client-supplied surcharge was accepted.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.pos_complete_shift_sale_v3(
      (select business_id from schema9_context),
      (select live_shift_id from schema9_context), false,
      '91000000-0000-4000-8000-000000000012',
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select matcha_product_id from schema9_context),
          'product_version_id', (select matcha_version_id from schema9_context),
          'quantity', 1,
          'matcha_option_id', (select wakatake_id from schema9_context),
          'matcha_option_revision', 1
        ),
        jsonb_build_object(
          'product_id', (select matcha_product_id from schema9_context),
          'product_version_id', (select matcha_version_id from schema9_context),
          'quantity', 1,
          'matcha_option_id', (select wakatake_id from schema9_context),
          'matcha_option_revision', 1
        )
      ), 'gcash', null, null, null
    );
    raise exception 'Duplicate product/option lines were accepted.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.pos_complete_shift_sale_v3(
      (select business_id from schema9_context),
      (select live_shift_id from schema9_context), false,
      '91000000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_context),
        'product_version_id', (select matcha_version_id from schema9_context),
        'quantity', 1, 'matcha_option_id', null,
        'matcha_option_revision', null
      )), 'cash', 100000, null, 'changed retry'
    );
    raise exception 'Changed schema-3 retry reused a checkout ID.';
  exception when unique_violation then null;
  end;
end;
$$;

-- The legacy schema-2 endpoint still records standard drinks and retries.
do $$
declare
  v_first record;
  v_retry record;
begin
  select * into strict v_first from public.pos_complete_shift_sale(
    (select business_id from schema9_context),
    (select live_shift_id from schema9_context), false,
    '91000000-0000-4000-8000-000000000020',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select matcha_product_id from schema9_context),
      'product_version_id', (select matcha_version_id from schema9_context),
      'quantity', 1
    )), 'gcash', null, 'legacy-v2', null
  );
  select * into strict v_retry from public.pos_complete_shift_sale(
    (select business_id from schema9_context),
    (select live_shift_id from schema9_context), false,
    '91000000-0000-4000-8000-000000000020',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select matcha_product_id from schema9_context),
      'product_version_id', (select matcha_version_id from schema9_context),
      'quantity', 1
    )), 'gcash', null, 'legacy-v2', null
  );
  if v_first.total_centavos <> 17000 or v_first.is_retry
    or not v_retry.is_retry or v_retry.sale_id <> v_first.sale_id then
    raise exception 'Schema-2 checkout compatibility or retry broke.';
  end if;
end;
$$;

reset role;

-- A price revision invalidates new carts without changing immutable retries.
update public.pos_product_matcha_options
set surcharge_centavos = 7100,
    revision = revision + 1
where id = (select wakatake_id from schema9_context);

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.pos_complete_shift_sale_v3(
      (select business_id from schema9_context),
      (select live_shift_id from schema9_context), false,
      '91000000-0000-4000-8000-000000000021',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select matcha_product_id from schema9_context),
        'product_version_id', (select matcha_version_id from schema9_context),
        'quantity', 1,
        'matcha_option_id', (select wakatake_id from schema9_context),
        'matcha_option_revision', 1
      )), 'gcash', null, null, null
    );
    raise exception 'A stale Matcha option revision was accepted.';
  exception when serialization_failure then null;
  end;
end;
$$;

-- Product image compare-and-swap and role checks.
reset role;
update schema9_context
set image_path = business_id::text || '/' || matcha_product_id::text
  || '/92000000-0000-4000-8000-000000000001.webp';

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
insert into storage.objects (id, bucket_id, name, metadata)
select '92000000-0000-4000-8000-000000000002',
       'pos-product-images', image_path,
       jsonb_build_object('mimetype', 'image/webp')
from schema9_context;

do $$
declare
  v_set record;
  v_retry record;
  v_remove record;
  v_deleted integer;
  v_missing_path text := (select business_id::text || '/' || matcha_product_id::text
    || '/92000000-0000-4000-8000-000000000099.webp' from schema9_context);
begin
  begin
    perform public.pos_set_product_image(
      (select business_id from schema9_context),
      (select matcha_product_id from schema9_context),
      v_missing_path, null
    );
    raise exception 'A missing Storage object was attached.';
  exception when no_data_found then null;
  end;

  begin
    perform public.pos_set_product_image(
      (select business_id from schema9_context),
      (select matcha_product_id from schema9_context),
      'wrong/business/product.webp', null
    );
    raise exception 'An invalid product image path was accepted.';
  exception when invalid_parameter_value then null;
  end;

  select * into strict v_set from public.pos_set_product_image(
    (select business_id from schema9_context),
    (select matcha_product_id from schema9_context),
    (select image_path from schema9_context), null
  );
  select * into strict v_retry from public.pos_set_product_image(
    (select business_id from schema9_context),
    (select matcha_product_id from schema9_context),
    (select image_path from schema9_context), null
  );
  if v_set.is_retry or not v_retry.is_retry
    or v_retry.image_object_path <> (select image_path from schema9_context) then
    raise exception 'Image set/retry semantics are incorrect.';
  end if;

  begin
    perform public.pos_set_product_image(
      (select business_id from schema9_context),
      (select matcha_product_id from schema9_context), null, null
    );
    raise exception 'A stale expected image path was accepted.';
  exception when serialization_failure then null;
  end;

  perform set_config('storage.test_operation', 'storage.object.delete', true);
  delete from storage.objects
  where bucket_id = 'pos-product-images'
    and name = (select image_path from schema9_context);
  get diagnostics v_deleted = row_count;
  if v_deleted <> 0 then
    raise exception 'Storage deleted an image while it was attached.';
  end if;

  perform public.pos_set_product_availability(
    (select business_id from schema9_context),
    (select hojicha_product_id from schema9_context), false
  );

  if not exists (
    select 1 from public.pos_get_product_media(
      (select business_id from schema9_context)
    ) where product_id = (select matcha_product_id from schema9_context)
      and image_object_path = (select image_path from schema9_context)
  ) or not exists (
    select 1 from public.pos_get_product_media(
      (select business_id from schema9_context)
    ) where product_id = (select hojicha_product_id from schema9_context)
      and available = false
  ) then
    raise exception 'Product media listing omitted the attached path.';
  end if;

  select * into strict v_remove from public.pos_set_product_image(
    (select business_id from schema9_context),
    (select matcha_product_id from schema9_context), null,
    (select image_path from schema9_context)
  );
  if v_remove.image_object_path is not null
    or v_remove.previous_image_object_path <> (select image_path from schema9_context) then
    raise exception 'Image removal result is incorrect.';
  end if;

  delete from storage.objects
  where bucket_id = 'pos-product-images'
    and name = (select image_path from schema9_context);
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception 'An owner could not clean up the detached image object.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', true);
do $$
begin
  if not exists (
    select 1 from public.pos_get_product_media(
      (select business_id from schema9_context)
    ) where product_id = (select hojicha_product_id from schema9_context)
      and available = false
  ) then
    raise exception 'Manager media access or unavailable-product inclusion failed.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000003', true);
do $$
begin
  if exists (
    select 1 from public.pos_product_matcha_options
    where business_id = (select business_id from schema9_context)
  ) then
    raise exception 'Cashier bypassed the cost-masking option-table RLS boundary.';
  end if;
  begin
    insert into storage.objects (id, bucket_id, name, metadata)
    select '92000000-0000-4000-8000-000000000003',
           'pos-product-images',
           business_id::text || '/' || matcha_product_id::text
             || '/92000000-0000-4000-8000-000000000004.webp',
           jsonb_build_object('mimetype', 'image/webp')
    from schema9_context;
    raise exception 'Cashier uploaded a product image.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pos_get_product_media((select business_id from schema9_context));
    raise exception 'Cashier viewed product media management data.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pos_set_product_image(
      (select business_id from schema9_context),
      (select matcha_product_id from schema9_context), null, null
    );
    raise exception 'Cashier changed a product image.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000004', true);
do $$
begin
  begin
    perform public.pos_get_catalog_v2((select business_id from schema9_context));
    raise exception 'Outsider read catalog v2.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pos_complete_shift_sale_v3(
      (select business_id from schema9_context), null, null, null, null,
      null, null, null, null
    );
    raise exception 'Outsider reached schema-3 validation.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;

select 'PASS: schema 9 Matcha/media behavior checks' as result;
