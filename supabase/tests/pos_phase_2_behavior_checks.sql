-- Destructive Phase 2 fixture test for a disposable/local database only.
-- All fixtures are wrapped in one transaction and rolled back.

begin;

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'phase2-owner@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'phase2-manager@example.test'),
  ('10000000-0000-4000-8000-000000000003', 'phase2-cashier@example.test'),
  ('10000000-0000-4000-8000-000000000004', 'phase2-outsider@example.test'),
  ('10000000-0000-4000-8000-000000000005', 'phase2-other-owner@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

create temporary table phase2_context as
select public.pos_bootstrap_business('Scoopies Phase 2 Test', 'SCP', 'Asia/Manila') as business_id;

select public.pos_add_member_by_email(
  (select business_id from phase2_context),
  'phase2-manager@example.test',
  'manager',
  'Test Manager'
);

select public.pos_add_member_by_email(
  (select business_id from phase2_context),
  'phase2-cashier@example.test',
  'cashier',
  'Test Cashier'
);

do $$
begin
  if (select count(*) from public.pos_get_my_businesses()) <> 1 then
    raise exception 'Owner business discovery did not return exactly one workspace.';
  end if;
end;
$$;

create temporary table phase2_first_publication as
select *
from public.pos_publish_costing_product(
  (select business_id from phase2_context),
  'costing-matcha-12oz',
  'recipe-matcha',
  '  Matcha Latte 12oz  ',
  17000,
  6242,
  1555,
  jsonb_build_object(
    'schemaVersion', 1,
    'sourceProductId', 'costing-matcha-12oz',
    'sourceRecipeId', 'recipe-matcha',
    'name', 'Matcha Latte 12oz',
    'size', '12 oz',
    'sellingPriceCentavos', 17000,
    'ingredientCostCentavos', 6242,
    'packagingCostCentavos', 1555,
    'recipeYield', 1,
    'ingredients', jsonb_build_array(
      jsonb_build_object('id', 'matcha', 'name', 'Matcha', 'costCentavos', 3022),
      jsonb_build_object('id', 'milk', 'name', 'Oat milk', 'costCentavos', 3220)
    ),
    'packaging', jsonb_build_array(
      jsonb_build_object('id', 'cup', 'name', '12oz cup', 'costCentavos', 257),
      jsonb_build_object('id', 'lid', 'name', 'Dabba lid', 'costCentavos', 257),
      jsonb_build_object('id', 'straw', 'name', 'Straw', 'costCentavos', 90),
      jsonb_build_object('id', 'holder', 'name', 'Cup holder', 'costCentavos', 840),
      jsonb_build_object('id', 'plastic', 'name', 'Plastic', 'costCentavos', 111)
    )
  ),
  '12 oz',
  'Matcha',
  null
);

do $$
declare
  v_business_id uuid := (select business_id from phase2_context);
  v_product_id uuid := (select product_id from phase2_first_publication);
  v_version_id uuid := (select version_id from phase2_first_publication);
begin
  if (select publish_result from phase2_first_publication) <> 'published'
    or (select version_number from phase2_first_publication) <> 1 then
    raise exception 'First publication did not create version 1.';
  end if;

  if (select source_costing_hash from phase2_first_publication) !~ '^[0-9a-f]{64}$' then
    raise exception 'Server publication hash is not lowercase SHA-256.';
  end if;

  if (select product_name from phase2_first_publication) <> 'Matcha Latte 12oz'
    or (select category_name from phase2_first_publication) <> 'Matcha'
    or (select size_snapshot from phase2_first_publication) <> '12 oz' then
    raise exception 'Publication normalization or category assignment is incorrect.';
  end if;

  if (select count(*) from public.pos_products where business_id = v_business_id) <> 1
    or (select count(*) from public.pos_product_versions where product_id = v_product_id) <> 1 then
    raise exception 'First publication created an unexpected number of rows.';
  end if;

  if (
    select product.active_version_id
    from public.pos_products as product
    where product.id = v_product_id
  ) is distinct from v_version_id then
    raise exception 'First publication did not activate its immutable version.';
  end if;

  if (select count(*) from public.pos_get_publication_status(v_business_id)) <> 1 then
    raise exception 'Owner publication status did not return the product.';
  end if;

  if (
    select status.costing_snapshot ->> 'recipeYield'
    from public.pos_get_publication_status(v_business_id) as status
    where status.product_id = v_product_id
  ) <> '1' then
    raise exception 'Publication status did not return the original costing snapshot.';
  end if;
end;
$$;

-- The same active content is retry-safe even with a stale optimistic token.
create temporary table phase2_retry as
select *
from public.pos_publish_costing_product(
  (select business_id from phase2_context),
  'costing-matcha-12oz',
  'recipe-matcha',
  'Matcha Latte 12oz',
  17000,
  6242,
  1555,
  jsonb_build_object(
    'schemaVersion', 1,
    'sourceProductId', 'costing-matcha-12oz',
    'sourceRecipeId', 'recipe-matcha',
    'name', 'Matcha Latte 12oz',
    'size', '12 oz',
    'sellingPriceCentavos', 17000,
    'ingredientCostCentavos', 6242,
    'packagingCostCentavos', 1555,
    'recipeYield', 1,
    'ingredients', jsonb_build_array(
      jsonb_build_object('id', 'matcha', 'name', 'Matcha', 'costCentavos', 3022),
      jsonb_build_object('id', 'milk', 'name', 'Oat milk', 'costCentavos', 3220)
    ),
    'packaging', jsonb_build_array(
      jsonb_build_object('id', 'cup', 'name', '12oz cup', 'costCentavos', 257),
      jsonb_build_object('id', 'lid', 'name', 'Dabba lid', 'costCentavos', 257),
      jsonb_build_object('id', 'straw', 'name', 'Straw', 'costCentavos', 90),
      jsonb_build_object('id', 'holder', 'name', 'Cup holder', 'costCentavos', 840),
      jsonb_build_object('id', 'plastic', 'name', 'Plastic', 'costCentavos', 111)
    )
  ),
  '12 oz',
  'matcha',
  gen_random_uuid()
);

do $$
begin
  if (select publish_result from phase2_retry) <> 'unchanged'
    or (select version_id from phase2_retry)
      is distinct from (select version_id from phase2_first_publication) then
    raise exception 'Exact publication retry was not idempotent.';
  end if;

  if (
    select count(*)
    from public.pos_product_versions
    where product_id = (select product_id from phase2_first_publication)
  ) <> 1 then
    raise exception 'Exact retry created another immutable version.';
  end if;
end;
$$;

-- A category-only change is operational metadata and needs the exact token.
do $$
begin
  begin
    perform public.pos_publish_costing_product(
      (select business_id from phase2_context),
      'costing-matcha-12oz', 'recipe-matcha', 'Matcha Latte 12oz',
      17000, 6242, 1555,
      jsonb_build_object(
        'schemaVersion', 1,
        'sourceProductId', 'costing-matcha-12oz',
        'sourceRecipeId', 'recipe-matcha',
        'name', 'Matcha Latte 12oz',
        'size', '12 oz',
        'sellingPriceCentavos', 17000,
        'ingredientCostCentavos', 6242,
        'packagingCostCentavos', 1555,
        'recipeYield', 1,
        'ingredients', jsonb_build_array(
          jsonb_build_object('id', 'matcha', 'name', 'Matcha', 'costCentavos', 3022),
          jsonb_build_object('id', 'milk', 'name', 'Oat milk', 'costCentavos', 3220)
        ),
        'packaging', jsonb_build_array(
          jsonb_build_object('id', 'cup', 'name', '12oz cup', 'costCentavos', 257),
          jsonb_build_object('id', 'lid', 'name', 'Dabba lid', 'costCentavos', 257),
          jsonb_build_object('id', 'straw', 'name', 'Straw', 'costCentavos', 90),
          jsonb_build_object('id', 'holder', 'name', 'Cup holder', 'costCentavos', 840),
          jsonb_build_object('id', 'plastic', 'name', 'Plastic', 'costCentavos', 111)
        )
      ),
      '12 oz', 'Drinks', null
    );
    raise exception 'Category-only update accepted a missing expected version.';
  exception
    when sqlstate '40001' then null;
  end;
end;
$$;

create temporary table phase2_category_update as
select *
from public.pos_publish_costing_product(
  (select business_id from phase2_context),
  'costing-matcha-12oz', 'recipe-matcha', 'Matcha Latte 12oz',
  17000, 6242, 1555,
  jsonb_build_object(
    'schemaVersion', 1,
    'sourceProductId', 'costing-matcha-12oz',
    'sourceRecipeId', 'recipe-matcha',
    'name', 'Matcha Latte 12oz',
    'size', '12 oz',
    'sellingPriceCentavos', 17000,
    'ingredientCostCentavos', 6242,
    'packagingCostCentavos', 1555,
    'recipeYield', 1,
    'ingredients', jsonb_build_array(
      jsonb_build_object('id', 'matcha', 'name', 'Matcha', 'costCentavos', 3022),
      jsonb_build_object('id', 'milk', 'name', 'Oat milk', 'costCentavos', 3220)
    ),
    'packaging', jsonb_build_array(
      jsonb_build_object('id', 'cup', 'name', '12oz cup', 'costCentavos', 257),
      jsonb_build_object('id', 'lid', 'name', 'Dabba lid', 'costCentavos', 257),
      jsonb_build_object('id', 'straw', 'name', 'Straw', 'costCentavos', 90),
      jsonb_build_object('id', 'holder', 'name', 'Cup holder', 'costCentavos', 840),
      jsonb_build_object('id', 'plastic', 'name', 'Plastic', 'costCentavos', 111)
    )
  ),
  '12 oz', 'Drinks',
  (select version_id from phase2_first_publication)
);

do $$
begin
  if (select publish_result from phase2_category_update) <> 'metadata_updated'
    or (select category_name from phase2_category_update) <> 'Drinks' then
    raise exception 'Category metadata update failed.';
  end if;

  if (
    select count(*)
    from public.pos_product_versions
    where product_id = (select product_id from phase2_first_publication)
  ) <> 1 then
    raise exception 'Category-only update created a price/cost version.';
  end if;
end;
$$;

-- A manager may publish, but every content change must carry the active token.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);

