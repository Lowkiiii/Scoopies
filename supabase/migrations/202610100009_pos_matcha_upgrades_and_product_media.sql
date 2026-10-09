-- Scoopie's POS schema 9: server-priced Matcha upgrades and product media.
--
-- This release is deliberately additive. Cached catalog/checkout clients keep
-- using the schema 1/2 RPCs and fingerprints, while new clients opt in to the
-- versioned catalog and checkout contracts below.

begin;

-- This migration depends on every schema-8 report and shift object. Lock the
-- version row so two deployers cannot advance the schema concurrently, and do
-- not let an out-of-order/partial database advertise itself as schema 9.
do $$
declare
  v_version integer;
  v_name text;
  v_bucket record;
  v_bucket_marker jsonb;
begin
  select (metadata.value ->> 'version')::integer,
         metadata.value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata as metadata
  where metadata.key = 'schema_version'
  for update;

  if v_version is distinct from 8
    or v_name is distinct from 'pos_shift_history_and_filtered_tally' then
    raise exception
      'Refusing schema-9 migration: expected 8:pos_shift_history_and_filtered_tally, found %:%.',
      coalesce(v_version::text, '<missing>'), coalesce(v_name, '<missing>');
  end if;

  if pg_catalog.to_regprocedure(
      'storage.allow_any_operation(text[])'
    ) is null then
    raise exception
      'Refusing schema-9 migration: this Supabase Storage version does not expose storage.allow_any_operation(text[]).';
  end if;
  if not pg_catalog.has_function_privilege(
      'authenticated',
      'storage.allow_any_operation(text[])',
      'EXECUTE'
    ) then
    raise exception
      'Refusing schema-9 migration: authenticated cannot execute the required Storage policy helper.';
  end if;

  select metadata.value into v_bucket_marker
  from public.pos_system_metadata as metadata
  where metadata.key = 'pos_product_images_bucket_owner'
  for update;
  if found and v_bucket_marker is distinct from
      jsonb_build_object('owner', 'pos_schema_9', 'version', 1) then
    raise exception
      'Refusing schema-9 migration: the product-image bucket ownership marker is not recognized.';
  end if;

  -- The name is reserved for this feature. The only pre-existing bucket we
  -- accept is the private, migration-owned bucket deliberately preserved by a
  -- prior schema-9 rollback. Arbitrary Storage configuration is never taken
  -- over or rewritten.
  select bucket.id, bucket.name, bucket.public,
         bucket.file_size_limit, bucket.allowed_mime_types
    into v_bucket
  from storage.buckets as bucket
  where bucket.id = 'pos-product-images'
     or bucket.name = 'pos-product-images';
  if found and (
    v_bucket_marker is distinct from
      jsonb_build_object('owner', 'pos_schema_9', 'version', 1)
    or v_bucket.id is distinct from 'pos-product-images'
    or v_bucket.name is distinct from 'pos-product-images'
    or v_bucket.public is distinct from false
    or v_bucket.file_size_limit is distinct from 2097152::bigint
    or v_bucket.allowed_mime_types is distinct from array['image/webp']::text[]
  ) then
    raise exception
      'Refusing schema-9 migration: the reserved pos-product-images bucket already exists with unowned or unexpected configuration.';
  end if;
end;
$$;

create table public.pos_product_matcha_options (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  product_id uuid not null,
  code text not null check (code ~ '^[a-z][a-z0-9_]{0,39}$'),
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 120),
  surcharge_centavos bigint not null
    check (surcharge_centavos between 1 and 100000000000),
  ingredient_cost_delta_centavos bigint not null default 0
    check (ingredient_cost_delta_centavos between 0 and 100000000000),
  revision bigint not null default 1 check (revision > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, product_id, id),
  unique (business_id, product_id, code),
  foreign key (business_id, product_id)
    references public.pos_products(business_id, id) on delete restrict,
  foreign key (business_id, created_by)
    references public.pos_business_members(business_id, user_id) on delete restrict,
  check (surcharge_centavos + ingredient_cost_delta_centavos <= 100000000000)
);

create index pos_product_matcha_options_catalog_idx
  on public.pos_product_matcha_options
    (business_id, product_id, active, sort_order, display_name, id);

create or replace function public.pos_protect_matcha_option()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Matcha options are retained for sale history; deactivate the option instead.'
      using errcode = '55000';
  end if;

  if new.business_id is distinct from old.business_id
    or new.product_id is distinct from old.product_id
    or new.code is distinct from old.code
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Matcha option identity fields cannot be changed.'
      using errcode = '55000';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'A Matcha option update must advance its revision by exactly one.'
      using errcode = '40001';
  end if;

  new.display_name := pg_catalog.btrim(new.display_name);
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

