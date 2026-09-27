-- Scoopie's POS Phase 1: additive database foundation
--
-- This migration intentionally does not alter public.scoopies_state or
-- public.scoopies_activity. Costing remains in its existing JSON document.
-- Apply this file once through the Supabase SQL Editor or Supabase CLI.

begin;

create extension if not exists pgcrypto;

create table public.pos_system_metadata (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.pos_system_metadata (key, value)
values ('schema_version', jsonb_build_object('version', 1, 'name', 'pos_phase_1_foundation'));

create table public.pos_businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  timezone text not null default 'Asia/Manila',
  currency_code text not null default 'PHP' check (currency_code = 'PHP'),
  receipt_prefix text not null default 'SCP'
    check (receipt_prefix ~ '^[A-Z0-9]{2,8}$' and receipt_prefix <> 'TRN'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pos_business_members (
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('owner', 'manager', 'cashier')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index pos_business_members_user_idx
  on public.pos_business_members (user_id, active);

create table public.pos_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  starts_on date,
  ends_on date,
  status text not null default 'planning'
    check (status in ('planning', 'active', 'closed', 'archived')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  foreign key (business_id, created_by)
    references public.pos_business_members(business_id, user_id) on delete restrict
);

create index pos_events_business_dates_idx
  on public.pos_events (business_id, starts_on, ends_on);

create table public.pos_registers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  active boolean not null default true,
  archived_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, created_by)
    references public.pos_business_members(business_id, user_id) on delete restrict
);

create unique index pos_registers_business_name_uq
  on public.pos_registers (business_id, lower(name))
  where archived_at is null;

create table public.pos_shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  register_id uuid not null,
  event_id uuid,
  status text not null default 'open' check (status in ('open', 'closed')),
  is_training boolean not null default false,
  opening_cash_centavos bigint not null default 0
    check (opening_cash_centavos between 0 and 100000000000),
  expected_cash_centavos bigint,
  counted_cash_centavos bigint,
  cash_variance_centavos bigint generated always as (
    case
      when expected_cash_centavos is null or counted_cash_centavos is null then null
      else counted_cash_centavos - expected_cash_centavos
    end
  ) stored,
  expected_gcash_centavos bigint,
  verified_gcash_centavos bigint,
  gcash_variance_centavos bigint generated always as (
    case
      when expected_gcash_centavos is null or verified_gcash_centavos is null then null
      else verified_gcash_centavos - expected_gcash_centavos
    end
  ) stored,
  expected_gotyme_centavos bigint,
  verified_gotyme_centavos bigint,
  gotyme_variance_centavos bigint generated always as (
    case
      when expected_gotyme_centavos is null or verified_gotyme_centavos is null then null
      else verified_gotyme_centavos - expected_gotyme_centavos
    end
  ) stored,
  opened_by uuid not null,
  opened_at timestamptz not null default now(),
  closed_by uuid,
  closed_at timestamptz,
  close_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, id, is_training),
  foreign key (business_id, register_id)
    references public.pos_registers(business_id, id) on delete restrict,
  foreign key (business_id, event_id)
    references public.pos_events(business_id, id) on delete restrict,
  foreign key (business_id, opened_by)
    references public.pos_business_members(business_id, user_id) on delete restrict,
  foreign key (business_id, closed_by)
    references public.pos_business_members(business_id, user_id) on delete restrict,
  check (expected_cash_centavos is null or expected_cash_centavos between 0 and 100000000000),
  check (counted_cash_centavos is null or counted_cash_centavos between 0 and 100000000000),
  check (expected_gcash_centavos is null or expected_gcash_centavos between 0 and 100000000000),
  check (verified_gcash_centavos is null or verified_gcash_centavos between 0 and 100000000000),
  check (expected_gotyme_centavos is null or expected_gotyme_centavos between 0 and 100000000000),
  check (verified_gotyme_centavos is null or verified_gotyme_centavos between 0 and 100000000000),
  check (
    (status = 'open' and closed_by is null and closed_at is null)
    or
    (status = 'closed' and closed_by is not null and closed_at is not null
      and expected_cash_centavos is not null and counted_cash_centavos is not null
      and expected_gcash_centavos is not null and verified_gcash_centavos is not null
      and expected_gotyme_centavos is not null and verified_gotyme_centavos is not null)
  )
);

