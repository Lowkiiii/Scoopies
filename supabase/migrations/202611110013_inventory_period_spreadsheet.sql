-- Matcha Luna inventory schema 13: period spreadsheet and automatic POS usage.
--
-- The spreadsheet stores user-entered period facts while every quantity
-- change remains represented by the append-only inventory ledger. Completed
-- Live sale events consume the immutable product-version snapshot. Inventory
-- failures are fail-open for checkout and are retained as explicit exceptions.

begin;

do $$
declare
  v_version integer;
  v_name text;
begin
  select (metadata.value ->> 'version')::integer,
         metadata.value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata as metadata
  where metadata.key = 'schema_version'
  for update;

  if v_version is distinct from 12
    or v_name is distinct from 'inventory_phase_2b_category' then
    raise exception
      'Refusing schema-13 migration: expected 12:inventory_phase_2b_category, found %:%.',
      coalesce(v_version::text, '<missing>'), coalesce(v_name, '<missing>');
  end if;
end;
$$;

alter table public.pos_inventory_items
  add column source_type text not null default 'ingredient',
  add column source_costing_id text,
  add column row_color_hex text,
  add column purchase_quantity_base numeric(20,6),
  add column purchase_price_centavos bigint;

update public.pos_inventory_items
set source_costing_id = source_costing_ingredient_id,
    revision = revision + 1;

alter table public.pos_inventory_items
  alter column source_costing_id set not null,
  drop constraint pos_inventory_items_item_kind_check,
  add constraint pos_inventory_items_item_kind_check
    check (item_kind in ('purchased', 'mixture', 'packaging')),
  add constraint pos_inventory_items_source_type_check
    check (source_type in ('ingredient', 'packaging')),
  add constraint pos_inventory_items_source_identity_check
    check (
      (source_type = 'ingredient' and item_kind in ('purchased', 'mixture'))
      or (source_type = 'packaging' and item_kind = 'packaging')
    ),
  add constraint pos_inventory_items_source_costing_id_check
    check (char_length(btrim(source_costing_id)) between 1 and 200),
  add constraint pos_inventory_items_row_color_hex_check
    check (row_color_hex is null or row_color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint pos_inventory_items_purchase_quantity_base_check
    check (purchase_quantity_base is null
      or purchase_quantity_base between 0.000001 and 1000000000000),
  add constraint pos_inventory_items_purchase_price_centavos_check
    check (purchase_price_centavos is null
      or purchase_price_centavos between 0 and 10000000000000);

alter table public.pos_inventory_items
  drop constraint if exists pos_inventory_items_business_id_source_costing_ingredient_i_key,
  drop constraint if exists pos_inventory_items_source_costing_ingredient_id_key;

create unique index pos_inventory_items_business_source_uq
  on public.pos_inventory_items (business_id, source_type, source_costing_id);

-- Retained schema-12 RPCs resolve ingredient identities globally by the
-- compatibility column. Preserve that invariant during a DB-first rollout;
-- packaging compatibility IDs live in a separate namespace.
create unique index pos_inventory_items_ingredient_compat_source_uq
  on public.pos_inventory_items (source_costing_ingredient_id)
  where source_type = 'ingredient';

-- Older deployed clients still call schema-12 RPCs whose INSERT statements do
-- not know the canonical source columns. Fill ingredient identity at the table
-- boundary so legacy sync, prepare, and atomic-delete paths remain compatible.
create or replace function public.pos_inventory_fill_source_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source_type is null then
    new.source_type := 'ingredient';
  end if;
  if nullif(btrim(new.source_costing_id), '') is null then
    if new.source_type <> 'ingredient'
      or nullif(btrim(new.source_costing_ingredient_id), '') is null then
      raise exception 'Inventory source identity is required.' using errcode = '22023';
    end if;
    new.source_costing_id := new.source_costing_ingredient_id;
  end if;
  return new;
end;
$$;

create trigger pos_inventory_items_fill_source_identity
before insert on public.pos_inventory_items
for each row execute function public.pos_inventory_fill_source_identity();

-- Backfill current purchased-ingredient purchase facts. Mixture batch prices
-- remain nullable because their value is recursively derived by costing.
with source_rows as (
  select item.id,
         source.value,
         public._pos_inventory_to_base(
           coalesce(nullif(source.value ->> 'amountPerItem', '')::numeric,
                    nullif(source.value ->> 'qty', '')::numeric, 0)
           * coalesce(nullif(source.value ->> 'purchaseQty', '')::numeric, 1),
           lower(btrim(coalesce(source.value ->> 'unit', '')))
         ) as purchase_quantity_base,
         case when nullif(source.value ->> 'price', '') is null then null::bigint
              else round((source.value ->> 'price')::numeric * 100)::bigint end
           as purchase_price_centavos
  from public.pos_inventory_items as item
  join public.scoopies_state as costing on costing.id = 'main'
  join lateral jsonb_array_elements(
    case when jsonb_typeof(costing.data -> 'ingredients') = 'array'
      then costing.data -> 'ingredients' else '[]'::jsonb end
  ) as source(value)
    on btrim(coalesce(source.value ->> 'id', '')) = item.source_costing_id
  where item.source_type = 'ingredient'
    and item.item_kind = 'purchased'
)
update public.pos_inventory_items as item
set purchase_quantity_base = source_rows.purchase_quantity_base,
    purchase_price_centavos = source_rows.purchase_price_centavos,
    revision = item.revision + 1
from source_rows
where item.id = source_rows.id
  and source_rows.purchase_quantity_base > 0;

create table public.pos_inventory_periods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  client_period_id uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_by uuid not null,
  opened_at timestamptz not null default clock_timestamp(),
  client_close_id uuid,
  close_fingerprint text check (close_fingerprint is null or close_fingerprint ~ '^[0-9a-f]{64}$'),
  close_note text check (close_note is null or char_length(btrim(close_note)) between 1 and 1000),
  closed_by uuid,
  closed_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, client_period_id),
  unique (business_id, client_close_id),
  foreign key (business_id, opened_by)
    references public.pos_business_members(business_id, user_id) on delete restrict,
  foreign key (business_id, closed_by)
    references public.pos_business_members(business_id, user_id) on delete restrict,
  check (
    (status = 'open' and client_close_id is null and close_fingerprint is null
      and closed_by is null and closed_at is null)
    or
    (status = 'closed' and client_close_id is not null and close_fingerprint is not null
      and closed_by is not null and closed_at is not null)
  )
);

create unique index pos_inventory_periods_one_open_uq
  on public.pos_inventory_periods (business_id)
  where status = 'open';

create index pos_inventory_periods_business_time_idx
  on public.pos_inventory_periods (business_id, opened_at desc, id desc);

create table public.pos_inventory_period_items (
  business_id uuid not null,
  period_id uuid not null,
  inventory_item_id uuid not null,
  opening_quantity_base numeric(20,6)
    check (opening_quantity_base is null
      or opening_quantity_base between 0 and 1000000000000),
  stock_added_base numeric(20,6) not null default 0
    check (stock_added_base between 0 and 1000000000000),
  wasted_damaged_base numeric(20,6) not null default 0
    check (wasted_damaged_base between 0 and 1000000000000),
  expected_closing_quantity_base numeric(20,6),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (period_id, inventory_item_id),
  unique (business_id, period_id, inventory_item_id),
  foreign key (business_id, period_id)
    references public.pos_inventory_periods(business_id, id) on delete restrict,
  foreign key (business_id, inventory_item_id)
    references public.pos_inventory_items(business_id, id) on delete restrict
);

create table public.pos_inventory_cell_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  period_id uuid not null,
  inventory_item_id uuid not null,
  client_mutation_id uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  column_name text not null check (column_name in (
    'opening_stock', 'stock_added', 'wasted_damaged', 'reorder_level',
    'purchase_quantity', 'purchase_price', 'row_color'
  )),
  old_value jsonb not null,
  new_value jsonb not null,
  item_revision_after bigint not null check (item_revision_after > 0),
  period_item_revision_after bigint not null check (period_item_revision_after > 0),
  changed_by uuid not null,
  changed_at timestamptz not null default clock_timestamp(),
  unique (business_id, client_mutation_id),
  foreign key (business_id, period_id, inventory_item_id)
    references public.pos_inventory_period_items(business_id, period_id, inventory_item_id)
    on delete restrict,
  foreign key (business_id, changed_by)
    references public.pos_business_members(business_id, user_id) on delete restrict,
  check (jsonb_typeof(old_value) in ('number', 'string', 'null')),
  check (jsonb_typeof(new_value) in ('number', 'string', 'null'))
);

create index pos_inventory_cell_events_row_time_idx
  on public.pos_inventory_cell_events
    (business_id, period_id, inventory_item_id, changed_at desc, id desc);

create table public.pos_inventory_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  sale_id uuid,
  sale_event_id uuid,
  period_id uuid,
  exception_code text not null
    check (exception_code ~ '^[a-z][a-z0-9_]{1,79}$'),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 65536),
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  unique (business_id, sale_event_id, exception_code),
  foreign key (business_id, sale_id)
    references public.pos_sales(business_id, id) on delete restrict,
  foreign key (business_id, sale_event_id)
    references public.pos_sale_events(business_id, id) on delete restrict,
  foreign key (business_id, period_id)
    references public.pos_inventory_periods(business_id, id) on delete restrict
);