-- New clients use an explicit schema-3 cart. Keeping this helper separate
-- preserves every schema-1/2 request fingerprint used by cached clients and
-- pending exact retries.
create or replace function public._pos_phase4_complete_sale_v3(
  p_business_id uuid,
  p_shift_id uuid,
  p_is_training boolean,
  p_client_sale_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_cash_tendered_centavos bigint,
  p_reference_number text,
  p_note text
)
returns table (
  sale_id uuid,
  shift_id uuid,
  is_training boolean,
  receipt_number text,
  business_date date,
  completed_at timestamptz,
  payment_method text,
  item_count integer,
  units_sold bigint,
  subtotal_centavos bigint,
  total_centavos bigint,
  cash_tendered_centavos bigint,
  change_given_centavos bigint,
  is_retry boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_method text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payment_method, '')));
  v_reference text := nullif(pg_catalog.btrim(coalesce(p_reference_number, '')), '');
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_normalized_items jsonb;
  v_fingerprint_payload jsonb;
  v_fingerprint text;
  v_existing record;
  v_sale_id uuid;
  v_product_name text;
  v_product_size text;
  v_base_unit_price bigint;
  v_base_ingredient_cost bigint;
  v_packaging_cost bigint;
  v_option_id uuid;
  v_option_code text;
  v_option_name text;
  v_option_revision bigint;
  v_option_surcharge bigint;
  v_option_cost_delta bigint;
  v_item record;
  v_line_number integer := 0;
  v_item_count integer;
  v_units_sold bigint;
  v_subtotal bigint;
  v_estimated_cost bigint;
  v_business_date date;
  v_receipt_sequence bigint;
  v_receipt_number text;
  v_completed_at timestamptz;
  v_cash_tendered bigint;
  v_change bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  -- Authorize before validating products, shifts, or option identifiers.
  select member.role into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true
  for share;

  if v_role is null or v_role not in ('owner', 'manager', 'cashier') then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;
  if p_shift_id is null or p_is_training is null then
    raise exception 'The selected shift and mode are required.' using errcode = '22023';
  end if;
  if p_client_sale_id is null then
    raise exception 'A client sale ID is required.' using errcode = '22023';
  end if;
  if p_items is null
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'A sale must contain between 1 and 100 cart lines.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as cart(item)
    where jsonb_typeof(cart.item) is distinct from 'object'
      or not (cart.item ?& array[
        'product_id', 'product_version_id', 'quantity',
        'matcha_option_id', 'matcha_option_revision'
      ])
      or (select count(*) from jsonb_object_keys(cart.item)) <> 5
      or jsonb_typeof(cart.item -> 'product_id') is distinct from 'string'
      or jsonb_typeof(cart.item -> 'product_version_id') is distinct from 'string'
      or jsonb_typeof(cart.item -> 'quantity') is distinct from 'number'
      or jsonb_typeof(cart.item -> 'matcha_option_id') not in ('string', 'null')
      or jsonb_typeof(cart.item -> 'matcha_option_revision') not in ('number', 'null')
      or (cart.item ->> 'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or (cart.item ->> 'product_version_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or (cart.item ->> 'quantity') !~ '^[0-9]+$'
      or (cart.item ->> 'quantity')::numeric not between 1 and 10000
      or ((cart.item ->> 'matcha_option_id') is null)
        <> ((cart.item ->> 'matcha_option_revision') is null)
      or (
        (cart.item ->> 'matcha_option_id') is not null
        and (cart.item ->> 'matcha_option_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      or (
        (cart.item ->> 'matcha_option_revision') is not null
        and (
          (cart.item ->> 'matcha_option_revision') !~ '^[0-9]+$'
          or (cart.item ->> 'matcha_option_revision')::numeric not between 1 and 9223372036854775807
        )
      )
  ) then
    raise exception 'Each schema-3 cart line requires only product_id, product_version_id, quantity, matcha_option_id, and matcha_option_revision.'
      using errcode = '22023';
  end if;

  if (
    select count(*) <> count(distinct (
      (cart.item ->> 'product_id') || ':'
      || coalesce(cart.item ->> 'matcha_option_id', 'standard')
    ))
    from jsonb_array_elements(p_items) as cart(item)
  ) then
    raise exception 'The same product and Matcha option can appear only once in a cart.'
      using errcode = '22023';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'product_id', (cart.item ->> 'product_id')::uuid,
      'product_version_id', (cart.item ->> 'product_version_id')::uuid,
      'quantity', (cart.item ->> 'quantity')::integer,
      'matcha_option_id', case
        when (cart.item ->> 'matcha_option_id') is null then null::uuid
        else (cart.item ->> 'matcha_option_id')::uuid end,
      'matcha_option_revision', case
        when (cart.item ->> 'matcha_option_revision') is null then null::bigint
        else (cart.item ->> 'matcha_option_revision')::bigint end
    ) order by (cart.item ->> 'product_id')::uuid,
               coalesce(cart.item ->> 'matcha_option_id', '')
  ) into v_normalized_items
  from jsonb_array_elements(p_items) as cart(item);

  if v_method not in ('cash', 'gcash', 'gotyme') then
    raise exception 'Payment method must be cash, gcash, or gotyme.'
      using errcode = '22023';
  end if;
  if v_reference is not null and char_length(v_reference) > 120 then
    raise exception 'Payment reference cannot exceed 120 characters.'
      using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Sale note cannot exceed 500 characters.' using errcode = '22023';
  end if;
  if v_method = 'cash' then
    if p_cash_tendered_centavos is null
      or p_cash_tendered_centavos not between 1 and 100000000000 then
      raise exception 'Cash received must be a positive supported centavo amount.'
        using errcode = '22023';
    end if;
    if v_reference is not null then
      raise exception 'Cash payments cannot have an online reference.'
        using errcode = '22023';
    end if;
  elsif p_cash_tendered_centavos is not null then
    raise exception 'Online payments cannot include cash received.'
      using errcode = '22023';
  end if;

  v_fingerprint_payload := jsonb_build_object(
    'checkoutSchemaVersion', 3,
    'items', v_normalized_items,
    'paymentMethod', v_method,
    'cashTenderedCentavos', case when v_method = 'cash'
      then p_cash_tendered_centavos else null end,
    'referenceNumber', case when v_method = 'cash' then null else v_reference end,
    'note', v_note,
    'shiftId', p_shift_id,
    'isTraining', p_is_training
  );
  v_fingerprint := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_fingerprint_payload::text, 'UTF8')),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pos-sale:' || p_business_id::text || ':' || p_client_sale_id::text, 0
    )
  );

  select sale.id, sale.shift_id, sale.is_training, sale.status,
         sale.request_fingerprint
    into v_existing
  from public.pos_sales as sale
  where sale.business_id = p_business_id
    and sale.client_sale_id = p_client_sale_id
  for update;

  if found then
    if v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'This checkout ID was already used for a different request. Start a new checkout.'
        using errcode = '23505';
    end if;
    if v_existing.status <> 'completed' then
      raise exception 'The matching checkout exists but is not complete.'
        using errcode = '55000';
    end if;

    return query
    select sale.id, sale.shift_id, sale.is_training, sale.receipt_number,
      sale.business_date, sale.completed_at, payment.method,
      (select count(*)::integer from public.pos_sale_items as item
       where item.business_id = sale.business_id and item.sale_id = sale.id),
      (select coalesce(sum(item.quantity), 0)::bigint
       from public.pos_sale_items as item
       where item.business_id = sale.business_id and item.sale_id = sale.id),
      sale.subtotal_centavos, sale.total_centavos,
      payment.cash_tendered_centavos, payment.change_given_centavos, true
    from public.pos_sales as sale
    join public.pos_payments as payment
      on payment.business_id = sale.business_id
     and payment.sale_id = sale.id and payment.payment_number = 1
    where sale.business_id = p_business_id and sale.id = v_existing.id;
    return;
  end if;

  -- Serialize checkout against close/void exactly like the schema-2 path.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-shift:' || p_business_id::text, 0)
  );

  perform 1
  from public.pos_shifts as shift
  join public.pos_registers as register
    on register.business_id = shift.business_id
   and register.id = shift.register_id
  where shift.business_id = p_business_id
    and shift.id = p_shift_id
    and shift.status = 'open'
    and shift.is_training = p_is_training
    and register.active = true
    and register.archived_at is null
  for update of shift;

  if not found then
    raise exception 'The selected shift is not open in the requested mode. Refresh shift status.'
      using errcode = '55000';
  end if;

  insert into public.pos_sales (
    business_id, shift_id, client_sale_id, request_fingerprint,
    status, entry_mode, is_training, cashier_id, note
  ) values (
    p_business_id, p_shift_id, p_client_sale_id, v_fingerprint,
    'open', 'live', p_is_training, v_user_id, v_note
  ) returning id into v_sale_id;

  for v_item in
    select
      (cart.item ->> 'product_id')::uuid as product_id,
      (cart.item ->> 'product_version_id')::uuid as product_version_id,
      (cart.item ->> 'quantity')::integer as quantity,
      case when (cart.item ->> 'matcha_option_id') is null then null::uuid
        else (cart.item ->> 'matcha_option_id')::uuid end as matcha_option_id,
      case when (cart.item ->> 'matcha_option_revision') is null then null::bigint
        else (cart.item ->> 'matcha_option_revision')::bigint end as matcha_option_revision
    from jsonb_array_elements(v_normalized_items) as cart(item)
    order by (cart.item ->> 'product_id')::uuid,
             coalesce(cart.item ->> 'matcha_option_id', '')
  loop
    select version.name_snapshot, version.size_snapshot,
           version.selling_price_centavos,
           version.ingredient_cost_centavos,
           version.packaging_cost_centavos
      into v_product_name, v_product_size, v_base_unit_price,
           v_base_ingredient_cost, v_packaging_cost
    from public.pos_products as product
    join public.pos_product_versions as version
      on version.business_id = product.business_id
     and version.product_id = product.id
     and version.id = product.active_version_id
    where product.business_id = p_business_id
      and product.id = v_item.product_id
      and product.active_version_id = v_item.product_version_id
      and product.available = true
      and product.archived_at is null
    for share of product;

    if not found then
      raise exception 'The POS catalog changed after this item was added. Refresh the catalog and review the cart.'
        using errcode = '40001';
    end if;

    v_option_id := null;
    v_option_code := null;
    v_option_name := null;
    v_option_revision := null;
    v_option_surcharge := 0;
    v_option_cost_delta := 0;

    if v_item.matcha_option_id is not null then
      select option.id, option.code, option.display_name, option.revision,
             option.surcharge_centavos, option.ingredient_cost_delta_centavos
        into v_option_id, v_option_code, v_option_name, v_option_revision,
             v_option_surcharge, v_option_cost_delta
      from public.pos_product_matcha_options as option
      where option.business_id = p_business_id
        and option.product_id = v_item.product_id
        and option.id = v_item.matcha_option_id
        and option.revision = v_item.matcha_option_revision
        and option.active = true
      for share;

      if not found then
        raise exception 'The Matcha upgrade changed after it was selected. Refresh the menu and review the cart.'
          using errcode = '40001';
      end if;
    end if;

    if v_base_unit_price + v_option_surcharge > 100000000000
      or v_base_ingredient_cost + v_option_cost_delta > 100000000000
      or (v_base_unit_price + v_option_surcharge) * v_item.quantity > 100000000000
      or (v_base_ingredient_cost + v_option_cost_delta + v_packaging_cost)
        * v_item.quantity > 100000000000 then
      raise exception 'A cart line exceeds the supported amount.' using errcode = '22003';
    end if;

    v_line_number := v_line_number + 1;
    insert into public.pos_sale_items (
      business_id, sale_id, line_number, product_id, product_version_id,
      name_snapshot, size_snapshot, quantity, unit_price_centavos,
      ingredient_unit_cost_centavos, packaging_unit_cost_centavos,
      line_discount_centavos, matcha_option_id,
      matcha_option_code_snapshot, matcha_option_name_snapshot,
      matcha_option_revision_snapshot, matcha_surcharge_centavos,
      matcha_ingredient_cost_delta_centavos
    ) values (
      p_business_id, v_sale_id, v_line_number, v_item.product_id,
      v_item.product_version_id, v_product_name, v_product_size,
      v_item.quantity, v_base_unit_price + v_option_surcharge,
      v_base_ingredient_cost + v_option_cost_delta, v_packaging_cost, 0,
      v_option_id, v_option_code, v_option_name, v_option_revision,
      v_option_surcharge, v_option_cost_delta
    );
  end loop;

  select count(*)::integer, coalesce(sum(item.quantity), 0)::bigint,
         coalesce(sum(item.gross_amount_centavos), 0)::bigint,
         coalesce(sum(item.estimated_line_cost_centavos), 0)::bigint
    into v_item_count, v_units_sold, v_subtotal, v_estimated_cost
  from public.pos_sale_items as item
  where item.business_id = p_business_id and item.sale_id = v_sale_id;

  if v_subtotal > 100000000000 or v_estimated_cost > 100000000000 then
    raise exception 'Sale totals exceed the supported amount.' using errcode = '22003';
  end if;
  if v_method = 'cash' and p_cash_tendered_centavos < v_subtotal then
    raise exception 'Cash received is less than the sale total.' using errcode = '22023';
  end if;

  v_cash_tendered := case when v_method = 'cash'
    then p_cash_tendered_centavos else null end;
  v_change := case when v_method = 'cash'
    then p_cash_tendered_centavos - v_subtotal else null end;

  insert into public.pos_payments (
    business_id, sale_id, payment_number, method, amount_centavos,
    processor_fee_centavos, cash_tendered_centavos,
    change_given_centavos, reference_number, confirmed_by
  ) values (
    p_business_id, v_sale_id, 1, v_method, v_subtotal, 0,
    v_cash_tendered, v_change,
    case when v_method = 'cash' then null else v_reference end,
    v_user_id
  );

  select allocated.business_date, allocated.receipt_sequence,
         allocated.receipt_number
    into v_business_date, v_receipt_sequence, v_receipt_number
  from public.pos_allocate_receipt(
    p_business_id, p_is_training, pg_catalog.clock_timestamp()
  ) as allocated;

  update public.pos_sales as sale
  set status = 'completed',
      business_date = v_business_date,
      receipt_sequence = v_receipt_sequence,
      receipt_number = v_receipt_number
  where sale.business_id = p_business_id and sale.id = v_sale_id
  returning sale.completed_at into v_completed_at;

  insert into public.pos_sale_events (
    business_id, sale_id, event_type, amount_centavos, payment_method,
    retain_cost, reference_number, acted_by, metadata
  ) values (
    p_business_id, v_sale_id, 'completed', v_subtotal, v_method, true,
    case when v_method = 'cash' then null else v_reference end,
    v_user_id,
    jsonb_build_object(
      'checkoutSchemaVersion', 3,
      'shiftId', p_shift_id,
      'isTraining', p_is_training
    )
  );

  return query select
    v_sale_id, p_shift_id, p_is_training, v_receipt_number,
    v_business_date, v_completed_at, v_method, v_item_count, v_units_sold,
    v_subtotal, v_subtotal, v_cash_tendered, v_change, false;