do $$
begin
  begin
    perform public.pos_publish_costing_product(
      (select business_id from phase2_context),
      'costing-matcha-12oz', 'recipe-matcha', 'Matcha Latte 12oz',
      17500, 6242, 1555,
      jsonb_build_object(
        'schemaVersion', 1,
        'sourceProductId', 'costing-matcha-12oz',
        'sourceRecipeId', 'recipe-matcha',
        'name', 'Matcha Latte 12oz',
        'size', '12 oz',
        'sellingPriceCentavos', 17500,
        'ingredientCostCentavos', 6242,
        'packagingCostCentavos', 1555,
        'revision', 2
      ),
      '12 oz', 'Drinks', null
    );
    raise exception 'Changed publication accepted a missing optimistic token.';
  exception
    when sqlstate '40001' then null;
  end;
end;
$$;

create temporary table phase2_second_publication as
select *
from public.pos_publish_costing_product(
  (select business_id from phase2_context),
  'costing-matcha-12oz', 'recipe-matcha', 'Matcha Latte 12oz',
  17500, 6242, 1555,
  jsonb_build_object(
    'schemaVersion', 1,
    'sourceProductId', 'costing-matcha-12oz',
    'sourceRecipeId', 'recipe-matcha',
    'name', 'Matcha Latte 12oz',
    'size', '12 oz',
    'sellingPriceCentavos', 17500,
    'ingredientCostCentavos', 6242,
    'packagingCostCentavos', 1555,
    'revision', 2
  ),
  '12 oz', 'Drinks',
  (select version_id from phase2_first_publication)
);