alter table public.pos_inventory_transactions
  add column inventory_period_id uuid,
  add column source_sale_id uuid,
  add column source_sale_event_id uuid,
  add column reverses_transaction_id uuid,
  drop constraint pos_inventory_transactions_transaction_type_check,
  add constraint pos_inventory_transactions_transaction_type_check
    check (transaction_type in (
      'stock_in', 'waste', 'correction', 'stock_count',
      'period_cell_adjustment', 'sale_usage', 'sale_reversal'
    )),
  add foreign key (business_id, inventory_period_id)
    references public.pos_inventory_periods(business_id, id) on delete restrict,
  add foreign key (business_id, source_sale_id)
    references public.pos_sales(business_id, id) on delete restrict,
  add foreign key (business_id, source_sale_event_id)
    references public.pos_sale_events(business_id, id) on delete restrict,
  add foreign key (business_id, reverses_transaction_id)
    references public.pos_inventory_transactions(business_id, id) on delete restrict;

create unique index pos_inventory_transactions_sale_usage_uq
  on public.pos_inventory_transactions (business_id, source_sale_id)
  where transaction_type = 'sale_usage';

create unique index pos_inventory_transactions_sale_event_uq
  on public.pos_inventory_transactions (business_id, source_sale_event_id)
  where source_sale_event_id is not null;

alter table public.pos_inventory_transaction_lines
  drop constraint pos_inventory_transaction_lines_balance_before_base_check,
  drop constraint pos_inventory_transaction_lines_balance_after_base_check,
  add constraint pos_inventory_transaction_lines_balance_before_base_check
    check (balance_before_base between -1000000000000 and 1000000000000),
  add constraint pos_inventory_transaction_lines_balance_after_base_check
    check (balance_after_base between -1000000000000 and 1000000000000);

create or replace function public.pos_inventory_protect_period_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only.', tg_table_name using errcode = '55000';
end;
$$;

create trigger pos_inventory_cell_events_immutable
before update or delete on public.pos_inventory_cell_events
for each row execute function public.pos_inventory_protect_period_append_only();

-- A schema-12 browser may remain cached briefly after the DB migration. Its
-- free-form stock transaction RPC does not know inventory periods, so reject
-- those legacy movements while a spreadsheet period is open rather than let
-- the ledger and period formula silently diverge.
create or replace function public.pos_inventory_guard_legacy_period_movement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.transaction_type in ('stock_in', 'waste', 'correction', 'stock_count')
    and exists (
      select 1
      from public.pos_inventory_periods as period
      where period.business_id = new.business_id and period.status = 'open'
    ) then
    raise exception 'An inventory period is open. Refresh and use the spreadsheet cells.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger pos_inventory_transactions_period_guard
before insert on public.pos_inventory_transactions
for each row execute function public.pos_inventory_guard_legacy_period_movement();

create or replace function public.pos_inventory_protect_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Inventory items cannot be deleted; deactivate the item instead.'
      using errcode = '55000';
  end if;
  if new.business_id is distinct from old.business_id
    or new.id is distinct from old.id
    or new.source_type is distinct from old.source_type
    or new.source_costing_id is distinct from old.source_costing_id
    or new.source_costing_ingredient_id is distinct from old.source_costing_ingredient_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Inventory item identity fields cannot be changed.' using errcode = '55000';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'Inventory item revision must increase exactly once per change.'
      using errcode = '55000';
  end if;
  if new.item_kind is distinct from old.item_kind
    or new.base_unit is distinct from old.base_unit then
    raise exception 'An inventory item kind or base unit cannot change after creation.'
      using errcode = '55000';
  end if;
  if old.active = true and new.active = false
    and public._pos_inventory_balance(old.business_id, old.id) <> 0 then
    raise exception 'Stock must be zero before an inventory item can be deactivated.'
      using errcode = '55000';
  end if;
  new.row_color_hex := case when new.row_color_hex is null then null
    else upper(new.row_color_hex) end;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public._pos_inventory_expand_snapshot_ingredient(
  p_snapshot jsonb,
  p_source_id text,
  p_required_quantity_base numeric,
  p_depth integer default 0,
  p_path text[] default array[]::text[]
)
returns table (
  source_costing_id text,
  quantity_base numeric,
  base_unit text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_source jsonb;
  v_count integer;
  v_kind text;
  v_unit text;
  v_base_unit text;
  v_yield_base numeric;
  v_ratio numeric;
  v_component record;
  v_component_id text;
  v_component_quantity numeric;
  v_component_unit text;
  v_component_base numeric;
begin
  if p_depth > 16 then
    raise exception 'Combined-cost nesting exceeds 16 levels.' using errcode = '22023';
  end if;
  if p_source_id is null or btrim(p_source_id) = '' then
    raise exception 'A recipe ingredient ID is missing.' using errcode = '22023';
  end if;
  if p_source_id = any(p_path) then
    raise exception 'Combined-cost cycle detected at source %.', p_source_id
      using errcode = '22023';
  end if;
  if p_required_quantity_base is null or p_required_quantity_base <= 0 then
    raise exception 'Recipe ingredient quantities must be positive.' using errcode = '22023';
  end if;

  select count(*)::integer, min(source.value::text)::jsonb
    into v_count, v_source
  from jsonb_array_elements(
    case when jsonb_typeof(p_snapshot -> 'ingredients') = 'array'
      then p_snapshot -> 'ingredients' else '[]'::jsonb end
  ) as source(value)
  where jsonb_typeof(source.value) = 'object'
    and btrim(coalesce(source.value ->> 'id', '')) = p_source_id;

  if v_count <> 1 then
    raise exception 'Snapshot source % is missing or duplicated.', p_source_id
      using errcode = '22023';
  end if;

  v_kind := lower(btrim(coalesce(v_source ->> 'kind', '')));
  v_unit := lower(btrim(coalesce(v_source ->> 'unit', '')));
  v_base_unit := public._pos_inventory_base_unit(v_unit);
  if v_base_unit is null then
    raise exception 'Snapshot source % has an unsupported unit.', p_source_id
      using errcode = '22023';
  end if;

  if v_kind = 'purchased' then
    return query select p_source_id, p_required_quantity_base, v_base_unit;
    return;
  end if;
  if v_kind <> 'mixture' then
    raise exception 'Snapshot source % has an unsupported kind.', p_source_id
      using errcode = '22023';
  end if;

  if jsonb_typeof(v_source -> 'components') is distinct from 'array' then
    raise exception 'Combined cost % has no component array.', p_source_id
      using errcode = '22023';
  end if;
  v_yield_base := public._pos_inventory_to_base(
    nullif(v_source ->> 'batchYield', '')::numeric, v_unit
  );
  if v_yield_base is null or v_yield_base <= 0 then
    raise exception 'Combined cost % has an invalid finished yield.', p_source_id
      using errcode = '22023';
  end if;
  v_ratio := p_required_quantity_base / v_yield_base;

  for v_component in
    select component.value, component.ordinality
    from jsonb_array_elements(v_source -> 'components') with ordinality
      as component(value, ordinality)
    order by component.ordinality
  loop
    if jsonb_typeof(v_component.value) is distinct from 'object' then
      raise exception 'Combined cost % has an invalid component.', p_source_id
        using errcode = '22023';
    end if;
    v_component_id := btrim(coalesce(v_component.value ->> 'ingredientId', ''));
    v_component_quantity := nullif(v_component.value ->> 'qty', '')::numeric;
    v_component_unit := lower(btrim(coalesce(v_component.value ->> 'unit', '')));
    v_component_base := public._pos_inventory_to_base(
      v_component_quantity, v_component_unit
    );
    if v_component_base is null or v_component_base <= 0 then
      raise exception 'Combined cost % has an invalid component quantity.', p_source_id
        using errcode = '22023';
    end if;
    return query
    select expanded.source_costing_id, expanded.quantity_base,
           expanded.base_unit
    from public._pos_inventory_expand_snapshot_ingredient(
      p_snapshot, v_component_id, v_component_base * v_ratio,
      p_depth + 1, p_path || p_source_id
    ) as expanded;
  end loop;
end;
$$;

create or replace function public._pos_inventory_snapshot_components(p_snapshot jsonb)
returns table (
  source_type text,
  source_costing_id text,
  quantity_base numeric,
  base_unit text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_recipe jsonb;
  v_yield numeric;
  v_line record;
  v_source_id text;
  v_quantity numeric;
  v_unit text;
  v_quantity_base numeric;
  v_pack record;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) is distinct from 'object'
    or coalesce((p_snapshot ->> 'schemaVersion')::integer, 0) <> 1 then
    raise exception 'The product version has an unsupported costing snapshot.'
      using errcode = '22023';
  end if;
  v_recipe := p_snapshot -> 'recipe';
  if jsonb_typeof(v_recipe) is distinct from 'object'
    or jsonb_typeof(v_recipe -> 'lines') is distinct from 'array' then
    raise exception 'The product version snapshot has no valid recipe.'
      using errcode = '22023';
  end if;
  v_yield := nullif(v_recipe ->> 'yield', '')::numeric;
  if v_yield is null or v_yield <= 0 then
    raise exception 'The product version snapshot has an invalid recipe yield.'
      using errcode = '22023';
  end if;

  for v_line in
    select line.value, line.ordinality
    from jsonb_array_elements(v_recipe -> 'lines') with ordinality
      as line(value, ordinality)
    order by line.ordinality
  loop
    v_source_id := btrim(coalesce(v_line.value ->> 'ingredientId', ''));
    v_quantity := nullif(v_line.value ->> 'qty', '')::numeric;
    v_unit := lower(btrim(coalesce(v_line.value ->> 'unit', '')));
    v_quantity_base := public._pos_inventory_to_base(v_quantity, v_unit);
    if v_quantity_base is null or v_quantity_base <= 0 then
      raise exception 'The product recipe has an invalid ingredient quantity.'
        using errcode = '22023';
    end if;
    return query
    select 'ingredient'::text, expanded.source_costing_id,
           expanded.quantity_base / v_yield, expanded.base_unit
    from public._pos_inventory_expand_snapshot_ingredient(
      p_snapshot, v_source_id, v_quantity_base
    ) as expanded;
  end loop;

  if jsonb_typeof(p_snapshot -> 'packagingLines') is distinct from 'array' then
    raise exception 'The product version snapshot has no packaging line array.'
      using errcode = '22023';
  end if;
  for v_pack in
    select line.value, line.ordinality
    from jsonb_array_elements(p_snapshot -> 'packagingLines') with ordinality
      as line(value, ordinality)
    order by line.ordinality
  loop
    v_source_id := btrim(coalesce(v_pack.value ->> 'packagingId', ''));
    v_quantity := nullif(v_pack.value ->> 'qty', '')::numeric;
    if v_source_id = '' or v_quantity is null or v_quantity <= 0 then
      raise exception 'The product has an invalid packaging quantity.'
        using errcode = '22023';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(p_snapshot -> 'packaging') = 'array'
          then p_snapshot -> 'packaging' else '[]'::jsonb end
      ) as package(value)
      where btrim(coalesce(package.value ->> 'id', '')) = v_source_id
    ) then
      raise exception 'Packaging source % is missing from the snapshot.', v_source_id
        using errcode = '22023';
    end if;
    return query select 'packaging'::text, v_source_id, v_quantity, 'piece'::text;
  end loop;