end;
$$;

create or replace function public.pos_complete_shift_sale_v3(
  p_business_id uuid,
  p_shift_id uuid,
  p_is_training boolean,
  p_client_sale_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_cash_tendered_centavos bigint,
  p_reference_number text,
  p_note text
)
returns table (
  sale_id uuid,
  shift_id uuid,
  is_training boolean,
  receipt_number text,
  business_date date,
  completed_at timestamptz,
  payment_method text,
  item_count integer,
  units_sold bigint,
  subtotal_centavos bigint,
  total_centavos bigint,
  cash_tendered_centavos bigint,
  change_given_centavos bigint,
  is_retry boolean
)
language sql
security definer
set search_path = ''
as $$
  select *
  from public._pos_phase4_complete_sale_v3(
    p_business_id, p_shift_id, p_is_training, p_client_sale_id, p_items,
    p_payment_method, p_cash_tendered_centavos, p_reference_number, p_note
  );
$$;


create trigger pos_product_matcha_options_protected
before update or delete on public.pos_product_matcha_options
for each row execute function public.pos_protect_matcha_option();

-- The current menu's explicitly named Matcha drinks receive the two prices
-- printed on the menu. This exact-name allowlist is only a one-time bootstrap;
-- checkout eligibility is thereafter based solely on these option rows.
insert into public.pos_product_matcha_options (
  business_id, product_id, code, display_name, surcharge_centavos,
  ingredient_cost_delta_centavos, revision, sort_order, active, created_by
)
select product.business_id, product.id,
       seeded.code, seeded.display_name, seeded.surcharge_centavos,
       0, 1, seeded.sort_order, true, product.created_by