do $$
begin
  if (select publish_result from phase2_second_publication) <> 'published'
    or (select version_number from phase2_second_publication) <> 2 then
    raise exception 'Manager price change did not create version 2.';
  end if;

  if (select count(*) from public.pos_get_publication_status(
      (select business_id from phase2_context)
    )) <> 1 then
    raise exception 'Manager cannot read publication status.';
  end if;
end;
$$;

-- Reverting to old content is a new chronological publication (version 3),
-- not a reactivation of version 1.
create temporary table phase2_revert_publication as
select *
from public.pos_publish_costing_product(
  (select business_id from phase2_context),
  'costing-matcha-12oz',
  'recipe-matcha',
  'Matcha Latte 12oz',
  17000,
  6242,
  1555,
  jsonb_build_object(
    'schemaVersion', 1,
    'sourceProductId', 'costing-matcha-12oz',
    'sourceRecipeId', 'recipe-matcha',
    'name', 'Matcha Latte 12oz',
    'size', '12 oz',
    'sellingPriceCentavos', 17000,
    'ingredientCostCentavos', 6242,
    'packagingCostCentavos', 1555,
    'recipeYield', 1,
    'ingredients', jsonb_build_array(
      jsonb_build_object('id', 'matcha', 'name', 'Matcha', 'costCentavos', 3022),
      jsonb_build_object('id', 'milk', 'name', 'Oat milk', 'costCentavos', 3220)
    ),
    'packaging', jsonb_build_array(
      jsonb_build_object('id', 'cup', 'name', '12oz cup', 'costCentavos', 257),
      jsonb_build_object('id', 'lid', 'name', 'Dabba lid', 'costCentavos', 257),
      jsonb_build_object('id', 'straw', 'name', 'Straw', 'costCentavos', 90),
      jsonb_build_object('id', 'holder', 'name', 'Cup holder', 'costCentavos', 840),
      jsonb_build_object('id', 'plastic', 'name', 'Plastic', 'costCentavos', 111)
    )
  ),
  '12 oz', 'Drinks',
  (select version_id from phase2_second_publication)
);