end;
$$;

create or replace function public.pos_inventory_sync_spreadsheet_sources(
  p_business_id uuid
)
returns table (
  inventory_item_id uuid,
  source_type text,
  source_costing_id text,
  item_kind text,
  item_name text,
  base_unit text,
  sync_result text,
  revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_data jsonb;
  v_source record;
  v_item public.pos_inventory_items%rowtype;
  v_source_type text;
  v_source_id text;
  v_kind text;
  v_name text;
  v_unit text;
  v_base text;
  v_quantity_base numeric;
  v_price bigint;
  v_compatibility_id text;
  v_result text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can synchronize inventory sources.'
      using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('pos-inventory:' || p_business_id::text, 0)
  );
  select costing.data into strict v_data
  from public.scoopies_state as costing
  where costing.id = 'main'
  for share;

  for v_source in
    select 'ingredient'::text as source_type, source.value,
           source.ordinality::bigint as ordinality
    from jsonb_array_elements(
      case when jsonb_typeof(v_data -> 'ingredients') = 'array'
        then v_data -> 'ingredients' else '[]'::jsonb end
    ) with ordinality as source(value, ordinality)
    union all
    select 'packaging'::text, source.value,
           1000000 + source.ordinality::bigint
    from jsonb_array_elements(
      case when jsonb_typeof(v_data -> 'packaging') = 'array'
        then v_data -> 'packaging' else '[]'::jsonb end
    ) with ordinality as source(value, ordinality)
    order by ordinality
  loop
    v_source_type := v_source.source_type;
    v_source_id := btrim(coalesce(v_source.value ->> 'id', ''));
    v_name := btrim(coalesce(v_source.value ->> 'name', ''));
    if v_name = ''
      and nullif(btrim(coalesce(v_source.value ->> 'price', '')), '') is null
      and nullif(btrim(coalesce(v_source.value ->> 'qty', '')), '') is null
      and nullif(btrim(coalesce(v_source.value ->> 'amountPerItem', '')), '') is null
      and nullif(btrim(coalesce(v_source.value ->> 'batchYield', '')), '') is null then
      continue;
    end if;
    if char_length(v_source_id) not between 1 and 180
      or char_length(v_name) not between 1 and 120 then
      raise exception 'A costing source has an invalid ID or name.' using errcode = '22023';
    end if;
    if v_source_type = 'packaging' then
      v_kind := 'packaging';
      v_unit := 'piece';
      v_quantity_base := nullif(v_source.value ->> 'qty', '')::numeric;
      v_price := case when nullif(v_source.value ->> 'price', '') is null then null
        else round((v_source.value ->> 'price')::numeric * 100)::bigint end;
      v_compatibility_id := 'packaging:' || v_source_id;
    else
      v_kind := case when v_source.value ->> 'kind' = 'mixture'
        then 'mixture' else 'purchased' end;
      v_unit := lower(btrim(coalesce(v_source.value ->> 'unit', '')));
      if v_kind = 'purchased' then
        v_quantity_base := public._pos_inventory_to_base(
          coalesce(nullif(v_source.value ->> 'amountPerItem', '')::numeric,
                   nullif(v_source.value ->> 'qty', '')::numeric)
          * coalesce(nullif(v_source.value ->> 'purchaseQty', '')::numeric, 1),
          v_unit
        );
        v_price := case when nullif(v_source.value ->> 'price', '') is null then null
          else round((v_source.value ->> 'price')::numeric * 100)::bigint end;
      else
        v_quantity_base := public._pos_inventory_to_base(
          nullif(v_source.value ->> 'batchYield', '')::numeric, v_unit
        );
        v_price := null;
      end if;
      v_compatibility_id := v_source_id;
    end if;
    v_base := public._pos_inventory_base_unit(v_unit);
    if v_base is null then
      raise exception 'Costing source % has an invalid physical unit.', v_source_id
        using errcode = '22023';
    end if;
    if v_quantity_base is not null and v_quantity_base <= 0 then
      raise exception 'Costing source % has an invalid purchase quantity.', v_source_id
        using errcode = '22023';
    end if;

    select item.* into v_item
    from public.pos_inventory_items as item
    where item.source_type = v_source_type
      and item.source_costing_id = v_source_id
    order by (item.business_id = p_business_id) desc, item.business_id, item.id
    limit 1
    for update;
    if not found then
      insert into public.pos_inventory_items (
        business_id, source_costing_ingredient_id, source_type,
        source_costing_id, item_kind, name, base_unit, preferred_unit,
        purchase_quantity_base, purchase_price_centavos,
        created_by, updated_by
      ) values (
        p_business_id, v_compatibility_id, v_source_type,
        v_source_id, v_kind, v_name, v_base, v_unit,
        v_quantity_base, v_price, v_user_id, v_user_id
      ) returning * into v_item;
      v_result := 'created';
    elsif v_item.business_id is distinct from p_business_id then
      raise exception 'Costing source % is already attached to another business inventory.',
        v_source_id using errcode = '55000';
    elsif v_item.item_kind is distinct from v_kind
      or v_item.base_unit is distinct from v_base then
      raise exception 'Costing source % changed physical dimension or kind.', v_source_id
        using errcode = '55000';
    elsif v_item.active and v_item.name is distinct from v_name then
      update public.pos_inventory_items as item
      set name = v_name,
          revision = item.revision + 1,
          updated_by = v_user_id
      where item.business_id = p_business_id and item.id = v_item.id
      returning item.* into v_item;
      v_result := 'updated';
    else
      v_result := case when v_item.active then 'unchanged' else 'inactive' end;
    end if;

    -- A new source introduced during a period remains uncounted until its
    -- Opening Stock cell is explicitly confirmed (including an entered zero).
    insert into public.pos_inventory_period_items (
      business_id, period_id, inventory_item_id
    )
    select p_business_id, period.id, v_item.id
    from public.pos_inventory_periods as period
    where period.business_id = p_business_id and period.status = 'open'
    on conflict on constraint pos_inventory_period_items_pkey do nothing;

    return query select v_item.id, v_item.source_type,
      v_item.source_costing_id, v_item.item_kind, v_item.name,
      v_item.base_unit, v_result, v_item.revision;
  end loop;
end;
$$;

-- Keep the schema-12 read RPC safe while an older browser bundle may remain
-- cached: that UI understands costing ingredients only, never packaging rows.
create or replace function public.pos_inventory_get_items(
  p_business_id uuid,
  p_include_inactive boolean default false
)
returns table (
  inventory_item_id uuid,
  source_costing_ingredient_id text,
  item_kind text,
  name text,
  base_unit text,
  preferred_unit text,
  category_name text,
  brand text,
  purchased_from text,
  last_stocked_on date,
  notes text,
  current_balance_base numeric,
  low_stock_threshold_base numeric,
  is_low_stock boolean,
  has_stock_history boolean,
  initialized boolean,
  active boolean,
  revision bigint,
  last_movement_at timestamptz,
  last_movement_type text,
  updated_at timestamptz
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
  if not public.pos_is_member(p_business_id) then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;
  if p_include_inactive is null then
    raise exception 'Include-inactive flag is required.' using errcode = '22023';
  end if;
  if p_include_inactive
    and not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can include inactive inventory items.'
      using errcode = '42501';
  end if;

  return query
  select item.id, item.source_costing_ingredient_id, item.item_kind,
         item.name, item.base_unit,
         coalesce(item.preferred_unit, item.base_unit),
         case
           when costing_source.value is null then 'Removed from costing'::text
           else coalesce(
             nullif(btrim(costing_category.value ->> 'name'), ''),
             'Uncategorized'
           )
         end,
         item.legacy_brand,
         item.purchased_from, item.last_stocked_on, item.notes,
         coalesce(history.balance, 0)::numeric,
         item.low_stock_threshold_base,
         (item.active and coalesce(history.has_stock_history, false)
           and item.low_stock_threshold_base is not null
           and coalesce(history.balance, 0) <= item.low_stock_threshold_base),
         coalesce(history.has_stock_history, false),
         coalesce(history.has_stock_history, false),
         item.active, item.revision, latest.occurred_at,
         latest.transaction_type, item.updated_at
  from public.pos_inventory_items as item
  left join public.scoopies_state as costing
    on costing.id = 'main'
  left join lateral (
    select source.value
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(costing.data -> 'ingredients') = 'array'
          then costing.data -> 'ingredients'
        else '[]'::jsonb
      end
    ) with ordinality as source(value, ordinality)
    where pg_catalog.jsonb_typeof(source.value) = 'object'
      and btrim(coalesce(source.value ->> 'id', '')) =
        item.source_costing_ingredient_id
    order by source.ordinality
    limit 1
  ) as costing_source on true
  left join lateral (
    select category.value
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(costing.data -> 'ingredientCategories') = 'array'
          then costing.data -> 'ingredientCategories'
        else '[]'::jsonb
      end
    ) with ordinality as category(value, ordinality)
    where pg_catalog.jsonb_typeof(category.value) = 'object'
      and btrim(coalesce(category.value ->> 'id', '')) =
        btrim(coalesce(costing_source.value ->> 'categoryId', ''))
    order by category.ordinality
    limit 1
  ) as costing_category on true
  left join lateral (
    select coalesce(sum(line.quantity_delta_base), 0)::numeric as balance,
           (count(*) > 0) as has_stock_history
    from public.pos_inventory_transaction_lines as line
    where line.business_id = item.business_id
      and line.inventory_item_id = item.id
  ) as history on true
  left join lateral (
    select inventory_tx.occurred_at, inventory_tx.transaction_type
    from public.pos_inventory_transaction_lines as line
    join public.pos_inventory_transactions as inventory_tx
      on inventory_tx.business_id = line.business_id
     and inventory_tx.id = line.transaction_id
    where line.business_id = item.business_id
      and line.inventory_item_id = item.id
    order by line.item_sequence desc
    limit 1
  ) as latest on true
  where item.business_id = p_business_id
    and item.source_type = 'ingredient'
    and (p_include_inactive or item.active)
  order by item.active desc, pg_catalog.lower(item.name), item.id;