from public.pos_products as product
cross join (values
  ('wakatake'::text, 'Marukyu Koyamaen - Wakatake'::text, 7000::bigint, 10),
  ('aya_no_mori'::text, 'Kanbayashi Shunsho - Aya no Mori'::text, 8000::bigint, 20)
) as seeded(code, display_name, surcharge_centavos, sort_order)
where product.archived_at is null
  and pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.btrim(product.name)), '\s+', ' ', 'g'
  ) in (
    'banana bread matcha',
    'cereal matcha',
    'coconut matcha',
    'coconut matcha cloud',
    'matcha latte',
    'matcha latte 12oz',
    'pink cloud',
    'pink cloud matcha',
    'sea salt cream matcha',
    'sea salt matcha',
    'strawberry matcha',
    'strawberry matcha 12oz'
  )
on conflict (business_id, product_id, code) do nothing;

alter table public.pos_sale_items
  add column matcha_option_id uuid,
  add column matcha_option_code_snapshot text,
  add column matcha_option_name_snapshot text,
  add column matcha_option_revision_snapshot bigint,
  add column matcha_surcharge_centavos bigint not null default 0,
  add column matcha_ingredient_cost_delta_centavos bigint not null default 0,
  add column base_unit_price_centavos bigint generated always as (
    unit_price_centavos - matcha_surcharge_centavos
  ) stored,
  add column base_ingredient_unit_cost_centavos bigint generated always as (
    ingredient_unit_cost_centavos - matcha_ingredient_cost_delta_centavos
  ) stored,
  add constraint pos_sale_items_matcha_option_fk
    foreign key (business_id, product_id, matcha_option_id)
    references public.pos_product_matcha_options(business_id, product_id, id)
    on delete restrict,
  add constraint pos_sale_items_matcha_snapshot_valid check (
    (
      matcha_option_id is null
      and matcha_option_code_snapshot is null
      and matcha_option_name_snapshot is null
      and matcha_option_revision_snapshot is null
      and matcha_surcharge_centavos = 0
      and matcha_ingredient_cost_delta_centavos = 0
    )
    or
    (
      matcha_option_id is not null
      and matcha_option_code_snapshot is not null
      and matcha_option_code_snapshot ~ '^[a-z][a-z0-9_]{0,39}$'
      and matcha_option_name_snapshot is not null
      and char_length(btrim(matcha_option_name_snapshot)) between 1 and 120
      and matcha_option_revision_snapshot is not null
      and matcha_option_revision_snapshot > 0
      and matcha_surcharge_centavos > 0
      and matcha_ingredient_cost_delta_centavos >= 0
    )
  ),
  add constraint pos_sale_items_matcha_price_valid check (
    unit_price_centavos >= matcha_surcharge_centavos
  ),
  add constraint pos_sale_items_matcha_cost_valid check (
    ingredient_unit_cost_centavos >= matcha_ingredient_cost_delta_centavos
  );