do $$
begin
  if (select publish_result from phase2_revert_publication) <> 'published'
    or (select version_number from phase2_revert_publication) <> 3
    or (select version_id from phase2_revert_publication)
      = (select version_id from phase2_first_publication)
    or (select source_costing_hash from phase2_revert_publication)
      <> (select source_costing_hash from phase2_first_publication) then
    raise exception 'Historical revert did not append version 3 correctly.';
  end if;
end;
$$;

select public.pos_set_product_availability(
  (select business_id from phase2_context),
  (select product_id from phase2_first_publication),
  false
);

-- Cashiers can read the safe available catalog only; they cannot publish,
-- inspect cost status, or mutate catalog tables directly.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);

do $$
declare
  v_business_id uuid := (select business_id from phase2_context);
begin
  if (select count(*) from public.pos_get_catalog(v_business_id)) <> 0 then
    raise exception 'Unavailable product appeared in cashier catalog.';
  end if;

  begin
    perform public.pos_get_publication_status(v_business_id);
    raise exception 'Cashier read cost-bearing publication status.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.pos_publish_costing_product(
      v_business_id, 'cashier-product', null, 'Cashier Product',
      10000, 1000, 1000, jsonb_build_object('source', 'cashier'),
      null, null, null
    );
    raise exception 'Cashier published a product.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.pos_products (
      business_id, source_costing_product_id, name, created_by
    ) values (
      v_business_id, 'direct-write', 'Direct write',
      '10000000-0000-4000-8000-000000000003'
    );
    raise exception 'Cashier inserted a catalog row directly.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select public.pos_set_product_availability(
  (select business_id from phase2_context),
  (select product_id from phase2_first_publication),
  true
);

do $$
begin
  if (select count(*) from public.pos_get_catalog(
      (select business_id from phase2_context)
    )) <> 1 then
    raise exception 'Available product is missing from the catalog.';
  end if;

  if (
    select catalog.selling_price_centavos
    from public.pos_get_catalog((select business_id from phase2_context)) as catalog
  ) <> 17000 then
    raise exception 'Catalog did not use the active version 3 selling price.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);

do $$
begin
  if (select count(*) from public.pos_get_my_businesses()) <> 0 then
    raise exception 'Outsider business discovery leaked a workspace.';
  end if;

  begin
    perform public.pos_get_catalog((select business_id from phase2_context));
    raise exception 'Outsider read another business catalog.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- Input validation is enforced inside the publication boundary.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

do $$
begin
  begin
    perform public.pos_publish_costing_product(
      (select business_id from phase2_context),
      'invalid-zero-price', 'invalid-recipe', 'Invalid', 0, 0, 0,
      jsonb_build_object(
        'schemaVersion', 1,
        'sourceProductId', 'invalid-zero-price',
        'sourceRecipeId', 'invalid-recipe',
        'name', 'Invalid',
        'size', null,
        'sellingPriceCentavos', 0,
        'ingredientCostCentavos', 0,
        'packagingCostCentavos', 0
      ),
      null, null, null
    );
    raise exception 'Zero-price product passed validation.';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform public.pos_publish_costing_product(
      (select business_id from phase2_context),
      'invalid-array', 'invalid-recipe', 'Invalid', 100, 0, 0,
      jsonb_build_array(1, 2, 3), null, null, null
    );
    raise exception 'Array costing snapshot passed validation.';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform public.pos_publish_costing_product(
      (select business_id from phase2_context),
      'invalid-large', 'invalid-recipe', 'Invalid', 100, 0, 0,
      jsonb_build_object('payload', repeat('0123456789abcdef', 20000)),
      null, null, null
    );
    raise exception 'Oversized costing snapshot passed validation.';
  exception
    when invalid_parameter_value then null;
  end;