end;
$$;

create or replace function public._pos_inventory_display_factor(p_unit text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case lower(p_unit)
    when 'kg' then 1000::numeric
    when 'l' then 1000::numeric
    else 1::numeric
  end;
$$;

create or replace function public.pos_inventory_start_period(
  p_business_id uuid,
  p_client_period_id uuid,
  p_name text,
  p_carry_forward boolean default true
)
returns table (
  period_id uuid,
  period_name text,
  status text,
  opened_at timestamptz,
  is_retry boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_fingerprint text;
  v_period public.pos_inventory_periods%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can start an inventory period.'
      using errcode = '42501';
  end if;
  if p_client_period_id is null or p_carry_forward is null then
    raise exception 'A client period ID and opening method are required.'
      using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) > 120 then
    raise exception 'Period name must contain 1 to 120 characters.' using errcode = '22023';
  end if;
  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'name', v_name, 'carryForward', p_carry_forward
  )::text, 'UTF8')), 'hex');

  -- Period transitions take the same lock order as checkout/void:
  -- POS shift first, then inventory.
  perform pg_advisory_xact_lock(hashtextextended('pos-shift:' || p_business_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('pos-inventory:' || p_business_id::text, 0));

  select period.* into v_period
  from public.pos_inventory_periods as period
  where period.business_id = p_business_id
    and period.client_period_id = p_client_period_id
  for update;
  if found then
    if v_period.request_fingerprint is distinct from v_fingerprint then
      raise exception 'This period request ID was already used with different details.'
        using errcode = '23505';
    end if;
    return query select v_period.id, v_period.name, v_period.status,
      v_period.opened_at, true;
    return;
  end if;
  if exists (
    select 1 from public.pos_shifts as shift
    where shift.business_id = p_business_id
      and shift.status = 'open' and shift.is_training = false
  ) then
    raise exception 'Close the Live POS shift before starting an inventory period.'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from public.pos_inventory_periods as period
    where period.business_id = p_business_id and period.status = 'open'
  ) then
    raise exception 'An inventory period is already open.' using errcode = '55000';
  end if;

  insert into public.pos_inventory_periods (
    business_id, client_period_id, request_fingerprint, name, opened_by
  ) values (
    p_business_id, p_client_period_id, v_fingerprint, v_name, v_user_id
  ) returning * into v_period;

  insert into public.pos_inventory_period_items (
    business_id, period_id, inventory_item_id, opening_quantity_base
  )
  select item.business_id, v_period.id, item.id,
         case when p_carry_forward then (
           select case
             when latest.expected_closing_quantity_base >= 0
               then latest.expected_closing_quantity_base
             else null::numeric
           end
           from (
             select previous_item.expected_closing_quantity_base
             from public.pos_inventory_periods as previous_period
             join public.pos_inventory_period_items as previous_item
               on previous_item.business_id = previous_period.business_id
              and previous_item.period_id = previous_period.id
              and previous_item.inventory_item_id = item.id
             where previous_period.business_id = p_business_id
               and previous_period.status = 'closed'
             order by previous_period.closed_at desc, previous_period.id desc
             limit 1
           ) as latest
         ) else null::numeric end
  from public.pos_inventory_items as item
  where item.business_id = p_business_id and item.active = true;

  return query select v_period.id, v_period.name, v_period.status,
    v_period.opened_at, false;
end;
$$;