alter table public.pos_products
  add column image_object_path text,
  add constraint pos_products_image_object_path_valid check (
    image_object_path is null
    or image_object_path ~ (
      '^' || business_id::text || '/' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
    )
  );

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'pos-product-images', 'pos-product-images', true, 2097152,
  array['image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'pos_product_images_bucket_owner',
  jsonb_build_object('owner', 'pos_schema_9', 'version', 1),
  pg_catalog.clock_timestamp()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

-- Storage policies deliberately grant upload and delete only. The narrow
-- SELECT policy is required by Storage's upload/delete internals and uses the
-- official operation helper, so it is false for object.list/PostgREST reads.
-- The bucket itself handles public delivery for already-known object URLs.
-- An attached path must be detached through pos_set_product_image before its
-- old object can be removed. Storage DELETE and application-row attachment do
-- not share a foreign key, so clients must never run attach and cleanup for the
-- same path concurrently; immutable random paths keep that cleanup race out of
-- the normal upload/attach flow.
create policy pos_product_images_manager_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'pos-product-images'
  and case
    when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
    then public.pos_has_role(
      pg_catalog.split_part(name, '/', 1)::uuid,
      array['owner', 'manager']
    ) and exists (
      select 1
      from public.pos_products as product
      where product.business_id = pg_catalog.split_part(storage.objects.name, '/', 1)::uuid
        and product.id = pg_catalog.split_part(storage.objects.name, '/', 2)::uuid
        and product.archived_at is null
        and product.active_version_id is not null
    )
    else false
  end
);

create policy pos_product_images_manager_write_select
on storage.objects for select to authenticated
using (
  storage.allow_any_operation(array[
    'object.upload', 'object.delete', 'object.delete_many'
  ])
  and bucket_id = 'pos-product-images'
  and case
    when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
    then public.pos_has_role(
      pg_catalog.split_part(name, '/', 1)::uuid,
      array['owner', 'manager']
    ) and not exists (
      select 1
      from public.pos_products as product
      where product.business_id = pg_catalog.split_part(storage.objects.name, '/', 1)::uuid
        and product.image_object_path = storage.objects.name
    )
    else false
  end
);

create policy pos_product_images_manager_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'pos-product-images'
  and case
    when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
    then public.pos_has_role(
      pg_catalog.split_part(name, '/', 1)::uuid,
      array['owner', 'manager']
    ) and not exists (
      select 1
      from public.pos_products as product
      where product.business_id = pg_catalog.split_part(storage.objects.name, '/', 1)::uuid
        and product.image_object_path = storage.objects.name
    )
    else false
  end
);

alter table public.pos_product_matcha_options enable row level security;

create policy pos_product_matcha_options_manager_read
on public.pos_product_matcha_options for select to authenticated
using (public.pos_has_role(business_id, array['owner', 'manager']));

revoke all on table public.pos_product_matcha_options
  from public, anon, authenticated;
grant select on table public.pos_product_matcha_options to authenticated;

create or replace function public.pos_get_catalog_v2(p_business_id uuid)
returns table (
  product_id uuid,
  active_version_id uuid,
  category_id uuid,
  category_name text,
  product_name text,
  size_snapshot text,
  selling_price_centavos bigint,
  product_sort_order integer,
  category_sort_order integer,
  image_object_path text,
  matcha_upgrades jsonb
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
    coalesce(category.sort_order, 0),
    product.image_object_path,
    coalesce(upgrades.options, '[]'::jsonb)
  from public.pos_products as product
  join public.pos_product_versions as version
    on version.business_id = product.business_id
   and version.product_id = product.id
   and version.id = product.active_version_id
  left join public.pos_categories as category
    on category.business_id = product.business_id
   and category.id = product.category_id
   and category.archived_at is null
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', option.id,
        'revision', option.revision,
        'code', option.code,
        'display_name', option.display_name,
        'surcharge_centavos', option.surcharge_centavos,
        'sort_order', option.sort_order
      ) order by option.sort_order, option.display_name, option.id
    ) as options
    from public.pos_product_matcha_options as option
    where option.business_id = product.business_id
      and option.product_id = product.id
      and option.active = true
  ) as upgrades on true
  where product.business_id = p_business_id
    and product.available = true
    and product.archived_at is null
  order by coalesce(category.sort_order, 0), category.name nulls first,
           product.sort_order, version.name_snapshot, product.id;
end;
$$;

