-- Scoopie's POS Phase 2: explicit costing-product publication
--
-- This migration adds the narrow RPC surface used to publish an approved
-- costing product into the POS catalog. It does not read or modify
-- public.scoopies_state, and it does not expose direct catalog writes to the
-- browser.

begin;

alter table public.pos_products
  add constraint pos_products_source_costing_id_valid
  check (
    source_costing_product_id is null
    or char_length(btrim(source_costing_product_id)) between 1 and 200
  );

alter table public.pos_product_versions
  add constraint pos_product_versions_recipe_id_valid
  check (
    source_costing_recipe_id is null
    or char_length(btrim(source_costing_recipe_id)) between 1 and 200
  ),
  add constraint pos_product_versions_size_valid
  check (
    size_snapshot is null
    or char_length(btrim(size_snapshot)) between 1 and 40
  ),
  add constraint pos_product_versions_hash_valid
  check (source_costing_hash ~ '^[0-9a-f]{64}$'),
  add constraint pos_product_versions_snapshot_size_valid
  check (octet_length(costing_snapshot::text) <= 524288);

create index pos_product_versions_product_hash_idx
  on public.pos_product_versions (business_id, product_id, source_costing_hash);

-- Normalizes and validates every value covered by the publication hash.
-- This helper is deliberately not executable by browser roles.
create or replace function public.pos_costing_publication_payload(
  p_source_costing_product_id text,
  p_source_costing_recipe_id text,
  p_name text,
  p_selling_price_centavos bigint,
  p_ingredient_cost_centavos bigint,
  p_packaging_cost_centavos bigint,
  p_costing_snapshot jsonb,
  p_size text default null
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_source_product_id text := pg_catalog.btrim(coalesce(p_source_costing_product_id, ''));
  v_source_recipe_id text := nullif(pg_catalog.btrim(coalesce(p_source_costing_recipe_id, '')), '');
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_size text := nullif(pg_catalog.btrim(coalesce(p_size, '')), '');
begin
  if char_length(v_source_product_id) not between 1 and 200 then
    raise exception 'A costing product ID between 1 and 200 characters is required.'
      using errcode = '22023';
  end if;

  if v_source_recipe_id is null or char_length(v_source_recipe_id) not between 1 and 200 then
    raise exception 'A costing recipe ID between 1 and 200 characters is required.'
      using errcode = '22023';
  end if;

  if char_length(v_name) not between 1 and 120 then
    raise exception 'A product name between 1 and 120 characters is required.'
      using errcode = '22023';
  end if;

  if v_size is not null and char_length(v_size) > 40 then
    raise exception 'The product size cannot exceed 40 characters.'
      using errcode = '22023';
  end if;

  if p_selling_price_centavos is null
    or p_selling_price_centavos not between 1 and 100000000000 then
    raise exception 'Selling price must be between 1 and 100000000000 centavos.'
      using errcode = '22023';
  end if;

  if p_ingredient_cost_centavos is null
    or p_ingredient_cost_centavos not between 0 and 100000000000 then
    raise exception 'Ingredient cost must be between 0 and 100000000000 centavos.'
      using errcode = '22023';
  end if;

  if p_packaging_cost_centavos is null
    or p_packaging_cost_centavos not between 0 and 100000000000 then
    raise exception 'Packaging cost must be between 0 and 100000000000 centavos.'
      using errcode = '22023';
  end if;

  if p_ingredient_cost_centavos + p_packaging_cost_centavos > 100000000000 then
    raise exception 'Combined estimated cost cannot exceed 100000000000 centavos.'
      using errcode = '22023';
  end if;

  if p_costing_snapshot is null or jsonb_typeof(p_costing_snapshot) <> 'object' then
    raise exception 'Costing snapshot must be a JSON object.' using errcode = '22023';
  end if;

  if octet_length(p_costing_snapshot::text) > 262144 then
    raise exception 'Costing snapshot cannot exceed 262144 bytes.' using errcode = '22023';
  end if;

  if not p_costing_snapshot ?& array[
    'schemaVersion',
    'sourceProductId',
    'sourceRecipeId',
    'name',
    'size',
    'sellingPriceCentavos',
    'ingredientCostCentavos',
    'packagingCostCentavos'
  ] then
    raise exception 'Costing snapshot is missing required identity or centavo fields.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_costing_snapshot -> 'schemaVersion') is distinct from 'number'
    or (p_costing_snapshot -> 'schemaVersion') is distinct from to_jsonb(1) then
    raise exception 'Costing snapshot schemaVersion must be 1.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_costing_snapshot -> 'sourceProductId') is distinct from 'string'
    or (p_costing_snapshot ->> 'sourceProductId') is distinct from v_source_product_id then
    raise exception 'Costing snapshot sourceProductId does not match the publication.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_costing_snapshot -> 'sourceRecipeId') is distinct from 'string'
    or (p_costing_snapshot ->> 'sourceRecipeId') is distinct from v_source_recipe_id then
    raise exception 'Costing snapshot sourceRecipeId does not match the publication.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_costing_snapshot -> 'name') is distinct from 'string'
    or (p_costing_snapshot ->> 'name') is distinct from v_name then
    raise exception 'Costing snapshot name does not match the publication.'
      using errcode = '22023';
  end if;

  if (
      v_size is null
      and (p_costing_snapshot -> 'size') is distinct from 'null'::jsonb
    ) or (
      v_size is not null
      and (
        jsonb_typeof(p_costing_snapshot -> 'size') is distinct from 'string'
        or (p_costing_snapshot ->> 'size') is distinct from v_size
      )
    ) then
    raise exception 'Costing snapshot size does not match the publication.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_costing_snapshot -> 'sellingPriceCentavos') is distinct from 'number'
    or (p_costing_snapshot -> 'sellingPriceCentavos')
      is distinct from to_jsonb(p_selling_price_centavos) then
    raise exception 'Costing snapshot sellingPriceCentavos does not match the publication.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_costing_snapshot -> 'ingredientCostCentavos') is distinct from 'number'
    or (p_costing_snapshot -> 'ingredientCostCentavos')
      is distinct from to_jsonb(p_ingredient_cost_centavos) then
    raise exception 'Costing snapshot ingredientCostCentavos does not match the publication.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_costing_snapshot -> 'packagingCostCentavos') is distinct from 'number'
    or (p_costing_snapshot -> 'packagingCostCentavos')
      is distinct from to_jsonb(p_packaging_cost_centavos) then
    raise exception 'Costing snapshot packagingCostCentavos does not match the publication.'
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'publicationSchemaVersion', 1,
    'sourceCostingProductId', v_source_product_id,
    'sourceCostingRecipeId', v_source_recipe_id,
    'name', v_name,
    'size', v_size,
    'sellingPriceCentavos', p_selling_price_centavos,
    'ingredientCostCentavos', p_ingredient_cost_centavos,
    'packagingCostCentavos', p_packaging_cost_centavos,
    'costingSnapshot', p_costing_snapshot
  );