create or replace function public.pos_inventory_close_period(
  p_business_id uuid,
  p_period_id uuid,
  p_client_close_id uuid,
  p_note text default null
)
returns table (
  period_id uuid,
  period_name text,
  status text,
  closed_at timestamptz,
  is_retry boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_fingerprint text;
  v_period public.pos_inventory_periods%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can close an inventory period.'
      using errcode = '42501';
  end if;
  if p_period_id is null or p_client_close_id is null then
    raise exception 'Period ID and client close ID are required.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'Close note must be at most 1000 characters.' using errcode = '22023';
  end if;
  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'periodId', p_period_id, 'note', v_note
  )::text, 'UTF8')), 'hex');

  perform pg_advisory_xact_lock(hashtextextended('pos-shift:' || p_business_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('pos-inventory:' || p_business_id::text, 0));

  select period.* into v_period
  from public.pos_inventory_periods as period
  where period.business_id = p_business_id and period.id = p_period_id
  for update;
  if not found then
    raise exception 'The inventory period was not found.' using errcode = 'P0002';
  end if;
  if v_period.status = 'closed' then
    if v_period.client_close_id is distinct from p_client_close_id
      or v_period.close_fingerprint is distinct from v_fingerprint then
      raise exception 'This inventory period was already closed with different details.'
        using errcode = '23505';
    end if;
    return query select v_period.id, v_period.name, v_period.status,
      v_period.closed_at, true;
    return;
  end if;
  if exists (
    select 1 from public.pos_shifts as shift
    where shift.business_id = p_business_id
      and shift.status = 'open' and shift.is_training = false
  ) then
    raise exception 'Close the Live POS shift before closing inventory.'
      using errcode = '55000';
  end if;

  update public.pos_inventory_period_items as period_item
  set expected_closing_quantity_base =
        period_item.opening_quantity_base
        + period_item.stock_added_base
        - period_item.wasted_damaged_base
        + coalesce((
          select sum(line.quantity_delta_base)
          from public.pos_inventory_transactions as inventory_tx
          join public.pos_inventory_transaction_lines as line
            on line.business_id = inventory_tx.business_id
           and line.transaction_id = inventory_tx.id
          where inventory_tx.business_id = period_item.business_id
            and inventory_tx.inventory_period_id = period_item.period_id
            and line.inventory_item_id = period_item.inventory_item_id
            and inventory_tx.transaction_type in ('sale_usage', 'sale_reversal')
        ), 0),
      revision = period_item.revision + 1,
      updated_at = clock_timestamp()
  where period_item.business_id = p_business_id
    and period_item.period_id = p_period_id;

  update public.pos_inventory_periods as period
  set status = 'closed', client_close_id = p_client_close_id,
      close_fingerprint = v_fingerprint, close_note = v_note,
      closed_by = v_user_id, closed_at = clock_timestamp(),
      revision = period.revision + 1, updated_at = clock_timestamp()
  where period.business_id = p_business_id and period.id = p_period_id
  returning * into v_period;

  return query select v_period.id, v_period.name, v_period.status,
    v_period.closed_at, false;
end;
$$;

create or replace function public.pos_inventory_set_spreadsheet_cell(
  p_business_id uuid,
  p_period_id uuid,
  p_inventory_item_id uuid,
  p_client_mutation_id uuid,
  p_column text,
  p_value text,
  p_expected_item_revision bigint,
  p_expected_period_item_revision bigint
)
returns table (
  period_id uuid,
  inventory_item_id uuid,
  column_name text,
  saved_value text,
  item_revision bigint,
  period_item_revision bigint,
  is_retry boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_column text := lower(btrim(coalesce(p_column, '')));
  v_value text := nullif(btrim(coalesce(p_value, '')), '');
  v_fingerprint text;
  v_existing public.pos_inventory_cell_events%rowtype;
  v_period public.pos_inventory_periods%rowtype;
  v_period_item public.pos_inventory_period_items%rowtype;
  v_item public.pos_inventory_items%rowtype;
  v_number numeric;
  v_factor numeric;
  v_new_base numeric;
  v_old_base numeric;
  v_delta numeric := 0;
  v_old_json jsonb;
  v_new_json jsonb;
  v_saved_value text;
  v_sequence bigint;
  v_item_revision_after bigint;
  v_period_revision_after bigint;
  v_transaction_id uuid;
  v_balance_before numeric;
  v_balance_after numeric;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can edit the inventory spreadsheet.'
      using errcode = '42501';
  end if;
  if p_period_id is null or p_inventory_item_id is null
    or p_client_mutation_id is null then
    raise exception 'Period, item, and client mutation IDs are required.'
      using errcode = '22023';
  end if;
  if v_column not in (
    'opening_stock', 'stock_added', 'wasted_damaged', 'reorder_level',
    'purchase_quantity', 'purchase_price', 'row_color'
  ) then
    raise exception 'Unknown spreadsheet column.' using errcode = '22023';
  end if;
  if p_expected_item_revision is null or p_expected_item_revision < 1
    or p_expected_period_item_revision is null or p_expected_period_item_revision < 1 then
    raise exception 'Positive item and period-row revisions are required.'
      using errcode = '22023';
  end if;

  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'periodId', p_period_id, 'itemId', p_inventory_item_id,
    'column', v_column, 'value', v_value
  )::text, 'UTF8')), 'hex');

  perform pg_advisory_xact_lock(hashtextextended('pos-inventory:' || p_business_id::text, 0));

  select event.* into v_existing
  from public.pos_inventory_cell_events as event
  where event.business_id = p_business_id
    and event.client_mutation_id = p_client_mutation_id;
  if found then
    if v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'This cell mutation ID was already used with different details.'
        using errcode = '23505';
    end if;
    return query select v_existing.period_id, v_existing.inventory_item_id,
      v_existing.column_name,
      case when v_existing.new_value = 'null'::jsonb then null::text
        else trim(both '"' from v_existing.new_value::text) end,
      v_existing.item_revision_after,
      v_existing.period_item_revision_after, true;
    return;
  end if;

  select period.* into v_period
  from public.pos_inventory_periods as period
  where period.business_id = p_business_id and period.id = p_period_id
  for update;
  if not found or v_period.status <> 'open' then
    raise exception 'The inventory period is not open.' using errcode = '55000';
  end if;
  select period_item.* into v_period_item
  from public.pos_inventory_period_items as period_item
  where period_item.business_id = p_business_id
    and period_item.period_id = p_period_id
    and period_item.inventory_item_id = p_inventory_item_id
  for update;
  if not found then
    raise exception 'The inventory period row was not found.' using errcode = 'P0002';
  end if;
  select item.* into v_item
  from public.pos_inventory_items as item
  where item.business_id = p_business_id and item.id = p_inventory_item_id
  for update;
  if not found or not v_item.active then
    raise exception 'The active inventory item was not found.' using errcode = 'P0002';
  end if;
  if v_item.revision <> p_expected_item_revision
    or v_period_item.revision <> p_expected_period_item_revision then
    raise exception 'This row changed on another device. Refresh and try again.'
      using errcode = '40001';
  end if;
  v_factor := public._pos_inventory_display_factor(
    coalesce(v_item.preferred_unit, v_item.base_unit)
  );

  if v_column in ('opening_stock', 'stock_added', 'wasted_damaged') then
    if v_value is null then
      raise exception 'This quantity cannot be blank.' using errcode = '22023';
    end if;
    v_number := v_value::numeric;
    if v_number < 0 or v_number > 1000000000000 then
      raise exception 'Spreadsheet quantities must be nonnegative and supported.'
        using errcode = '22003';
    end if;
    v_new_base := v_number * v_factor;
    if v_column = 'opening_stock' then
      v_old_base := v_period_item.opening_quantity_base;
      if v_old_base is null then
        -- A sale, delivery, or waste entry can occur while Opening Stock is
        -- still blank. Reconcile the ledger to the complete period formula;
        -- using new opening minus the global balance would double-apply those
        -- already-posted period movements.
        select coalesce(sum(line.quantity_delta_base), 0)::numeric
          into v_delta
        from public.pos_inventory_transactions as inventory_tx
        join public.pos_inventory_transaction_lines as line
          on line.business_id = inventory_tx.business_id
         and line.transaction_id = inventory_tx.id
        where inventory_tx.business_id = p_business_id
          and inventory_tx.inventory_period_id = p_period_id
          and inventory_tx.transaction_type in ('sale_usage', 'sale_reversal')
          and line.inventory_item_id = p_inventory_item_id;
        v_delta := (
          v_new_base + v_period_item.stock_added_base
          - v_period_item.wasted_damaged_base + v_delta
        ) - public._pos_inventory_balance(p_business_id, p_inventory_item_id);
      else
        v_delta := v_new_base - v_old_base;
      end if;
      update public.pos_inventory_period_items as period_item
      set opening_quantity_base = v_new_base,
          revision = period_item.revision + 1,
          updated_at = clock_timestamp()
      where period_item.period_id = p_period_id
        and period_item.inventory_item_id = p_inventory_item_id
      returning period_item.revision into v_period_revision_after;
    elsif v_column = 'stock_added' then
      v_old_base := v_period_item.stock_added_base;
      v_delta := v_new_base - v_old_base;
      update public.pos_inventory_period_items as period_item
      set stock_added_base = v_new_base,
          revision = period_item.revision + 1,
          updated_at = clock_timestamp()
      where period_item.period_id = p_period_id
        and period_item.inventory_item_id = p_inventory_item_id
      returning period_item.revision into v_period_revision_after;
    else
      v_old_base := v_period_item.wasted_damaged_base;
      v_delta := v_old_base - v_new_base;
      update public.pos_inventory_period_items as period_item
      set wasted_damaged_base = v_new_base,
          revision = period_item.revision + 1,
          updated_at = clock_timestamp()
      where period_item.period_id = p_period_id
        and period_item.inventory_item_id = p_inventory_item_id
      returning period_item.revision into v_period_revision_after;
    end if;
    v_old_json := to_jsonb(v_old_base / v_factor);
    v_new_json := to_jsonb(v_number);
    v_saved_value := v_number::text;

    v_balance_before := public._pos_inventory_balance(p_business_id, p_inventory_item_id);
    v_balance_after := v_balance_before + v_delta;
    select coalesce(max(line.item_sequence), 0) + 1 into v_sequence
    from public.pos_inventory_transaction_lines as line
    where line.business_id = p_business_id
      and line.inventory_item_id = p_inventory_item_id;
    update public.pos_inventory_items as item
    set revision = item.revision + 1, updated_by = v_user_id
    where item.business_id = p_business_id and item.id = p_inventory_item_id
    returning item.revision into v_item_revision_after;
    insert into public.pos_inventory_transactions (
      business_id, client_transaction_id, request_fingerprint,
      transaction_type, metadata, recorded_by, inventory_period_id
    ) values (
      p_business_id, p_client_mutation_id, v_fingerprint,
      'period_cell_adjustment',
      jsonb_build_object('operationSchemaVersion', 1, 'column', v_column),
      v_user_id, p_period_id
    ) returning id into v_transaction_id;
    insert into public.pos_inventory_transaction_lines (
      business_id, transaction_id, line_number, inventory_item_id,
      item_sequence, item_name_snapshot, base_unit_snapshot,
      input_quantity, input_unit, input_quantity_base,
      quantity_delta_base, balance_before_base, balance_after_base,
      item_revision_before, item_revision_after
    ) values (
      p_business_id, v_transaction_id, 1, p_inventory_item_id,
      v_sequence, v_item.name, v_item.base_unit,
      v_delta / v_factor, coalesce(v_item.preferred_unit, v_item.base_unit),
      v_delta, v_delta, v_balance_before, v_balance_after,
      v_item.revision, v_item_revision_after
    );
  else
    v_period_revision_after := v_period_item.revision + 1;
    update public.pos_inventory_period_items as period_item
    set revision = v_period_revision_after, updated_at = clock_timestamp()
    where period_item.period_id = p_period_id
      and period_item.inventory_item_id = p_inventory_item_id;

    if v_column = 'row_color' then
      if v_value is not null and v_value !~ '^#[0-9A-Fa-f]{6}$' then
        raise exception 'Row color must be a six-digit hex color.' using errcode = '22023';
      end if;
      v_old_json := coalesce(to_jsonb(v_item.row_color_hex), 'null'::jsonb);
      v_new_json := coalesce(to_jsonb(case when v_value is null then null
        else upper(v_value) end), 'null'::jsonb);
      v_saved_value := case when v_value is null then null else upper(v_value) end;
      update public.pos_inventory_items as item
      set row_color_hex = v_saved_value, revision = item.revision + 1,
          updated_by = v_user_id
      where item.business_id = p_business_id and item.id = p_inventory_item_id
      returning item.revision into v_item_revision_after;
    else
      if v_value is null then
        v_number := null;
      else
        v_number := v_value::numeric;
        if v_number < 0 or v_number > 1000000000000 then
          raise exception 'Spreadsheet values must be nonnegative and supported.'
            using errcode = '22003';
        end if;
      end if;
      if v_column = 'reorder_level' then
        v_old_json := coalesce(to_jsonb(v_item.low_stock_threshold_base / v_factor), 'null'::jsonb);
        v_new_base := case when v_number is null then null else v_number * v_factor end;
        v_new_json := coalesce(to_jsonb(v_number), 'null'::jsonb);
        update public.pos_inventory_items as item
        set low_stock_threshold_base = v_new_base,
            revision = item.revision + 1, updated_by = v_user_id
        where item.business_id = p_business_id and item.id = p_inventory_item_id
        returning item.revision into v_item_revision_after;
      elsif v_column = 'purchase_quantity' then
        if v_number is not null and v_number <= 0 then
          raise exception 'Purchase quantity must be greater than zero.' using errcode = '22023';
        end if;
        v_old_json := coalesce(to_jsonb(v_item.purchase_quantity_base / v_factor), 'null'::jsonb);
        v_new_base := case when v_number is null then null else v_number * v_factor end;
        v_new_json := coalesce(to_jsonb(v_number), 'null'::jsonb);
        update public.pos_inventory_items as item
        set purchase_quantity_base = v_new_base,
            revision = item.revision + 1, updated_by = v_user_id
        where item.business_id = p_business_id and item.id = p_inventory_item_id
        returning item.revision into v_item_revision_after;
      else
        if v_number is not null and v_number > 100000000000 then
          raise exception 'Purchase price is outside the supported range.' using errcode = '22003';
        end if;
        v_old_json := coalesce(to_jsonb(
          case when v_item.purchase_price_centavos is null then null::numeric
            else v_item.purchase_price_centavos::numeric / 100 end
        ), 'null'::jsonb);
        v_new_json := coalesce(to_jsonb(v_number), 'null'::jsonb);
        update public.pos_inventory_items as item
        set purchase_price_centavos = case when v_number is null then null
              else round(v_number * 100)::bigint end,
            revision = item.revision + 1, updated_by = v_user_id
        where item.business_id = p_business_id and item.id = p_inventory_item_id
        returning item.revision into v_item_revision_after;
      end if;
      v_saved_value := case when v_number is null then null else v_number::text end;
    end if;
  end if;

  insert into public.pos_inventory_cell_events (
    business_id, period_id, inventory_item_id, client_mutation_id,
    request_fingerprint, column_name, old_value, new_value,
    item_revision_after, period_item_revision_after, changed_by
  ) values (
    p_business_id, p_period_id, p_inventory_item_id, p_client_mutation_id,
    v_fingerprint, v_column, coalesce(v_old_json, 'null'::jsonb),
    coalesce(v_new_json, 'null'::jsonb), v_item_revision_after,
    v_period_revision_after, v_user_id
  );

  return query select p_period_id, p_inventory_item_id, v_column,
    v_saved_value, v_item_revision_after, v_period_revision_after, false;