create or replace function public.pos_get_product_media(p_business_id uuid)
returns table (
  product_id uuid,
  active_version_id uuid,
  product_name text,
  size_snapshot text,
  available boolean,
  image_object_path text,
  updated_at timestamptz
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

  select member.role into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true;

  if v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'Only an owner or manager can manage product images.'
      using errcode = '42501';
  end if;

  return query
  select product.id, version.id, version.name_snapshot,
         version.size_snapshot, product.available,
         product.image_object_path, product.updated_at
  from public.pos_products as product
  join public.pos_product_versions as version
    on version.business_id = product.business_id
   and version.product_id = product.id
   and version.id = product.active_version_id
  where product.business_id = p_business_id
    and product.archived_at is null
  order by product.sort_order, version.name_snapshot, product.id;
end;
$$;

create or replace function public.pos_set_product_image(
  p_business_id uuid,
  p_product_id uuid,
  p_new_path text,
  p_expected_old_path text
)
returns table (
  product_id uuid,
  image_object_path text,
  previous_image_object_path text,
  updated_at timestamptz,
  is_retry boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_product public.pos_products%rowtype;
  v_new_path text := nullif(pg_catalog.btrim(coalesce(p_new_path, '')), '');
  v_expected_path text := nullif(pg_catalog.btrim(coalesce(p_expected_old_path, '')), '');
  v_path_pattern text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  -- Authorization precedes product/path validation to avoid an object oracle.
  select member.role into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true
  for share;

  if v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'Only an owner or manager can manage product images.'
      using errcode = '42501';
  end if;
  if p_product_id is null then
    raise exception 'A product ID is required.' using errcode = '22023';
  end if;

  select product.* into v_product
  from public.pos_products as product
  where product.business_id = p_business_id
    and product.id = p_product_id
    and product.archived_at is null
    and product.active_version_id is not null
  for update;

  if not found then
    raise exception 'The published POS product was not found.' using errcode = 'P0002';
  end if;

  v_path_pattern := '^' || p_business_id::text || '/' || p_product_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$';

  if v_new_path is not null and v_new_path !~ v_path_pattern then
    raise exception 'The new image path must be a versioned WebP object for this product.'
      using errcode = '22023';
  end if;
  if v_expected_path is not null and v_expected_path !~ v_path_pattern then
    raise exception 'The expected image path does not belong to this product.'
      using errcode = '22023';
  end if;
  if v_new_path is not null and not exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'pos-product-images'
      and object.name = v_new_path
  ) then
    raise exception 'Upload the WebP image before attaching it to the product.'
      using errcode = 'P0002';
  end if;

  -- If the response was lost, the already-applied value resolves exactly even
  -- though the caller still supplies the old compare-and-swap value.
  if v_product.image_object_path is not distinct from v_new_path then
    return query select v_product.id, v_product.image_object_path,
      v_expected_path, v_product.updated_at, true;
    return;
  end if;

  if v_product.image_object_path is distinct from v_expected_path then
    raise exception 'The product image changed on another device. Refresh and try again.'
      using errcode = '40001';
  end if;

  update public.pos_products as product
  set image_object_path = v_new_path
  where product.business_id = p_business_id
    and product.id = p_product_id
  returning product.* into v_product;

  return query select v_product.id, v_product.image_object_path,
    v_expected_path, v_product.updated_at, false;
end;
$$;

create or replace function public._pos_sale_item_summary(
  p_business_id uuid,
  p_sale_id uuid
)
returns table (
  item_count bigint,
  units_sold bigint,
  item_summary text
)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::bigint,
         coalesce(sum(item.quantity), 0)::bigint,
         string_agg(
           item.quantity::text || ' x ' || item.name_snapshot
             || case when item.size_snapshot is null then ''
                  else ' (' || item.size_snapshot || ')' end
             || case when item.matcha_option_name_snapshot is null then ''
                  else ' - ' || item.matcha_option_name_snapshot end,
           ', ' order by item.line_number
         )
  from public.pos_sale_items as item
  where item.business_id = p_business_id
    and item.sale_id = p_sale_id;
$$;

create or replace function public.pos_get_recent_sales_v2(
  p_business_id uuid,
  p_is_training boolean,
  p_limit integer
)
returns table (
  sale_id uuid,
  shift_id uuid,
  is_training boolean,
  shift_status text,
  receipt_number text,
  business_date date,
  completed_at timestamptz,
  cashier_display_name text,
  sale_state text,
  item_count bigint,
  units_sold bigint,
  item_summary text,
  gross_total_centavos bigint,
  voided_amount_centavos bigint,
  net_total_centavos bigint,
  payment_method text,
  reference_number text,
  voided_at timestamptz,
  void_reason text,
  voided_by_display_name text,
  estimated_cost_centavos bigint,
  estimated_gross_profit_centavos bigint,
  can_view_costs boolean,
  can_void boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_can_view_costs boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select member.role into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true;
  if v_role is null then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;
  if p_is_training is null then
    raise exception 'Report mode is required.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Recent-sales limit must be from 1 to 100.' using errcode = '22023';
  end if;

  v_can_view_costs := v_role in ('owner', 'manager');

  return query
  select
    sale.id, sale.shift_id, sale.is_training, shift.status,
    sale.receipt_number, sale.business_date, sale.completed_at,
    cashier.display_name,
    case when reversal.event_type = 'void_before_preparation'
      then 'voided' else 'completed' end,
    items.item_count, items.units_sold, items.item_summary,
    sale.total_centavos,
    coalesce(reversal.amount_centavos, 0)::bigint,
    sale.total_centavos - coalesce(reversal.amount_centavos, 0),
    payment.method, payment.reference_number,
    case when reversal.event_type = 'void_before_preparation'
      then reversal.created_at else null::timestamptz end,
    case when reversal.event_type = 'void_before_preparation'
      then reversal.reason else null::text end,
    case when reversal.event_type = 'void_before_preparation'
      then void_actor.display_name else null::text end,
    case when v_can_view_costs then
      case when reversal.id is null or reversal.retain_cost
        then sale.estimated_cost_centavos else 0::bigint end
      else null::bigint end,
    case when v_can_view_costs then
      sale.total_centavos - coalesce(reversal.amount_centavos, 0)
        - case when reversal.id is null or reversal.retain_cost
            then sale.estimated_cost_centavos else 0::bigint end
      else null::bigint end,
    v_can_view_costs,
    v_role in ('owner', 'manager')
      and shift.status = 'open' and reversal.id is null
  from public.pos_sales as sale
  join public.pos_shifts as shift
    on shift.business_id = sale.business_id and shift.id = sale.shift_id
  join public.pos_business_members as cashier
    on cashier.business_id = sale.business_id
   and cashier.user_id = sale.cashier_id
  join public.pos_payments as payment
    on payment.business_id = sale.business_id
   and payment.sale_id = sale.id and payment.payment_number = 1
  cross join lateral public._pos_sale_item_summary(
    sale.business_id, sale.id
  ) as items
  left join lateral (
    select event.id, event.event_type, event.amount_centavos,
           event.retain_cost, event.created_at, event.reason, event.acted_by
    from public.pos_sale_events as event
    where event.business_id = sale.business_id
      and event.sale_id = sale.id
      and event.event_type in (
        'void_before_preparation',
        'refund_before_preparation',
        'refund_after_preparation'
      )
    order by event.created_at, event.id
    limit 1
  ) as reversal on true
  left join public.pos_business_members as void_actor
    on void_actor.business_id = sale.business_id
   and void_actor.user_id = reversal.acted_by
  where sale.business_id = p_business_id
    and sale.status = 'completed'
    and sale.is_training = p_is_training
  order by sale.completed_at desc, sale.id desc
  limit p_limit;
end;
$$;

create or replace function public.pos_get_recent_sales(
  p_business_id uuid,
  p_limit integer default 20
)
returns table (
  sale_id uuid,
  receipt_number text,
  business_date date,
  completed_at timestamptz,
  cashier_display_name text,
  item_count bigint,
  units_sold bigint,
  item_summary text,
  total_centavos bigint,
  payment_method text,
  reference_number text,
  estimated_cost_centavos bigint,
  estimated_gross_profit_centavos bigint,
  can_view_costs boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_can_view_costs boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select member.role into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true;
  if v_role is null then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Recent-sales limit must be from 1 to 100.' using errcode = '22023';
  end if;

  v_can_view_costs := v_role in ('owner', 'manager');

  return query
  select
    sale.id, sale.receipt_number, sale.business_date, sale.completed_at,
    cashier.display_name, items.item_count, items.units_sold,
    case when reversal.id is null then items.item_summary
      else 'VOID - ' || items.item_summary end,
    sale.total_centavos - coalesce(reversal.amount_centavos, 0),
    payment.method, payment.reference_number,
    case when v_can_view_costs then
      case when reversal.id is null or reversal.retain_cost
        then sale.estimated_cost_centavos else 0::bigint end
      else null::bigint end,
    case when v_can_view_costs then
      sale.total_centavos - coalesce(reversal.amount_centavos, 0)
        - case when reversal.id is null or reversal.retain_cost
            then sale.estimated_cost_centavos else 0::bigint end
      else null::bigint end,
    v_can_view_costs
  from public.pos_sales as sale
  join public.pos_business_members as cashier
    on cashier.business_id = sale.business_id
   and cashier.user_id = sale.cashier_id
  join public.pos_payments as payment
    on payment.business_id = sale.business_id
   and payment.sale_id = sale.id and payment.payment_number = 1
  cross join lateral public._pos_sale_item_summary(
    sale.business_id, sale.id
  ) as items
  left join lateral (
    select event.id, event.amount_centavos, event.retain_cost
    from public.pos_sale_events as event
    where event.business_id = sale.business_id
      and event.sale_id = sale.id
      and event.event_type in (
        'void_before_preparation',
        'refund_before_preparation',
        'refund_after_preparation'
      )
    order by event.created_at, event.id
    limit 1
  ) as reversal on true
  where sale.business_id = p_business_id
    and sale.status = 'completed'
    and sale.is_training = false
  order by sale.completed_at desc, sale.id desc
  limit p_limit;
end;
$$;

create or replace function public.pos_get_sales_history_page(
  p_business_id uuid,
  p_is_training boolean,
  p_before_completed_at timestamptz,
  p_before_sale_id uuid,
  p_limit integer
)
returns table (
  sale_id uuid,
  shift_id uuid,
  is_training boolean,
  shift_status text,
  receipt_number text,
  business_date date,
  completed_at timestamptz,
  cashier_display_name text,
  sale_state text,
  item_count bigint,
  units_sold bigint,
  item_summary text,
  gross_total_centavos bigint,
  voided_amount_centavos bigint,
  net_total_centavos bigint,
  payment_method text,
  reference_number text,
  voided_at timestamptz,
  void_reason text,
  voided_by_display_name text,
  estimated_cost_centavos bigint,
  estimated_gross_profit_centavos bigint,
  can_view_costs boolean,
  can_void boolean,
  has_more boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_can_view_costs boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select member.role into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true;

  if v_role is null then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;
  if p_is_training is null then
    raise exception 'History mode is required.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Sales-history page limit must be from 1 to 100.'
      using errcode = '22023';
  end if;
  if (p_before_completed_at is null) <> (p_before_sale_id is null) then
    raise exception 'Sales-history cursor time and sale ID must be provided together.'
      using errcode = '22023';
  end if;

  v_can_view_costs := v_role in ('owner', 'manager');

  return query
  with candidate_sales as (
    select sale.id, sale.business_id, sale.shift_id, sale.is_training,
           sale.receipt_number, sale.business_date, sale.completed_at,
           sale.cashier_id, sale.total_centavos,
           sale.estimated_cost_centavos
    from public.pos_sales as sale
    where sale.business_id = p_business_id
      and sale.status = 'completed'
      and sale.is_training = p_is_training
      and (
        p_before_completed_at is null
        or (sale.completed_at, sale.id)
          < (p_before_completed_at, p_before_sale_id)
      )
    order by sale.completed_at desc, sale.id desc
    limit p_limit + 1
  ), page_sales as (
    select candidate.*
    from candidate_sales as candidate
    order by candidate.completed_at desc, candidate.id desc
    limit p_limit
  ), page_state as (
    select (count(*) > p_limit) as has_more
    from candidate_sales
  )
  select
    sale.id,
    sale.shift_id,
    sale.is_training,
    shift.status,
    sale.receipt_number,
    sale.business_date,
    sale.completed_at,
    cashier.display_name,
    case when reversal.event_type = 'void_before_preparation'
      then 'voided' else 'completed' end,
    items.item_count,
    items.units_sold,
    items.item_summary,
    sale.total_centavos,
    coalesce(reversal.amount_centavos, 0)::bigint,
    sale.total_centavos - coalesce(reversal.amount_centavos, 0),
    payment.method,
    payment.reference_number,
    case when reversal.event_type = 'void_before_preparation'
      then reversal.created_at else null::timestamptz end,
    case when reversal.event_type = 'void_before_preparation'
      then reversal.reason else null::text end,
    case when reversal.event_type = 'void_before_preparation'
      then void_actor.display_name else null::text end,
    case when v_can_view_costs then
      case when reversal.id is null or reversal.retain_cost
        then sale.estimated_cost_centavos else 0::bigint end
      else null::bigint end,
    case when v_can_view_costs then
      sale.total_centavos - coalesce(reversal.amount_centavos, 0)
        - case when reversal.id is null or reversal.retain_cost
            then sale.estimated_cost_centavos else 0::bigint end
      else null::bigint end,
    v_can_view_costs,
    v_role in ('owner', 'manager')
      and shift.status = 'open' and reversal.id is null,
    page_state.has_more
  from page_sales as sale
  join public.pos_shifts as shift
    on shift.business_id = sale.business_id and shift.id = sale.shift_id
  join public.pos_business_members as cashier
    on cashier.business_id = sale.business_id
   and cashier.user_id = sale.cashier_id
  join public.pos_payments as payment
    on payment.business_id = sale.business_id
   and payment.sale_id = sale.id and payment.payment_number = 1
  cross join lateral public._pos_sale_item_summary(
    sale.business_id, sale.id
  ) as items
  left join lateral (
    select event.id, event.event_type, event.amount_centavos,
           event.retain_cost, event.created_at, event.reason, event.acted_by
    from public.pos_sale_events as event
    where event.business_id = sale.business_id
      and event.sale_id = sale.id
      and event.event_type in (
        'void_before_preparation',
        'refund_before_preparation',
        'refund_after_preparation'
      )
    order by event.created_at, event.id
    limit 1
  ) as reversal on true
  left join public.pos_business_members as void_actor
    on void_actor.business_id = sale.business_id
   and void_actor.user_id = reversal.acted_by
  cross join page_state
  order by sale.completed_at desc, sale.id desc;
end;
$$;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object(
    'version', 9,
    'name', 'pos_matcha_upgrades_and_product_media'
  ),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

revoke all on function public.pos_protect_matcha_option()
  from public, anon, authenticated;
revoke all on function public._pos_phase4_complete_sale_v3(
  uuid, uuid, boolean, uuid, jsonb, text, bigint, text, text
) from public, anon, authenticated;
revoke all on function public._pos_sale_item_summary(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.pos_complete_shift_sale_v3(
  uuid, uuid, boolean, uuid, jsonb, text, bigint, text, text
) from public, anon, authenticated;
revoke all on function public.pos_get_catalog_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.pos_get_product_media(uuid)
  from public, anon, authenticated;
revoke all on function public.pos_set_product_image(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.pos_complete_shift_sale_v3(
  uuid, uuid, boolean, uuid, jsonb, text, bigint, text, text
) to authenticated;
grant execute on function public.pos_get_catalog_v2(uuid) to authenticated;
grant execute on function public.pos_get_product_media(uuid) to authenticated;
grant execute on function public.pos_set_product_image(uuid, uuid, text, text)
  to authenticated;

-- Replacing these functions retains their existing ACLs in PostgreSQL, but
-- state the intended browser surface explicitly for review and fresh restores.
revoke all on function public.pos_get_recent_sales(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.pos_get_recent_sales_v2(uuid, boolean, integer)
  from public, anon, authenticated;
revoke all on function public.pos_get_sales_history_page(
  uuid, boolean, timestamptz, uuid, integer
) from public, anon, authenticated;
grant execute on function public.pos_get_recent_sales(uuid, integer)
  to authenticated;
grant execute on function public.pos_get_recent_sales_v2(uuid, boolean, integer)
  to authenticated;
grant execute on function public.pos_get_sales_history_page(
  uuid, boolean, timestamptz, uuid, integer
) to authenticated;

comment on table public.pos_product_matcha_options is
  'Server-owned, product-specific Matcha upgrade prices. Browser checkout sends only an option ID/revision; price and cost deltas are derived here.';
comment on column public.pos_products.image_object_path is
  'Versioned WebP object name in the public pos-product-images bucket; bytes remain in Supabase Storage.';
comment on function public.pos_get_catalog_v2(uuid) is
  'Cashier-safe active catalog with public image object paths and server-priced Matcha upgrade choices. Cost deltas are omitted.';
comment on function public.pos_complete_shift_sale_v3(
  uuid, uuid, boolean, uuid, jsonb, text, bigint, text, text
) is
  'Atomic schema-3 checkout with server-validated product-specific Matcha options and immutable price/cost/name snapshots.';
comment on function public.pos_get_product_media(uuid) is
  'Owner/manager media list for every nonarchived published product, including unavailable products.';
comment on function public.pos_set_product_image(uuid, uuid, text, text) is
  'Owner/manager optimistic image attachment. Upload first, compare-and-swap the versioned path, then delete the prior object.';

commit;