create unique index pos_shifts_one_open_per_register_uq
  on public.pos_shifts (business_id, register_id)
  where status = 'open';

create index pos_shifts_business_opened_idx
  on public.pos_shifts (business_id, opened_at desc);

create table public.pos_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, created_by)
    references public.pos_business_members(business_id, user_id) on delete restrict
);

create unique index pos_categories_business_name_uq
  on public.pos_categories (business_id, lower(name))
  where archived_at is null;

create index pos_categories_business_sort_idx
  on public.pos_categories (business_id, sort_order, name);

create table public.pos_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  source_costing_product_id text,
  category_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  sort_order integer not null default 0,
  available boolean not null default true,
  active_version_id uuid,
  archived_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, category_id)
    references public.pos_categories(business_id, id) on delete restrict,
  foreign key (business_id, created_by)
    references public.pos_business_members(business_id, user_id) on delete restrict
);

create unique index pos_products_source_costing_uq
  on public.pos_products (business_id, source_costing_product_id)
  where source_costing_product_id is not null;

create index pos_products_catalog_idx
  on public.pos_products (business_id, category_id, sort_order, name)
  where archived_at is null;

create table public.pos_product_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  product_id uuid not null,
  version_number integer not null check (version_number > 0),
  name_snapshot text not null check (char_length(btrim(name_snapshot)) between 1 and 120),
  size_snapshot text,
  selling_price_centavos bigint not null
    check (selling_price_centavos between 1 and 100000000000),
  ingredient_cost_centavos bigint not null default 0
    check (ingredient_cost_centavos between 0 and 100000000000),
  packaging_cost_centavos bigint not null default 0
    check (packaging_cost_centavos between 0 and 100000000000),
  estimated_unit_cost_centavos bigint generated always as (
    ingredient_cost_centavos + packaging_cost_centavos
  ) stored,
  source_costing_recipe_id text,
  source_costing_hash text not null,
  costing_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(costing_snapshot) = 'object'),
  published_by uuid not null,
  published_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, product_id, id),
  unique (product_id, version_number),
  foreign key (business_id, product_id)
    references public.pos_products(business_id, id) on delete restrict,
  foreign key (business_id, published_by)
    references public.pos_business_members(business_id, user_id) on delete restrict,
  check (ingredient_cost_centavos + packaging_cost_centavos <= 100000000000)
);

alter table public.pos_products
  add constraint pos_products_active_version_fk
  foreign key (business_id, id, active_version_id)
  references public.pos_product_versions(business_id, product_id, id)
  on delete restrict;

create index pos_product_versions_product_idx
  on public.pos_product_versions (business_id, product_id, published_at desc);

create table public.pos_receipt_counters (
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  business_date date not null,
  is_training boolean not null,
  last_number bigint not null check (last_number > 0),
  updated_at timestamptz not null default now(),
  primary key (business_id, business_date, is_training)
);

create table public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  shift_id uuid not null,
  client_sale_id uuid not null,
  request_fingerprint text not null check (char_length(request_fingerprint) between 16 and 200),
  status text not null default 'open' check (status in ('open', 'completed')),
  entry_mode text not null default 'live' check (entry_mode in ('live', 'late_entry')),
  is_training boolean not null,
  business_date date,
  receipt_sequence bigint,
  receipt_number text,
  currency_code text not null default 'PHP' check (currency_code = 'PHP'),
  subtotal_centavos bigint not null default 0
    check (subtotal_centavos between 0 and 100000000000),
  discount_centavos bigint not null default 0
    check (discount_centavos between 0 and 100000000000),
  total_centavos bigint not null default 0
    check (total_centavos between 0 and 100000000000),
  estimated_cost_centavos bigint not null default 0
    check (estimated_cost_centavos between 0 and 100000000000),
  cashier_id uuid not null,
  note text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (business_id, id),
  unique (business_id, client_sale_id),
  unique (business_id, receipt_number),
  unique (business_id, business_date, is_training, receipt_sequence),
  foreign key (business_id, shift_id, is_training)
    references public.pos_shifts(business_id, id, is_training) on delete restrict,
  foreign key (business_id, cashier_id)
    references public.pos_business_members(business_id, user_id) on delete restrict,
  check (discount_centavos <= subtotal_centavos),
  check (total_centavos = subtotal_centavos - discount_centavos),
  check (
    (status = 'open' and business_date is null and receipt_sequence is null
      and receipt_number is null and completed_at is null)
    or
    (status = 'completed' and business_date is not null and receipt_sequence is not null
      and receipt_sequence > 0 and receipt_number is not null and completed_at is not null)
  )
);