end;
$$;

create or replace function public.pos_inventory_get_spreadsheet(
  p_business_id uuid,
  p_period_id uuid default null
)
returns table (
  active_period_id uuid,
  active_period_name text,
  active_period_status text,
  active_period_opened_at timestamptz,
  active_period_revision bigint,
  inventory_item_id uuid,
  source_type text,
  source_costing_id text,
  source_costing_ingredient_id text,
  item_kind text,
  category_name text,
  name text,
  base_unit text,
  preferred_unit text,
  opening_stock_base numeric,
  stock_added_base numeric,
  stock_used_base numeric,
  wasted_base numeric,
  remaining_stock_base numeric,
  current_balance_base numeric,
  low_stock_threshold_base numeric,
  purchase_quantity_base numeric,
  purchase_price_centavos bigint,
  cost_per_unit_centavos numeric,
  remaining_value_centavos numeric,
  stock_status text,
  row_color text,
  revision bigint,
  period_item_revision bigint,
  has_stock_history boolean,
  initialized boolean,
  active boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_period_id uuid := p_period_id;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_is_member(p_business_id) then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;
  if v_period_id is null then
    select period.id into v_period_id
    from public.pos_inventory_periods as period
    where period.business_id = p_business_id and period.status = 'open'
    order by period.opened_at desc, period.id desc
    limit 1;
  elsif not exists (
    select 1 from public.pos_inventory_periods as period
    where period.business_id = p_business_id and period.id = v_period_id
  ) then
    raise exception 'The inventory period was not found.' using errcode = 'P0002';
  end if;

  return query
  with rows as (
    select period.id as period_id, period.name as period_name,
           period.status as period_status, period.opened_at,
           coalesce(period.revision, 0)::bigint as period_revision,
           item.id as inventory_item_id, item.source_type,
           item.source_costing_id, item.source_costing_ingredient_id,
           item.item_kind,
           case when item.source_type = 'packaging' then 'Packaging'::text
             when costing_source.value is null then 'Removed from costing'::text
             else coalesce(nullif(btrim(category.value ->> 'name'), ''),
                           'Uncategorized') end as category_name,
           item.name as item_name,
           item.base_unit,
           coalesce(item.preferred_unit, item.base_unit) as preferred_unit,
           period_item.opening_quantity_base::numeric as opening_base,
           coalesce(period_item.stock_added_base, 0)::numeric
             as stock_added_base,
           coalesce(period_item.wasted_damaged_base, 0)::numeric
             as wasted_base,
           coalesce(movement.quantity_delta_base, 0)::numeric
             as sale_delta_base,
           item.low_stock_threshold_base,
           item.purchase_quantity_base,
           item.purchase_price_centavos,
           item.row_color_hex, item.revision as item_revision,
           coalesce(period_item.revision, 0)::bigint as period_item_revision,
           item.updated_at
    from public.pos_inventory_items as item
    left join public.pos_inventory_periods as period
      on period.business_id = item.business_id and period.id = v_period_id
    left join public.pos_inventory_period_items as period_item
      on period_item.business_id = item.business_id
     and period_item.period_id = period.id
     and period_item.inventory_item_id = item.id
    left join public.scoopies_state as costing on costing.id = 'main'
    left join lateral (
      select source.value
      from jsonb_array_elements(
        case when jsonb_typeof(costing.data -> 'ingredients') = 'array'
          then costing.data -> 'ingredients' else '[]'::jsonb end
      ) with ordinality as source(value, ordinality)
      where item.source_type = 'ingredient'
        and btrim(coalesce(source.value ->> 'id', '')) = item.source_costing_id
      order by source.ordinality
      limit 1
    ) as costing_source on true
    left join lateral (
      select source.value
      from jsonb_array_elements(
        case when jsonb_typeof(costing.data -> 'ingredientCategories') = 'array'
          then costing.data -> 'ingredientCategories' else '[]'::jsonb end
      ) with ordinality as source(value, ordinality)
      where btrim(coalesce(source.value ->> 'id', '')) =
        btrim(coalesce(costing_source.value ->> 'categoryId', ''))
      order by source.ordinality
      limit 1
    ) as category on true
    left join lateral (
      select coalesce(sum(line.quantity_delta_base), 0)::numeric
        as quantity_delta_base
      from public.pos_inventory_transactions as inventory_tx
      join public.pos_inventory_transaction_lines as line
        on line.business_id = inventory_tx.business_id
       and line.transaction_id = inventory_tx.id
      where inventory_tx.business_id = item.business_id
        and inventory_tx.inventory_period_id = period.id
        and inventory_tx.transaction_type in ('sale_usage', 'sale_reversal')
        and line.inventory_item_id = item.id
    ) as movement on true
    where item.business_id = p_business_id and item.active = true
  ), calculated as (
    select rows.*,
           greatest(0::numeric, -rows.sale_delta_base) as stock_used_base,
           rows.opening_base + rows.stock_added_base - rows.wasted_base
             + rows.sale_delta_base as remaining_base
    from rows
  )
  select calculated.period_id, calculated.period_name,
         calculated.period_status, calculated.opened_at,
         calculated.period_revision, calculated.inventory_item_id,
         calculated.source_type, calculated.source_costing_id,
         calculated.source_costing_ingredient_id, calculated.item_kind,
         calculated.category_name, calculated.item_name,
         calculated.base_unit, calculated.preferred_unit,
         calculated.opening_base,
         calculated.stock_added_base,
         calculated.stock_used_base,
         calculated.wasted_base,
         calculated.remaining_base,
         calculated.remaining_base,
         calculated.low_stock_threshold_base,
         calculated.purchase_quantity_base,
         calculated.purchase_price_centavos,
         case when calculated.purchase_quantity_base > 0
           then calculated.purchase_price_centavos::numeric
             / calculated.purchase_quantity_base
           else null::numeric end,
         case when calculated.purchase_quantity_base > 0
           and calculated.purchase_price_centavos is not null
           then calculated.remaining_base
             * calculated.purchase_price_centavos::numeric
             / calculated.purchase_quantity_base
           else null::numeric end,
         case when calculated.period_id is null
                or calculated.opening_base is null then 'NOT COUNTED'::text
           when calculated.remaining_base <= 0 then 'RESTOCK'::text
           when calculated.low_stock_threshold_base is not null
             and calculated.remaining_base <= calculated.low_stock_threshold_base
             then 'RESTOCK'::text
           else 'OK'::text end,
         calculated.row_color_hex, calculated.item_revision,
         calculated.period_item_revision,
         calculated.opening_base is not null,
         calculated.opening_base is not null,
         true, calculated.updated_at
  from calculated
  order by lower(calculated.category_name), lower(calculated.item_name),
           calculated.inventory_item_id;
end;
$$;

create or replace function public._pos_inventory_sale_event_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.pos_sales%rowtype;
  v_period public.pos_inventory_periods%rowtype;
  v_sale_item record;
  v_component record;
  v_item public.pos_inventory_items%rowtype;
  v_original public.pos_inventory_transactions%rowtype;
  v_original_line record;
  v_components jsonb := '[]'::jsonb;
  v_resolved jsonb := '[]'::jsonb;
  v_fingerprint text;
  v_transaction_id uuid;
  v_balance_before numeric;
  v_balance_after numeric;
  v_sequence bigint;
  v_revision_after bigint;
  v_line_number integer := 0;
  v_error_message text;
  v_error_detail text;
  v_error_hint text;
  v_exception_code text := 'sale_inventory_error';
begin
  select sale.* into v_sale
  from public.pos_sales as sale
  where sale.business_id = new.business_id and sale.id = new.sale_id;
  if not found or v_sale.is_training then
    return new;
  end if;
  if new.event_type <> 'completed'
    and not (new.retain_cost = false and new.event_type in (
      'void_before_preparation', 'refund_before_preparation'
    )) then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('pos-inventory:' || new.business_id::text, 0)
  );

  if new.event_type = 'completed' then
    if exists (
      select 1 from public.pos_inventory_transactions as inventory_tx
      where inventory_tx.business_id = new.business_id
        and inventory_tx.transaction_type = 'sale_usage'
        and inventory_tx.source_sale_id = new.sale_id
    ) then
      return new;
    end if;
    select period.* into v_period
    from public.pos_inventory_periods as period
    where period.business_id = new.business_id and period.status = 'open'
    for update;
    if not found then
      insert into public.pos_inventory_exceptions (
        business_id, sale_id, sale_event_id, exception_code, details
      ) values (
        new.business_id, new.sale_id, new.id, 'no_open_period',
        jsonb_build_object('receiptNumber', v_sale.receipt_number)
      ) on conflict (business_id, sale_event_id, exception_code) do nothing;
      return new;
    end if;
    if exists (
      select 1 from public.pos_sale_items as sale_item
      where sale_item.business_id = new.business_id
        and sale_item.sale_id = new.sale_id
        and sale_item.matcha_option_id is not null
    ) then
      insert into public.pos_inventory_exceptions (
        business_id, sale_id, sale_event_id, period_id,
        exception_code, details
      ) values (
        new.business_id, new.sale_id, new.id, v_period.id,
        'matcha_upgrade_mapping_required',
        jsonb_build_object(
          'receiptNumber', v_sale.receipt_number,
          'message', 'No physical source substitution is configured for this Matcha upgrade.'
        )
      ) on conflict (business_id, sale_event_id, exception_code) do nothing;
      return new;
    end if;

    for v_sale_item in
      select sale_item.quantity, sale_item.product_version_id,
             version.costing_snapshot
      from public.pos_sale_items as sale_item
      join public.pos_product_versions as version
        on version.business_id = sale_item.business_id
       and version.id = sale_item.product_version_id
      where sale_item.business_id = new.business_id
        and sale_item.sale_id = new.sale_id
      order by sale_item.line_number
    loop
      for v_component in
        select component.source_type, component.source_costing_id,
               component.quantity_base, component.base_unit
        from public._pos_inventory_snapshot_components(
          v_sale_item.costing_snapshot
        ) as component
      loop
        v_components := v_components || jsonb_build_array(jsonb_build_object(
          'sourceType', v_component.source_type,
          'sourceCostingId', v_component.source_costing_id,
          'quantityBase', v_component.quantity_base * v_sale_item.quantity,
          'baseUnit', v_component.base_unit
        ));
      end loop;
    end loop;
    if jsonb_array_length(v_components) = 0 then
      raise exception 'The completed sale has no inventory components.'
        using errcode = '22023';
    end if;

    for v_component in
      select component.value ->> 'sourceType' as source_type,
             component.value ->> 'sourceCostingId' as source_costing_id,
             component.value ->> 'baseUnit' as base_unit,
             sum((component.value ->> 'quantityBase')::numeric)::numeric(20,6)
               as quantity_base
      from jsonb_array_elements(v_components) as component(value)
      group by component.value ->> 'sourceType',
               component.value ->> 'sourceCostingId',
               component.value ->> 'baseUnit'
      order by component.value ->> 'sourceType',
               component.value ->> 'sourceCostingId'
    loop
      select item.* into v_item
      from public.pos_inventory_items as item
      where item.business_id = new.business_id and item.active = true
        and item.source_type = v_component.source_type
        and item.source_costing_id = v_component.source_costing_id;
      if not found then
        v_exception_code := 'inventory_source_missing';
        raise exception 'Inventory source %:% is not synchronized.',
          v_component.source_type, v_component.source_costing_id
          using errcode = 'P0002';
      end if;
      if v_item.base_unit is distinct from v_component.base_unit then
        v_exception_code := 'inventory_source_unit_mismatch';
        raise exception 'Inventory source %:% has an incompatible unit.',
          v_component.source_type, v_component.source_costing_id
          using errcode = '22023';
      end if;
      v_resolved := v_resolved || jsonb_build_array(jsonb_build_object(
        'inventoryItemId', v_item.id,
        'sourceType', v_component.source_type,
        'sourceCostingId', v_component.source_costing_id,
        'quantityBase', v_component.quantity_base,
        'baseUnit', v_component.base_unit
      ));
    end loop;

    perform item.id
    from public.pos_inventory_items as item
    join jsonb_array_elements(v_resolved) as resolved(value)
      on item.id = (resolved.value ->> 'inventoryItemId')::uuid
    where item.business_id = new.business_id
    order by item.id
    for update of item;

    v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
      'inventoryOperationSchemaVersion', 1,
      'type', 'sale_usage', 'saleId', new.sale_id,
      'saleEventId', new.id, 'periodId', v_period.id,
      'resolvedLines', v_resolved
    )::text, 'UTF8')), 'hex');
    insert into public.pos_inventory_transactions (
      business_id, client_transaction_id, request_fingerprint,
      transaction_type, metadata, recorded_by, inventory_period_id,
      source_sale_id, source_sale_event_id
    ) values (
      new.business_id, new.id, v_fingerprint, 'sale_usage',
      jsonb_build_object(
        'operationSchemaVersion', 1,
        'receiptNumber', v_sale.receipt_number
      ), new.acted_by, v_period.id, new.sale_id, new.id
    ) returning id into v_transaction_id;

    for v_component in
      select resolved.value
      from jsonb_array_elements(v_resolved) as resolved(value)
      order by resolved.value ->> 'inventoryItemId'
    loop
      select item.* into strict v_item
      from public.pos_inventory_items as item
      where item.business_id = new.business_id
        and item.id = (v_component.value ->> 'inventoryItemId')::uuid;
      v_balance_before := public._pos_inventory_balance(new.business_id, v_item.id);
      v_balance_after := v_balance_before
        - (v_component.value ->> 'quantityBase')::numeric;
      select coalesce(max(line.item_sequence), 0) + 1 into v_sequence
      from public.pos_inventory_transaction_lines as line
      where line.business_id = new.business_id
        and line.inventory_item_id = v_item.id;
      update public.pos_inventory_items as item
      set revision = item.revision + 1, updated_by = new.acted_by
      where item.business_id = new.business_id and item.id = v_item.id
      returning item.revision into v_revision_after;
      v_line_number := v_line_number + 1;
      insert into public.pos_inventory_transaction_lines (
        business_id, transaction_id, line_number, inventory_item_id,
        item_sequence, item_name_snapshot, base_unit_snapshot,
        input_quantity, input_unit, input_quantity_base,
        quantity_delta_base, balance_before_base, balance_after_base,
        item_revision_before, item_revision_after
      ) values (
        new.business_id, v_transaction_id, v_line_number, v_item.id,
        v_sequence, v_item.name, v_item.base_unit,
        (v_component.value ->> 'quantityBase')::numeric, v_item.base_unit,
        (v_component.value ->> 'quantityBase')::numeric,
        -(v_component.value ->> 'quantityBase')::numeric,
        v_balance_before, v_balance_after, v_item.revision, v_revision_after
      );
    end loop;
    return new;
  end if;

  -- A before-preparation reversal always copies the exact committed usage;
  -- it never re-evaluates the current recipe or catalog.
  if new.amount_centavos <> v_sale.total_centavos then
    insert into public.pos_inventory_exceptions (
      business_id, sale_id, sale_event_id, exception_code, details
    ) values (
      new.business_id, new.sale_id, new.id, 'partial_reversal_unsupported',
      jsonb_build_object('eventAmountCentavos', new.amount_centavos,
                         'saleTotalCentavos', v_sale.total_centavos)
    ) on conflict (business_id, sale_event_id, exception_code) do nothing;
    return new;
  end if;
  select inventory_tx.* into v_original
  from public.pos_inventory_transactions as inventory_tx
  where inventory_tx.business_id = new.business_id
    and inventory_tx.source_sale_id = new.sale_id
    and inventory_tx.transaction_type = 'sale_usage'
  for share;
  if not found then
    insert into public.pos_inventory_exceptions (
      business_id, sale_id, sale_event_id, exception_code, details
    ) values (
      new.business_id, new.sale_id, new.id, 'sale_usage_missing_for_reversal',
      jsonb_build_object('receiptNumber', v_sale.receipt_number)
    ) on conflict (business_id, sale_event_id, exception_code) do nothing;
    return new;
  end if;
  select period.* into v_period
  from public.pos_inventory_periods as period
  where period.business_id = new.business_id
    and period.id = v_original.inventory_period_id
  for update;
  if not found or v_period.status <> 'open' then
    insert into public.pos_inventory_exceptions (
      business_id, sale_id, sale_event_id, period_id,
      exception_code, details
    ) values (
      new.business_id, new.sale_id, new.id,
      v_original.inventory_period_id, 'reversal_period_not_open',
      jsonb_build_object('receiptNumber', v_sale.receipt_number)
    ) on conflict (business_id, sale_event_id, exception_code) do nothing;
    return new;
  end if;

  perform item.id
  from public.pos_inventory_items as item
  join public.pos_inventory_transaction_lines as original_line
    on original_line.business_id = item.business_id
   and original_line.inventory_item_id = item.id
  where item.business_id = new.business_id
    and original_line.transaction_id = v_original.id
  order by item.id
  for update of item;

  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'inventoryOperationSchemaVersion', 1,
    'type', 'sale_reversal', 'saleId', new.sale_id,
    'saleEventId', new.id, 'reversesTransactionId', v_original.id
  )::text, 'UTF8')), 'hex');
  insert into public.pos_inventory_transactions (
    business_id, client_transaction_id, request_fingerprint,
    transaction_type, metadata, recorded_by, inventory_period_id,
    source_sale_id, source_sale_event_id, reverses_transaction_id
  ) values (
    new.business_id, new.id, v_fingerprint, 'sale_reversal',
    jsonb_build_object('operationSchemaVersion', 1,
                       'receiptNumber', v_sale.receipt_number),
    new.acted_by, v_original.inventory_period_id, new.sale_id, new.id,
    v_original.id
  ) returning id into v_transaction_id;

  v_line_number := 0;
  for v_original_line in
    select line.*
    from public.pos_inventory_transaction_lines as line
    where line.business_id = new.business_id
      and line.transaction_id = v_original.id
    order by line.line_number
  loop
    select item.* into strict v_item
    from public.pos_inventory_items as item
    where item.business_id = new.business_id
      and item.id = v_original_line.inventory_item_id;
    v_balance_before := public._pos_inventory_balance(new.business_id, v_item.id);
    v_balance_after := v_balance_before - v_original_line.quantity_delta_base;
    select coalesce(max(line.item_sequence), 0) + 1 into v_sequence
    from public.pos_inventory_transaction_lines as line
    where line.business_id = new.business_id
      and line.inventory_item_id = v_item.id;
    update public.pos_inventory_items as item
    set revision = item.revision + 1, updated_by = new.acted_by
    where item.business_id = new.business_id and item.id = v_item.id
    returning item.revision into v_revision_after;
    v_line_number := v_line_number + 1;
    insert into public.pos_inventory_transaction_lines (
      business_id, transaction_id, line_number, inventory_item_id,
      item_sequence, item_name_snapshot, base_unit_snapshot,
      input_quantity, input_unit, input_quantity_base,
      quantity_delta_base, balance_before_base, balance_after_base,
      item_revision_before, item_revision_after
    ) values (
      new.business_id, v_transaction_id, v_line_number, v_item.id,
      v_sequence, v_item.name, v_item.base_unit,
      -v_original_line.input_quantity, v_original_line.input_unit,
      -v_original_line.input_quantity_base,
      -v_original_line.quantity_delta_base,
      v_balance_before, v_balance_after, v_item.revision, v_revision_after
    );
  end loop;
  return new;