end;
$$;

create or replace function public.pos_costing_publication_hash(
  p_source_costing_product_id text,
  p_source_costing_recipe_id text,
  p_name text,
  p_selling_price_centavos bigint,
  p_ingredient_cost_centavos bigint,
  p_packaging_cost_centavos bigint,
  p_costing_snapshot jsonb,
  p_size text default null
)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        public.pos_costing_publication_payload(
          p_source_costing_product_id,
          p_source_costing_recipe_id,
          p_name,
          p_selling_price_centavos,
          p_ingredient_cost_centavos,
          p_packaging_cost_centavos,
          p_costing_snapshot,
          p_size
        )::text,
        'UTF8'
      )
    ),
    'hex'
  );
$$;

create or replace function public.pos_get_my_businesses()
returns table (
  business_id uuid,
  business_name text,
  timezone text,
  currency_code text,
  receipt_prefix text,
  member_role text,
  display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return query
  select
    business.id,
    business.name,
    business.timezone,
    business.currency_code,
    business.receipt_prefix,
    member.role,
    member.display_name
  from public.pos_business_members as member
  join public.pos_businesses as business
    on business.id = member.business_id
  where member.user_id = v_user_id
    and member.active = true
  order by member.joined_at, business.id;
end;
$$;

-- Cost-bearing publication status is restricted to owners and managers.
-- It deliberately returns the immutable source snapshot so the costing UI can
-- detect unpublished changes without making one RPC call per product.
create or replace function public.pos_get_publication_status(p_business_id uuid)
returns table (
  product_id uuid,
  source_costing_product_id text,
  category_id uuid,
  category_name text,
  catalog_name text,
  available boolean,
  archived_at timestamptz,
  active_version_id uuid,
  version_number integer,
  name_snapshot text,
  size_snapshot text,
  source_costing_recipe_id text,
  source_costing_hash text,
  selling_price_centavos bigint,
  ingredient_cost_centavos bigint,
  packaging_cost_centavos bigint,
  estimated_unit_cost_centavos bigint,
  costing_snapshot jsonb,
  published_by uuid,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select member.role
    into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true;

  if v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'Only an owner or manager can view publication status.'
      using errcode = '42501';
  end if;

  return query
  select
    product.id,
    product.source_costing_product_id,
    category.id,
    category.name,
    product.name,
    product.available,
    product.archived_at,
    version.id,
    version.version_number,
    version.name_snapshot,
    version.size_snapshot,
    version.source_costing_recipe_id,
    version.source_costing_hash,
    version.selling_price_centavos,
    version.ingredient_cost_centavos,
    version.packaging_cost_centavos,
    version.estimated_unit_cost_centavos,
    version.costing_snapshot,
    version.published_by,
    version.published_at
  from public.pos_products as product
  left join public.pos_categories as category
    on category.business_id = product.business_id
   and category.id = product.category_id
  left join public.pos_product_versions as version
    on version.business_id = product.business_id
   and version.product_id = product.id
   and version.id = product.active_version_id
  where product.business_id = p_business_id
    and product.source_costing_product_id is not null
  order by product.sort_order, product.name, product.id;
end;
$$;

create or replace function public.pos_get_catalog(p_business_id uuid)
returns table (
  product_id uuid,
  active_version_id uuid,
  category_id uuid,
  category_name text,
  product_name text,
  size_snapshot text,
  selling_price_centavos bigint,
  product_sort_order integer,
  category_sort_order integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.pos_business_members as member
    where member.business_id = p_business_id
      and member.user_id = v_user_id
      and member.active = true
  ) then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;

  return query
  select
    product.id,
    version.id,
    category.id,
    category.name,
    version.name_snapshot,
    version.size_snapshot,
    version.selling_price_centavos,
    product.sort_order,
    coalesce(category.sort_order, 0)
  from public.pos_products as product
  join public.pos_product_versions as version
    on version.business_id = product.business_id
   and version.product_id = product.id
   and version.id = product.active_version_id
  left join public.pos_categories as category
    on category.business_id = product.business_id
   and category.id = product.category_id
   and category.archived_at is null
  where product.business_id = p_business_id
    and product.available = true
    and product.archived_at is null
  order by coalesce(category.sort_order, 0), category.name nulls first,
           product.sort_order, version.name_snapshot, product.id;
end;
$$;

create or replace function public.pos_publish_costing_product(
  p_business_id uuid,
  p_source_costing_product_id text,
  p_source_costing_recipe_id text,
  p_name text,
  p_selling_price_centavos bigint,
  p_ingredient_cost_centavos bigint,
  p_packaging_cost_centavos bigint,
  p_costing_snapshot jsonb,
  p_size text default null,
  p_category_name text default null,
  p_expected_active_version_id uuid default null
)
returns table (
  product_id uuid,
  version_id uuid,
  version_number integer,
  source_costing_hash text,
  publish_result text,
  product_name text,
  size_snapshot text,
  category_id uuid,
  category_name text,
  selling_price_centavos bigint,
  ingredient_cost_centavos bigint,
  packaging_cost_centavos bigint,
  estimated_unit_cost_centavos bigint,
  available boolean,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_payload jsonb;
  v_source_product_id text;
  v_source_recipe_id text;
  v_name text;
  v_size text;
  v_category_name text := nullif(pg_catalog.btrim(coalesce(p_category_name, '')), '');
  v_category_id uuid;
  v_product_id uuid;
  v_active_version_id uuid;
  v_archived_at timestamptz;
  v_version_id uuid;
  v_version_number integer;
  v_published_at timestamptz;
  v_active_hash text;
  v_hash text;
  v_version_inserted boolean := false;
  v_metadata_changed boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  -- Lock and authorize the membership before parsing request details so an
  -- unauthorized caller cannot probe the publication validator.
  select member.role
    into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true
  for share;

  if v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'Only an owner or manager can publish POS products.'
      using errcode = '42501';
  end if;

  -- Validate and normalize before acquiring the business-wide publish lock.
  v_payload := public.pos_costing_publication_payload(
    p_source_costing_product_id,
    p_source_costing_recipe_id,
    p_name,
    p_selling_price_centavos,
    p_ingredient_cost_centavos,
    p_packaging_cost_centavos,
    p_costing_snapshot,
    p_size
  );
  v_source_product_id := v_payload ->> 'sourceCostingProductId';
  v_source_recipe_id := v_payload ->> 'sourceCostingRecipeId';
  v_name := v_payload ->> 'name';
  v_size := v_payload ->> 'size';
  v_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_payload::text, 'UTF8')),
    'hex'
  );

  if v_category_name is not null and char_length(v_category_name) > 80 then
    raise exception 'Category name cannot exceed 80 characters.' using errcode = '22023';
  end if;

  -- Catalog publication is low-volume. A per-business transaction lock keeps
  -- product, category, and version allocation deterministic across devices.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-publish:' || p_business_id::text, 0)
  );

  if v_category_name is not null then
    select category.id
      into v_category_id
    from public.pos_categories as category
    where category.business_id = p_business_id
      and pg_catalog.lower(category.name) = pg_catalog.lower(v_category_name)
      and category.archived_at is null
    order by category.created_at, category.id
    limit 1
    for update;

    if v_category_id is null then
      insert into public.pos_categories (
        business_id, name, created_by
      ) values (
        p_business_id, v_category_name, v_user_id
      ) returning id into v_category_id;
    end if;
  end if;

  select product.id, product.active_version_id, product.archived_at
    into v_product_id, v_active_version_id, v_archived_at
  from public.pos_products as product
  where product.business_id = p_business_id
    and product.source_costing_product_id = v_source_product_id
  for update;

  if v_product_id is null then
    if p_expected_active_version_id is not null then
      raise exception 'The POS product no longer matches the version you opened. Refresh and try again.'
        using errcode = '40001';
    end if;

    insert into public.pos_products (
      business_id, source_costing_product_id, category_id, name, created_by
    ) values (
      p_business_id, v_source_product_id, v_category_id, v_name, v_user_id
    ) returning id, active_version_id
      into v_product_id, v_active_version_id;
  elsif v_archived_at is not null then
    raise exception 'This POS product is archived. Restore it before publishing a new version.'
      using errcode = '55000';
  end if;

  select version.source_costing_hash
    into v_active_hash
  from public.pos_product_versions as version
  where version.business_id = p_business_id
    and version.product_id = v_product_id
    and version.id = v_active_version_id;

  v_metadata_changed := exists (
    select 1
    from public.pos_products as product
    where product.id = v_product_id
      and (
        product.name is distinct from v_name
        or (
          v_category_name is not null
          and product.category_id is distinct from v_category_id
        )
      )
  );

  if v_active_hash is not distinct from v_hash and not v_metadata_changed then
    -- The exact active publication is retry-safe even when the response to the
    -- first request was lost and the caller still holds an older token.
    select version.id, version.version_number, version.published_at
      into v_version_id, v_version_number, v_published_at
    from public.pos_product_versions as version
    where version.business_id = p_business_id
      and version.product_id = v_product_id
      and version.id = v_active_version_id;
  else
    -- Every real change, including category-only metadata, must be based on
    -- the exact version the editor reviewed. NULL is valid only for a product
    -- that truly has no active version yet.
    if p_expected_active_version_id is distinct from v_active_version_id then
      raise exception 'The POS product changed on another device. Refresh and review before publishing.'
        using errcode = '40001';
    end if;

    if v_active_hash is not distinct from v_hash then
      select version.id, version.version_number, version.published_at
        into v_version_id, v_version_number, v_published_at
      from public.pos_product_versions as version
      where version.business_id = p_business_id
        and version.product_id = v_product_id
        and version.id = v_active_version_id;
    else
      select coalesce(max(version.version_number), 0) + 1
        into v_version_number
      from public.pos_product_versions as version
      where version.business_id = p_business_id
        and version.product_id = v_product_id;

      insert into public.pos_product_versions (
        business_id,
        product_id,
        version_number,
        name_snapshot,
        size_snapshot,
        selling_price_centavos,
        ingredient_cost_centavos,
        packaging_cost_centavos,
        source_costing_recipe_id,
        source_costing_hash,
        costing_snapshot,
        published_by
      ) values (
        p_business_id,
        v_product_id,
        v_version_number,
        v_name,
        v_size,
        p_selling_price_centavos,
        p_ingredient_cost_centavos,
        p_packaging_cost_centavos,
        v_source_recipe_id,
        v_hash,
        p_costing_snapshot,
        v_user_id
      ) returning id, pos_product_versions.published_at
        into v_version_id, v_published_at;
      v_version_inserted := true;
    end if;
  end if;

  update public.pos_products as product
  set name = v_name,
      category_id = case
        when v_category_name is null then product.category_id
        else v_category_id
      end,
      active_version_id = v_version_id
  where product.id = v_product_id
    and (
      product.name is distinct from v_name
      or product.active_version_id is distinct from v_version_id
      or (
        v_category_name is not null
        and product.category_id is distinct from v_category_id
      )
    );

  product_id := v_product_id;
  version_id := v_version_id;
  version_number := v_version_number;
  source_costing_hash := v_hash;
  publish_result := case
    when v_version_inserted then 'published'
    when v_metadata_changed then 'metadata_updated'
    else 'unchanged'
  end;
  product_name := v_name;
  size_snapshot := v_size;
  select category.id, category.name
    into category_id, category_name
  from public.pos_products as product
  left join public.pos_categories as category
    on category.business_id = product.business_id
   and category.id = product.category_id
  where product.id = v_product_id;
  selling_price_centavos := p_selling_price_centavos;
  ingredient_cost_centavos := p_ingredient_cost_centavos;
  packaging_cost_centavos := p_packaging_cost_centavos;
  estimated_unit_cost_centavos := p_ingredient_cost_centavos + p_packaging_cost_centavos;
  select product.available
    into available
  from public.pos_products as product
  where product.id = v_product_id;
  published_at := v_published_at;
  return next;