create index pos_sales_business_completed_idx
  on public.pos_sales (business_id, is_training, completed_at desc)
  where status = 'completed';

create index pos_sales_shift_idx
  on public.pos_sales (business_id, shift_id, completed_at desc);

create index pos_sales_cashier_idx
  on public.pos_sales (business_id, cashier_id, completed_at desc);

create table public.pos_sale_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  sale_id uuid not null,
  line_number integer not null check (line_number > 0),
  product_id uuid not null,
  product_version_id uuid not null,
  name_snapshot text not null check (char_length(btrim(name_snapshot)) between 1 and 120),
  size_snapshot text,
  quantity integer not null check (quantity between 1 and 10000),
  unit_price_centavos bigint not null
    check (unit_price_centavos between 1 and 100000000000),
  ingredient_unit_cost_centavos bigint not null default 0
    check (ingredient_unit_cost_centavos between 0 and 100000000000),
  packaging_unit_cost_centavos bigint not null default 0
    check (packaging_unit_cost_centavos between 0 and 100000000000),
  line_discount_centavos bigint not null default 0
    check (line_discount_centavos between 0 and 100000000000),
  gross_amount_centavos bigint generated always as (
    unit_price_centavos * quantity
  ) stored,
  line_total_centavos bigint generated always as (
    (unit_price_centavos * quantity) - line_discount_centavos
  ) stored,
  estimated_line_cost_centavos bigint generated always as (
    (ingredient_unit_cost_centavos + packaging_unit_cost_centavos) * quantity
  ) stored,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (sale_id, line_number),
  foreign key (business_id, sale_id)
    references public.pos_sales(business_id, id) on delete restrict,
  foreign key (business_id, product_id)
    references public.pos_products(business_id, id) on delete restrict,
  foreign key (business_id, product_id, product_version_id)
    references public.pos_product_versions(business_id, product_id, id) on delete restrict,
  check (line_discount_centavos <= unit_price_centavos * quantity),
  check (unit_price_centavos * quantity <= 100000000000),
  check ((ingredient_unit_cost_centavos + packaging_unit_cost_centavos) * quantity <= 100000000000)
);

create index pos_sale_items_sale_idx
  on public.pos_sale_items (business_id, sale_id, line_number);

create index pos_sale_items_product_idx
  on public.pos_sale_items (business_id, product_id);

create table public.pos_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  sale_id uuid not null,
  payment_number integer not null default 1 check (payment_number > 0),
  method text not null check (method in ('cash', 'gcash', 'gotyme')),
  amount_centavos bigint not null
    check (amount_centavos between 1 and 100000000000),
  processor_fee_centavos bigint not null default 0
    check (processor_fee_centavos between 0 and 100000000000),
  cash_tendered_centavos bigint,
  change_given_centavos bigint,
  reference_number text,
  confirmed_by uuid not null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (sale_id, payment_number),
  foreign key (business_id, sale_id)
    references public.pos_sales(business_id, id) on delete restrict,
  foreign key (business_id, confirmed_by)
    references public.pos_business_members(business_id, user_id) on delete restrict,
  check (processor_fee_centavos <= amount_centavos),
  check (
    (method = 'cash'
      and cash_tendered_centavos is not null
      and change_given_centavos is not null
      and cash_tendered_centavos >= amount_centavos
      and change_given_centavos = cash_tendered_centavos - amount_centavos)
    or
    (method in ('gcash', 'gotyme')
      and cash_tendered_centavos is null
      and change_given_centavos is null)
  )
);

create index pos_payments_sale_idx
  on public.pos_payments (business_id, sale_id);

create index pos_payments_method_idx
  on public.pos_payments (business_id, method, confirmed_at desc);