exception when others then
  get stacked diagnostics v_error_message = message_text,
    v_error_detail = pg_exception_detail, v_error_hint = pg_exception_hint;
  begin
    insert into public.pos_inventory_exceptions (
      business_id, sale_id, sale_event_id, period_id,
      exception_code, details
    ) values (
      new.business_id, new.sale_id, new.id,
      case when v_period.id is null then null else v_period.id end,
      v_exception_code,
      jsonb_strip_nulls(jsonb_build_object(
        'message', v_error_message, 'detail', v_error_detail,
        'hint', v_error_hint, 'eventType', new.event_type
      ))
    ) on conflict (business_id, sale_event_id, exception_code) do nothing;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create trigger pos_inventory_sale_events_apply
after insert on public.pos_sale_events
for each row execute function public._pos_inventory_sale_event_trigger();

create or replace function public.pos_inventory_guard_packaging_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source record;
  v_item record;
  v_source_id text;
begin
  if tg_op = 'DELETE' or new.id <> 'main'
    or (tg_op = 'UPDATE' and new.data is not distinct from old.data) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if new.data ? 'packaging'
    and jsonb_typeof(new.data -> 'packaging') is distinct from 'array' then
    raise exception 'The costing packaging field must be a JSON array.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(new.data -> 'packaging') = 'array'
        then new.data -> 'packaging' else '[]'::jsonb end
    ) as source(value)
    group by btrim(coalesce(source.value ->> 'id', ''))
    having count(*) > 1
  ) then
    raise exception 'The costing document cannot contain duplicate packaging IDs.'
      using errcode = '22023';
  end if;
  for v_source in
    select source.value
    from jsonb_array_elements(
      case when jsonb_typeof(new.data -> 'packaging') = 'array'
        then new.data -> 'packaging' else '[]'::jsonb end
    ) as source(value)
  loop
    v_source_id := btrim(coalesce(v_source.value ->> 'id', ''));
    if jsonb_typeof(v_source.value) is distinct from 'object'
      or char_length(v_source_id) not between 1 and 180 then
      raise exception 'Every packaging item needs a valid ID.' using errcode = '22023';
    end if;
    for v_item in
      select item.active, item.name
      from public.pos_inventory_items as item
      where item.source_type = 'packaging'
        and item.source_costing_id = v_source_id
      order by item.business_id, item.id
      for update
    loop
      if not v_item.active then
        raise exception 'Cannot restore archived packaging source "%" from a stale save.',
          v_item.name using errcode = '55000';
      end if;
    end loop;
  end loop;
  if tg_op = 'UPDATE' then
    for v_source in
      select source.value
      from jsonb_array_elements(
        case when jsonb_typeof(old.data -> 'packaging') = 'array'
          then old.data -> 'packaging' else '[]'::jsonb end
      ) as source(value)
      where not exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(new.data -> 'packaging') = 'array'
            then new.data -> 'packaging' else '[]'::jsonb end
        ) as current_source(value)
        where btrim(coalesce(current_source.value ->> 'id', '')) =
          btrim(coalesce(source.value ->> 'id', ''))
      )
    loop
      v_source_id := btrim(coalesce(v_source.value ->> 'id', ''));
      update public.pos_inventory_items as item
      set active = false, revision = item.revision + 1,
          updated_by = coalesce(auth.uid(), item.updated_by)
      where item.source_type = 'packaging'
        and item.source_costing_id = v_source_id and item.active;
    end loop;
  end if;
  return new;