end;
$$;

create or replace function public.pos_set_product_availability(
  p_business_id uuid,
  p_product_id uuid,
  p_available boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_available is null then
    raise exception 'Availability is required.' using errcode = '22023';
  end if;

  select member.role
    into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true
  for share;

  if v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'Only an owner or manager can change product availability.'
      using errcode = '42501';
  end if;

  update public.pos_products as product
  set available = p_available
  where product.business_id = p_business_id
    and product.id = p_product_id
    and product.archived_at is null
    and (p_available = false or product.active_version_id is not null);

  if not found then
    raise exception 'Active POS product not found or it has no published version.'
      using errcode = 'P0002';
  end if;

  return p_available;
end;
$$;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 2, 'name', 'pos_phase_2_catalog_publication'),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

revoke all on function public.pos_costing_publication_payload(
  text, text, text, bigint, bigint, bigint, jsonb, text
) from public, anon, authenticated;
revoke all on function public.pos_costing_publication_hash(
  text, text, text, bigint, bigint, bigint, jsonb, text
) from public, anon, authenticated;
revoke all on function public.pos_get_my_businesses()
  from public, anon, authenticated;
revoke all on function public.pos_get_publication_status(uuid)
  from public, anon, authenticated;
revoke all on function public.pos_get_catalog(uuid)
  from public, anon, authenticated;
revoke all on function public.pos_publish_costing_product(
  uuid, text, text, text, bigint, bigint, bigint, jsonb, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.pos_set_product_availability(uuid, uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.pos_get_my_businesses() to authenticated;
grant execute on function public.pos_get_publication_status(uuid) to authenticated;
grant execute on function public.pos_get_catalog(uuid) to authenticated;
grant execute on function public.pos_publish_costing_product(
  uuid, text, text, text, bigint, bigint, bigint, jsonb, text, text, uuid
) to authenticated;
grant execute on function public.pos_set_product_availability(uuid, uuid, boolean)
  to authenticated;

comment on function public.pos_publish_costing_product(
  uuid, text, text, text, bigint, bigint, bigint, jsonb, text, text, uuid
) is
  'Owner/manager publication gate from mutable costing data to an immutable POS product version.';
comment on function public.pos_get_catalog(uuid) is
  'Cashier-safe active catalog. Deliberately omits costs, hashes, and costing snapshots.';
comment on function public.pos_get_publication_status(uuid) is
  'Owner/manager publication status, including active immutable costing snapshots.';

commit;