create table public.pos_sale_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  sale_id uuid not null,
  event_type text not null check (event_type in (
    'completed',
    'void_before_preparation',
    'refund_before_preparation',
    'refund_after_preparation',
    'waste',
    'payment_correction'
  )),
  amount_centavos bigint not null default 0
    check (amount_centavos between 0 and 100000000000),
  payment_method text check (payment_method is null or payment_method in ('cash', 'gcash', 'gotyme')),
  retain_cost boolean not null default true,
  reference_number text,
  reason text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  acted_by uuid not null,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, sale_id)
    references public.pos_sales(business_id, id) on delete restrict,
  foreign key (business_id, acted_by)
    references public.pos_business_members(business_id, user_id) on delete restrict,
  check (event_type = 'completed' or (reason is not null and char_length(btrim(reason)) > 0)),
  check (event_type <> 'void_before_preparation' or retain_cost = false),
  check (event_type <> 'refund_after_preparation' or retain_cost = true),
  check (
    event_type in ('completed', 'waste', 'payment_correction')
    or (amount_centavos > 0 and payment_method is not null)
  )
);

create index pos_sale_events_sale_idx
  on public.pos_sale_events (business_id, sale_id, created_at);

create table public.pos_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  shift_id uuid,
  event_id uuid,
  is_training boolean not null default false,
  category text not null check (char_length(btrim(category)) between 1 and 80),
  description text not null check (char_length(btrim(description)) between 1 and 240),
  payment_source text not null check (payment_source in ('cash', 'gcash', 'gotyme', 'other')),
  amount_centavos bigint not null
    check (amount_centavos between 1 and 100000000000),
  incurred_at timestamptz not null default now(),
  business_date date not null,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, shift_id, is_training)
    references public.pos_shifts(business_id, id, is_training) on delete restrict,
  foreign key (business_id, event_id)
    references public.pos_events(business_id, id) on delete restrict,
  foreign key (business_id, recorded_by)
    references public.pos_business_members(business_id, user_id) on delete restrict
);

create index pos_expenses_business_date_idx
  on public.pos_expenses (business_id, is_training, business_date, incurred_at);

create table public.pos_cash_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  shift_id uuid not null,
  is_training boolean not null,
  movement_type text not null check (movement_type in ('pay_in', 'pay_out')),
  amount_centavos bigint not null
    check (amount_centavos between 1 and 100000000000),
  reason text not null check (char_length(btrim(reason)) between 1 and 240),
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, shift_id, is_training)
    references public.pos_shifts(business_id, id, is_training) on delete restrict,
  foreign key (business_id, recorded_by)
    references public.pos_business_members(business_id, user_id) on delete restrict
);

create index pos_cash_movements_shift_idx
  on public.pos_cash_movements (business_id, shift_id, created_at);

-- Membership checks are SECURITY DEFINER to avoid recursive RLS evaluation.
-- Every object is schema-qualified and the search path is empty.
create or replace function public.pos_is_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pos_business_members as member
    where member.business_id = p_business_id
      and member.user_id = auth.uid()
      and member.active = true
  );
$$;

create or replace function public.pos_has_role(p_business_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pos_business_members as member
    where member.business_id = p_business_id
      and member.user_id = auth.uid()
      and member.active = true
      and member.role = any(p_roles)
  );
$$;