end;
$$;

create trigger pos_inventory_packaging_state_guard
before insert or update or delete on public.scoopies_state
for each row execute function public.pos_inventory_guard_packaging_state();

alter table public.pos_inventory_periods enable row level security;
alter table public.pos_inventory_period_items enable row level security;
alter table public.pos_inventory_cell_events enable row level security;
alter table public.pos_inventory_exceptions enable row level security;

create policy pos_inventory_periods_member_read
on public.pos_inventory_periods for select to authenticated
using (public.pos_is_member(business_id));

create policy pos_inventory_period_items_member_read
on public.pos_inventory_period_items for select to authenticated
using (public.pos_is_member(business_id));

create policy pos_inventory_cell_events_manager_read
on public.pos_inventory_cell_events for select to authenticated
using (public.pos_has_role(business_id, array['owner', 'manager']));

create policy pos_inventory_exceptions_manager_read
on public.pos_inventory_exceptions for select to authenticated
using (public.pos_has_role(business_id, array['owner', 'manager']));

revoke all on table
  public.pos_inventory_periods,
  public.pos_inventory_period_items,
  public.pos_inventory_cell_events,
  public.pos_inventory_exceptions
from public, anon, authenticated;

grant select on table
  public.pos_inventory_periods,
  public.pos_inventory_period_items
to authenticated;

grant select on table
  public.pos_inventory_cell_events,
  public.pos_inventory_exceptions
to authenticated;

revoke all on function public._pos_inventory_expand_snapshot_ingredient(
  jsonb, text, numeric, integer, text[]
) from public, anon, authenticated;
revoke all on function public._pos_inventory_snapshot_components(jsonb)
  from public, anon, authenticated;
revoke all on function public._pos_inventory_display_factor(text)
  from public, anon, authenticated;
revoke all on function public._pos_inventory_sale_event_trigger()
  from public, anon, authenticated;
revoke all on function public.pos_inventory_guard_packaging_state()
  from public, anon, authenticated;
revoke all on function public.pos_inventory_protect_period_append_only()
  from public, anon, authenticated;
revoke all on function public.pos_inventory_fill_source_identity()
  from public, anon, authenticated;
revoke all on function public.pos_inventory_guard_legacy_period_movement()
  from public, anon, authenticated;

revoke all on function public.pos_inventory_sync_spreadsheet_sources(uuid)
  from public, anon, authenticated;
revoke all on function public.pos_inventory_start_period(uuid, uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function public.pos_inventory_close_period(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.pos_inventory_set_spreadsheet_cell(
  uuid, uuid, uuid, uuid, text, text, bigint, bigint
) from public, anon, authenticated;
revoke all on function public.pos_inventory_get_spreadsheet(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.pos_inventory_sync_spreadsheet_sources(uuid)
  to authenticated;
grant execute on function public.pos_inventory_start_period(uuid, uuid, text, boolean)
  to authenticated;
grant execute on function public.pos_inventory_close_period(uuid, uuid, uuid, text)
  to authenticated;
grant execute on function public.pos_inventory_set_spreadsheet_cell(
  uuid, uuid, uuid, uuid, text, text, bigint, bigint
) to authenticated;
grant execute on function public.pos_inventory_get_spreadsheet(uuid, uuid)
  to authenticated;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 13, 'name', 'inventory_period_spreadsheet'),
  now()
)
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;

comment on table public.pos_inventory_periods is
  'One auditable inventory spreadsheet period per business; only one may be open.';
comment on table public.pos_inventory_period_items is
  'Current direct-entry period cells plus immutable expected closing snapshots.';
comment on table public.pos_inventory_cell_events is
  'Append-only, idempotent audit history for every direct spreadsheet cell save.';
comment on table public.pos_inventory_exceptions is
  'Fail-open POS inventory issues that require owner review without rejecting a sale.';
comment on function public.pos_inventory_get_spreadsheet(uuid, uuid) is
  'Returns the exact period spreadsheet, including derived use, balance, value, and restock status.';

commit;