end;
$$;

-- The immutable JSON evidence must identify the same recipe/product and exact
-- centavo values as the typed publication arguments.
do $$
declare
  v_business_id uuid := (select business_id from phase2_context);
  v_base jsonb := jsonb_build_object(
    'schemaVersion', 1,
    'sourceProductId', 'mismatch-product',
    'sourceRecipeId', 'mismatch-recipe',
    'name', 'Mismatch Product',
    'size', '16 oz',
    'sellingPriceCentavos', 20000,
    'ingredientCostCentavos', 7000,
    'packagingCostCentavos', 2000,
    'fixture', true
  );
  v_cases jsonb[];
  v_case jsonb;
  v_index integer := 0;
begin
  begin
    perform public.pos_publish_costing_product(
      v_business_id,
      'blank-recipe-product', '   ', 'Blank Recipe',
      20000, 7000, 2000,
      jsonb_build_object(
        'schemaVersion', 1,
        'sourceProductId', 'blank-recipe-product',
        'sourceRecipeId', '',
        'name', 'Blank Recipe',
        'size', null,
        'sellingPriceCentavos', 20000,
        'ingredientCostCentavos', 7000,
        'packagingCostCentavos', 2000
      ),
      null, null, null
    );
    raise exception 'Blank source recipe ID passed validation.';
  exception
    when invalid_parameter_value then null;
  end;

  v_cases := array[
    jsonb_set(v_base, '{schemaVersion}', '2'::jsonb),
    jsonb_set(v_base, '{sourceProductId}', to_jsonb('another-product'::text)),
    jsonb_set(v_base, '{sourceRecipeId}', to_jsonb('another-recipe'::text)),
    jsonb_set(v_base, '{name}', to_jsonb('Another Name'::text)),
    jsonb_set(v_base, '{size}', to_jsonb('12 oz'::text)),
    jsonb_set(v_base, '{sellingPriceCentavos}', to_jsonb(20001)),
    jsonb_set(v_base, '{ingredientCostCentavos}', to_jsonb(7001)),
    jsonb_set(v_base, '{packagingCostCentavos}', to_jsonb(2001)),
    v_base - 'name'
  ];

  foreach v_case in array v_cases loop
    v_index := v_index + 1;
    begin
      perform public.pos_publish_costing_product(
        v_business_id,
        'mismatch-product', 'mismatch-recipe', 'Mismatch Product',
        20000, 7000, 2000, v_case,
        '16 oz', null, null
      );
      raise exception 'Snapshot mismatch case % passed validation.', v_index;
    exception
      when invalid_parameter_value then null;
    end;
  end loop;

  if exists (
    select 1
    from public.pos_products as product
    where product.business_id = v_business_id
      and product.source_costing_product_id in ('blank-recipe-product', 'mismatch-product')
  ) then
    raise exception 'Rejected snapshot mismatch left a product row behind.';
  end if;
end;
$$;

-- A separate business may publish the same costing source ID without a
-- cross-tenant collision.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
create temporary table phase2_other_context as
select public.pos_bootstrap_business('Other Business', 'OTH', 'Asia/Manila') as business_id;

create temporary table phase2_other_publication as
select *
from public.pos_publish_costing_product(
  (select business_id from phase2_other_context),
  'costing-matcha-12oz', 'other-recipe', 'Other Matcha',
  19000, 7000, 1000, jsonb_build_object(
    'schemaVersion', 1,
    'sourceProductId', 'costing-matcha-12oz',
    'sourceRecipeId', 'other-recipe',
    'name', 'Other Matcha',
    'size', '12 oz',
    'sellingPriceCentavos', 19000,
    'ingredientCostCentavos', 7000,
    'packagingCostCentavos', 1000,
    'source', 'other-business'
  ),
  '12 oz', 'Drinks', null
);

do $$
begin
  if (select product_id from phase2_other_publication)
    = (select product_id from phase2_first_publication) then
    raise exception 'Two businesses shared a product identity.';
  end if;
end;
$$;

reset role;

-- Even a privileged direct write cannot mutate an immutable version.
do $$
begin
  begin
    update public.pos_product_versions
    set selling_price_centavos = selling_price_centavos + 1
    where id = (select version_id from phase2_first_publication);
    raise exception 'Published immutable version was updated.';
  exception
    when sqlstate '55000' then null;
  end;
end;
$$;

rollback;

select 'PASS: POS Phase 2 behavior checks' as result;