-- Idempotent first-owner bootstrap. It never enrolls a user into somebody
-- else's business; an authenticated caller only creates their own workspace.
create or replace function public.pos_bootstrap_business(
  p_name text,
  p_receipt_prefix text default 'SCP',
  p_timezone text default 'Asia/Manila'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_email text;
  v_display_name text;
  v_prefix text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  -- Prevent two tabs from creating two workspaces for the same first owner.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select member.business_id
    into v_business_id
  from public.pos_business_members as member
  where member.user_id = v_user_id
    and member.active = true
  order by member.joined_at
  limit 1;

  if v_business_id is not null then
    return v_business_id;
  end if;

  if p_name is null or char_length(pg_catalog.btrim(p_name)) not between 1 and 120 then
    raise exception 'Business name is required.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_timezone_names as zone where zone.name = p_timezone
  ) then
    raise exception 'Unknown timezone: %', p_timezone using errcode = '22023';
  end if;

  v_prefix := pg_catalog.upper(
    pg_catalog.regexp_replace(coalesce(p_receipt_prefix, ''), '[^A-Za-z0-9]', '', 'g')
  );
  if char_length(v_prefix) not between 2 and 8 or v_prefix = 'TRN' then
    raise exception 'Receipt prefix must contain 2 to 8 letters or numbers and cannot be TRN.'
      using errcode = '22023';
  end if;

  select account.email
    into v_email
  from auth.users as account
  where account.id = v_user_id;

  v_display_name := coalesce(
    nullif(pg_catalog.split_part(v_email, '@', 1), ''),
    'Owner'
  );

  insert into public.pos_businesses (
    name, timezone, receipt_prefix, created_by
  ) values (
    pg_catalog.btrim(p_name), p_timezone, v_prefix, v_user_id
  ) returning id into v_business_id;

  insert into public.pos_business_members (
    business_id, user_id, role, display_name
  ) values (
    v_business_id, v_user_id, 'owner', v_display_name
  );

  insert into public.pos_registers (
    business_id, name, created_by
  ) values (
    v_business_id, 'Main register', v_user_id
  );

  return v_business_id;
end;
$$;

-- Owner-only helper for the existing partner account. It requires an exact
-- email match and does not expose a searchable user directory.
create or replace function public.pos_add_member_by_email(
  p_business_id uuid,
  p_email text,
  p_role text default 'cashier',
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_display_name text;
  v_existing_role text;
  v_existing_active boolean;
begin
  if not public.pos_has_role(p_business_id, array['owner']) then
    raise exception 'Only an owner can add or change members.' using errcode = '42501';
  end if;

  -- Serialize membership changes for this business, then re-check the caller's
  -- authority so two simultaneous owner changes cannot remove every owner.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_business_id::text, 1)
  );

  if not public.pos_has_role(p_business_id, array['owner']) then
    raise exception 'Only an owner can add or change members.' using errcode = '42501';
  end if;

  if p_role not in ('owner', 'manager', 'cashier') then
    raise exception 'Unknown POS role.' using errcode = '22023';
  end if;

  select account.id
    into v_user_id
  from auth.users as account
  where pg_catalog.lower(account.email) = v_email
  limit 1;

  if v_user_id is null then
    raise exception 'No existing account matches that email.' using errcode = 'P0002';
  end if;

  select member.role, member.active
    into v_existing_role, v_existing_active
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id;

  if p_role <> 'owner'
    and v_existing_role = 'owner'
    and v_existing_active = true
    and (
      select count(*)
      from public.pos_business_members as owner_member
      where owner_member.business_id = p_business_id
        and owner_member.role = 'owner'
        and owner_member.active = true
    ) = 1 then
    raise exception 'The last active owner cannot be demoted.' using errcode = '55000';
  end if;

  v_display_name := coalesce(
    nullif(pg_catalog.btrim(p_display_name), ''),
    nullif(pg_catalog.split_part(v_email, '@', 1), ''),
    'Staff'
  );

  insert into public.pos_business_members (
    business_id, user_id, role, display_name, active
  ) values (
    p_business_id, v_user_id, p_role, v_display_name, true
  )
  on conflict (business_id, user_id) do update
    set role = excluded.role,
        display_name = excluded.display_name,
        active = true,
        updated_at = pg_catalog.now();

  return v_user_id;
end;
$$;

-- Internal, concurrency-safe receipt allocator for the Phase 3 checkout RPC.
-- It is deliberately not executable by browser roles.
create or replace function public.pos_allocate_receipt(
  p_business_id uuid,
  p_is_training boolean,
  p_occurred_at timestamptz default now()
)
returns table (business_date date, receipt_sequence bigint, receipt_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_prefix text;
  v_business_date date;
  v_sequence bigint;
begin
  select business.timezone, business.receipt_prefix
    into strict v_timezone, v_prefix
  from public.pos_businesses as business
  where business.id = p_business_id;

  v_business_date := (pg_catalog.timezone(v_timezone, p_occurred_at))::date;

  insert into public.pos_receipt_counters (
    business_id, business_date, is_training, last_number
  ) values (
    p_business_id, v_business_date, p_is_training, 1
  )
  on conflict on constraint pos_receipt_counters_pkey do update
    set last_number = public.pos_receipt_counters.last_number + 1,
        updated_at = pg_catalog.now()
  returning last_number into v_sequence;

  if p_is_training then
    v_prefix := 'TRN';
  end if;

  return query
    select
      v_business_date,
      v_sequence,
      v_prefix || '-' || pg_catalog.to_char(v_business_date, 'YYYYMMDD') || '-'
        || pg_catalog.lpad(
          v_sequence::text,
          greatest(4, pg_catalog.length(v_sequence::text)),
          '0'
        );
end;
$$;

create or replace function public.pos_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger pos_businesses_touch_updated_at
before update on public.pos_businesses
for each row execute function public.pos_set_updated_at();

create trigger pos_business_members_touch_updated_at
before update on public.pos_business_members
for each row execute function public.pos_set_updated_at();

create trigger pos_events_touch_updated_at
before update on public.pos_events
for each row execute function public.pos_set_updated_at();

create trigger pos_registers_touch_updated_at
before update on public.pos_registers
for each row execute function public.pos_set_updated_at();

create trigger pos_shifts_touch_updated_at
before update on public.pos_shifts
for each row execute function public.pos_set_updated_at();

create trigger pos_categories_touch_updated_at
before update on public.pos_categories
for each row execute function public.pos_set_updated_at();

create trigger pos_products_touch_updated_at
before update on public.pos_products
for each row execute function public.pos_set_updated_at();

create or replace function public.pos_forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only; create a new record or audited event instead.', tg_table_name
    using errcode = '55000';
end;
$$;

create trigger pos_product_versions_immutable
before update or delete on public.pos_product_versions
for each row execute function public.pos_forbid_mutation();

create trigger pos_sale_items_immutable
before update or delete on public.pos_sale_items
for each row execute function public.pos_forbid_mutation();

create trigger pos_payments_immutable
before update or delete on public.pos_payments
for each row execute function public.pos_forbid_mutation();

create or replace function public.pos_require_open_sale()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  -- This row lock serializes child inserts with the open-to-completed update.
  -- Once completion wins the lock, no later item or payment can be appended.
  select sale.status
    into v_status
  from public.pos_sales as sale
  where sale.business_id = new.business_id
    and sale.id = new.sale_id
  for update;

  if v_status is null then
    raise exception 'The parent sale does not exist.' using errcode = '23503';
  end if;

  if v_status <> 'open' then
    raise exception 'Items and payments can only be added to an open sale.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger pos_sale_items_require_open_sale
before insert on public.pos_sale_items
for each row execute function public.pos_require_open_sale();

create trigger pos_payments_require_open_sale
before insert on public.pos_payments
for each row execute function public.pos_require_open_sale();

create trigger pos_sale_events_immutable
before update or delete on public.pos_sale_events
for each row execute function public.pos_forbid_mutation();

create trigger pos_expenses_immutable
before update or delete on public.pos_expenses
for each row execute function public.pos_forbid_mutation();

create trigger pos_cash_movements_immutable
before update or delete on public.pos_cash_movements
for each row execute function public.pos_forbid_mutation();

create or replace function public.pos_protect_sale()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_item_count bigint;
  v_payment_count bigint;
  v_subtotal numeric;
  v_discount numeric;
  v_total numeric;
  v_cost numeric;
  v_payment_total numeric;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'open' then
      raise exception 'A sale must be created as open.' using errcode = '55000';
    end if;

    if new.subtotal_centavos <> 0
      or new.discount_centavos <> 0
      or new.total_centavos <> 0
      or new.estimated_cost_centavos <> 0 then
      raise exception 'A new open sale must start with zero header totals.'
        using errcode = '55000';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Sales cannot be deleted; use an audited sale event.' using errcode = '55000';
  end if;

  if old.status = 'completed' then
    raise exception 'Completed sales are immutable; use an audited sale event.' using errcode = '55000';
  end if;

  if new.business_id is distinct from old.business_id
    or new.shift_id is distinct from old.shift_id
    or new.client_sale_id is distinct from old.client_sale_id
    or new.request_fingerprint is distinct from old.request_fingerprint
    or new.entry_mode is distinct from old.entry_mode
    or new.is_training is distinct from old.is_training
    or new.currency_code is distinct from old.currency_code
    or new.cashier_id is distinct from old.cashier_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Sale identity fields cannot be changed.' using errcode = '55000';
  end if;

  if new.status = 'open' then
    if new.subtotal_centavos <> 0
      or new.discount_centavos <> 0
      or new.total_centavos <> 0
      or new.estimated_cost_centavos <> 0 then
      raise exception 'An open sale must keep zero header totals.' using errcode = '55000';
    end if;

    return new;
  end if;

  if old.status <> 'open' or new.status <> 'completed' then
    raise exception 'A sale can only transition from open to completed.' using errcode = '55000';
  end if;

  select
    count(*),
    coalesce(sum(item.gross_amount_centavos), 0),
    coalesce(sum(item.line_discount_centavos), 0),
    coalesce(sum(item.line_total_centavos), 0),
    coalesce(sum(item.estimated_line_cost_centavos), 0)
  into v_item_count, v_subtotal, v_discount, v_total, v_cost
  from public.pos_sale_items as item
  where item.business_id = old.business_id
    and item.sale_id = old.id;

  if v_item_count = 0 then
    raise exception 'A sale needs at least one item before completion.'
      using errcode = '23514';
  end if;

  if v_subtotal > 100000000000
    or v_discount > 100000000000
    or v_total > 100000000000
    or v_cost > 100000000000 then
    raise exception 'Computed sale totals exceed the supported amount.'
      using errcode = '22003';
  end if;

  select count(*), coalesce(sum(payment.amount_centavos), 0)
    into v_payment_count, v_payment_total
  from public.pos_payments as payment
  where payment.business_id = old.business_id
    and payment.sale_id = old.id;

  if v_payment_count = 0 then
    raise exception 'A sale needs at least one confirmed payment before completion.'
      using errcode = '23514';
  end if;

  if v_payment_total <> v_total then
    raise exception 'Payment total (%) must equal sale total (%).', v_payment_total, v_total
      using errcode = '23514';
  end if;

  if not (
    (
      new.subtotal_centavos = 0
      and new.discount_centavos = 0
      and new.total_centavos = 0
      and new.estimated_cost_centavos = 0
    )
    or (
      new.subtotal_centavos = v_subtotal
      and new.discount_centavos = v_discount
      and new.total_centavos = v_total
      and new.estimated_cost_centavos = v_cost
    )
  ) then
    raise exception 'Submitted sale header totals do not match the sale items.'
      using errcode = '55000';
  end if;

  -- Header amounts and completion time are database-derived, not trusted from
  -- a browser payload.
  new.subtotal_centavos := v_subtotal;
  new.discount_centavos := v_discount;
  new.total_centavos := v_total;
  new.estimated_cost_centavos := v_cost;
  new.completed_at := pg_catalog.clock_timestamp();

  return new;
end;
$$;

create trigger pos_sales_protected
before insert or update or delete on public.pos_sales
for each row execute function public.pos_protect_sale();

-- Row Level Security: browser users see only their business. Financial base
-- tables expose full cost details only to managers/owners. Cashier-safe read
-- RPCs will be added with the POS UI phases.
alter table public.pos_system_metadata enable row level security;
alter table public.pos_businesses enable row level security;
alter table public.pos_business_members enable row level security;
alter table public.pos_events enable row level security;
alter table public.pos_registers enable row level security;
alter table public.pos_shifts enable row level security;
alter table public.pos_categories enable row level security;
alter table public.pos_products enable row level security;
alter table public.pos_product_versions enable row level security;
alter table public.pos_receipt_counters enable row level security;
alter table public.pos_sales enable row level security;
alter table public.pos_sale_items enable row level security;
alter table public.pos_payments enable row level security;
alter table public.pos_sale_events enable row level security;
alter table public.pos_expenses enable row level security;
alter table public.pos_cash_movements enable row level security;

create policy pos_metadata_authenticated_read
on public.pos_system_metadata for select to authenticated
using (true);

create policy pos_businesses_member_read
on public.pos_businesses for select to authenticated
using (public.pos_is_member(id));

create policy pos_business_members_member_read
on public.pos_business_members for select to authenticated
using (public.pos_is_member(business_id));

create policy pos_events_member_read
on public.pos_events for select to authenticated
using (public.pos_is_member(business_id));

create policy pos_registers_member_read
on public.pos_registers for select to authenticated
using (public.pos_is_member(business_id));

create policy pos_shifts_manager_read
on public.pos_shifts for select to authenticated
using (public.pos_has_role(business_id, array['owner', 'manager']));

create policy pos_categories_member_read
on public.pos_categories for select to authenticated
using (public.pos_is_member(business_id));

create policy pos_products_member_read
on public.pos_products for select to authenticated
using (public.pos_is_member(business_id));

create policy pos_product_versions_manager_read
on public.pos_product_versions for select to authenticated
using (public.pos_has_role(business_id, array['owner', 'manager']));

create policy pos_sales_manager_read
on public.pos_sales for select to authenticated
using (public.pos_has_role(business_id, array['owner', 'manager']));

create policy pos_sale_items_manager_read
on public.pos_sale_items for select to authenticated
using (public.pos_has_role(business_id, array['owner', 'manager']));

create policy pos_payments_manager_read
on public.pos_payments for select to authenticated
using (public.pos_has_role(business_id, array['owner', 'manager']));

create policy pos_sale_events_manager_read
on public.pos_sale_events for select to authenticated
using (public.pos_has_role(business_id, array['owner', 'manager']));

create policy pos_expenses_manager_read
on public.pos_expenses for select to authenticated
using (public.pos_has_role(business_id, array['owner', 'manager']));

create policy pos_cash_movements_manager_read
on public.pos_cash_movements for select to authenticated
using (public.pos_has_role(business_id, array['owner', 'manager']));

-- Remove Supabase's broad default table privileges, then grant only the
-- deliberate read surface. No browser role can directly mutate POS records.
revoke all on table
  public.pos_system_metadata,
  public.pos_businesses,
  public.pos_business_members,
  public.pos_events,
  public.pos_registers,
  public.pos_shifts,
  public.pos_categories,
  public.pos_products,
  public.pos_product_versions,
  public.pos_receipt_counters,
  public.pos_sales,
  public.pos_sale_items,
  public.pos_payments,
  public.pos_sale_events,
  public.pos_expenses,
  public.pos_cash_movements
from public, anon, authenticated;

grant select on table
  public.pos_system_metadata,
  public.pos_businesses,
  public.pos_business_members,
  public.pos_events,
  public.pos_registers,
  public.pos_shifts,
  public.pos_categories,
  public.pos_products,
  public.pos_product_versions,
  public.pos_sales,
  public.pos_sale_items,
  public.pos_payments,
  public.pos_sale_events,
  public.pos_expenses,
  public.pos_cash_movements
to authenticated;

revoke all on function public.pos_is_member(uuid) from public, anon, authenticated;
revoke all on function public.pos_has_role(uuid, text[]) from public, anon, authenticated;
revoke all on function public.pos_bootstrap_business(text, text, text) from public, anon, authenticated;
revoke all on function public.pos_add_member_by_email(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.pos_allocate_receipt(uuid, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.pos_set_updated_at() from public, anon, authenticated;
revoke all on function public.pos_forbid_mutation() from public, anon, authenticated;
revoke all on function public.pos_require_open_sale() from public, anon, authenticated;
revoke all on function public.pos_protect_sale() from public, anon, authenticated;

grant execute on function public.pos_is_member(uuid) to authenticated;
grant execute on function public.pos_has_role(uuid, text[]) to authenticated;
grant execute on function public.pos_bootstrap_business(text, text, text) to authenticated;
grant execute on function public.pos_add_member_by_email(uuid, text, text, text) to authenticated;

comment on table public.pos_product_versions is
  'Immutable price and estimated-cost publications from the costing workspace.';
comment on table public.pos_sales is
  'POS sale headers. Completed rows are immutable; corrections use pos_sale_events.';
comment on column public.pos_sales.is_training is
  'Inherited from the shift and excluded from real reports by default.';
comment on table public.pos_sale_items is
  'Immutable sale-time product, price, ingredient-cost, and packaging-cost snapshots.';
comment on table public.pos_payments is
  'Confirmed payment facts. Cash tendered/change are separate from revenue collected.';
comment on table public.pos_sale_events is
  'Append-only void, refund, waste, and correction audit trail.';

commit;
