-- Scoopies Inventory Phase 1: manual stock ledger and management RPCs.
--
-- Inventory quantities are physical facts in canonical base units (g, ml,
-- piece). They are deliberately separate from costing prices and from the
-- legacy scoopies_state JSON document. Browser roles receive no direct table
-- privileges: all reads and changes pass through the audited functions below.

begin;

create table public.pos_inventory_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  source_costing_ingredient_id text not null
    check (char_length(btrim(source_costing_ingredient_id)) between 1 and 200),
  item_kind text not null check (item_kind in ('purchased', 'mixture')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  base_unit text not null check (base_unit in ('g', 'ml', 'piece')),
  low_stock_threshold_base numeric(20,6)
    check (low_stock_threshold_base is null or low_stock_threshold_base between 0 and 1000000000000),
  active boolean not null default true,
  revision bigint not null default 1 check (revision > 0),
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, source_costing_ingredient_id),
  unique (source_costing_ingredient_id),
  foreign key (business_id, created_by)
    references public.pos_business_members(business_id, user_id) on delete restrict,
  foreign key (business_id, updated_by)
    references public.pos_business_members(business_id, user_id) on delete restrict
);

create index pos_inventory_items_business_active_name_idx
  on public.pos_inventory_items (business_id, active, lower(name), id);

create table public.pos_inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  client_transaction_id uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  transaction_type text not null
    check (transaction_type in ('stock_in', 'waste', 'correction', 'stock_count')),
  reason text,
  note text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 65536),
  recorded_by uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, client_transaction_id),
  foreign key (business_id, recorded_by)
    references public.pos_business_members(business_id, user_id) on delete restrict,
  check (reason is null or char_length(btrim(reason)) between 1 and 500),
  check (note is null or char_length(btrim(note)) between 1 and 1000),
  check (transaction_type not in ('waste', 'correction')
    or (reason is not null and char_length(btrim(reason)) between 3 and 500))
);

create index pos_inventory_transactions_business_time_idx
  on public.pos_inventory_transactions (business_id, occurred_at desc, id desc);

create table public.pos_inventory_transaction_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.pos_businesses(id) on delete restrict,
  transaction_id uuid not null,
  line_number integer not null check (line_number > 0),
  inventory_item_id uuid not null,
  item_sequence bigint not null check (item_sequence > 0),
  item_name_snapshot text not null
    check (char_length(btrim(item_name_snapshot)) between 1 and 120),
  base_unit_snapshot text not null check (base_unit_snapshot in ('g', 'ml', 'piece')),
  input_quantity numeric(20,6) not null
    check (input_quantity between -1000000000000 and 1000000000000),
  input_unit text not null check (input_unit in ('g', 'kg', 'ml', 'l', 'piece')),
  input_quantity_base numeric(20,6) not null
    check (input_quantity_base between -1000000000000 and 1000000000000),
  quantity_delta_base numeric(20,6) not null
    check (quantity_delta_base between -1000000000000 and 1000000000000),
  balance_before_base numeric(20,6) not null
    check (balance_before_base between 0 and 1000000000000),
  balance_after_base numeric(20,6) not null
    check (balance_after_base between 0 and 1000000000000),
  item_revision_before bigint not null check (item_revision_before > 0),
  item_revision_after bigint not null check (item_revision_after = item_revision_before + 1),
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (transaction_id, line_number),
  unique (transaction_id, inventory_item_id),
  unique (business_id, inventory_item_id, item_sequence),
  foreign key (business_id, transaction_id)
    references public.pos_inventory_transactions(business_id, id) on delete restrict,
  foreign key (business_id, inventory_item_id)
    references public.pos_inventory_items(business_id, id) on delete restrict,
  check (balance_after_base = balance_before_base + quantity_delta_base)
);

create index pos_inventory_lines_item_history_idx
  on public.pos_inventory_transaction_lines
    (business_id, inventory_item_id, item_sequence desc);

create index pos_inventory_lines_transaction_idx
  on public.pos_inventory_transaction_lines (business_id, transaction_id, line_number);

create or replace function public._pos_inventory_base_unit(p_unit text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_unit
    when 'g' then 'g' when 'kg' then 'g'
    when 'ml' then 'ml' when 'l' then 'ml'
    when 'piece' then 'piece' else null
  end;
$$;

create or replace function public._pos_inventory_to_base(
  p_quantity numeric,
  p_unit text
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_unit
    when 'kg' then p_quantity * 1000
    when 'l' then p_quantity * 1000
    when 'g' then p_quantity
    when 'ml' then p_quantity
    when 'piece' then p_quantity
    else null
  end;
$$;

create or replace function public._pos_inventory_balance(
  p_business_id uuid,
  p_inventory_item_id uuid
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(line.quantity_delta_base), 0)::numeric(20,6)
  from public.pos_inventory_transaction_lines as line
  where line.business_id = p_business_id
    and line.inventory_item_id = p_inventory_item_id;
$$;

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
    raise exception 'An inventory item kind or base unit cannot change after its identity is created; create a new costing ingredient instead.'
      using errcode = '55000';
  end if;

  if old.active = true and new.active = false
    and public._pos_inventory_balance(old.business_id, old.id) <> 0 then
    raise exception 'Stock must be zero before an inventory item can be deactivated.'
      using errcode = '55000';
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create or replace function public.pos_inventory_guard_costing_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source record;
  v_item record;
  v_recipe record;
  v_line record;
  v_source_id text;
  v_dependency_id text;
  v_kind text;
  v_base_unit text;
  v_has_tombstone boolean;
begin
  if tg_op = 'DELETE' then
    if old.id = 'main' then
      raise exception 'The main costing document cannot be deleted.'
        using errcode = '55000';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.id = 'main'
    and new.id is distinct from 'main' then
    raise exception 'The main costing document ID cannot be changed.'
      using errcode = '55000';
  end if;
  if new.id <> 'main'
    or (tg_op = 'UPDATE' and new.data is not distinct from old.data) then
    return new;
  end if;
  if new.data is null or pg_catalog.jsonb_typeof(new.data) <> 'object' then
    raise exception 'The costing document must be a JSON object.' using errcode = '22023';
  end if;
  if new.data ? 'ingredients'
    and pg_catalog.jsonb_typeof(new.data -> 'ingredients') <> 'array' then
    raise exception 'The costing ingredients field must be a JSON array.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      coalesce(new.data -> 'ingredients', '[]'::jsonb)
    ) as source(value)
    where pg_catalog.jsonb_typeof(source.value) = 'object'
    group by btrim(coalesce(source.value ->> 'id', ''))
    having count(*) > 1
  ) then
    raise exception 'The costing document cannot contain duplicate ingredient IDs.'
      using errcode = '22023';
  end if;

  for v_source in
    select source.value, source.ordinality
    from pg_catalog.jsonb_array_elements(
      coalesce(new.data -> 'ingredients', '[]'::jsonb)
    ) with ordinality as source(value, ordinality)
    order by source.ordinality
  loop
    if pg_catalog.jsonb_typeof(v_source.value) <> 'object' then
      raise exception 'Every costing ingredient must be a JSON object.' using errcode = '22023';
    end if;
    v_source_id := btrim(coalesce(v_source.value ->> 'id', ''));
    if char_length(v_source_id) not between 1 and 200 then
      raise exception 'Every costing ingredient needs an ID from 1 to 200 characters.'
        using errcode = '22023';
    end if;
    v_kind := case when v_source.value ->> 'kind' = 'mixture'
      then 'mixture' else 'purchased' end;
    v_base_unit := public._pos_inventory_base_unit(
      btrim(coalesce(v_source.value ->> 'unit', ''))
    );
    if v_base_unit is null then
      raise exception 'Costing ingredient % has an invalid inventory unit.', v_source_id
        using errcode = '22023';
    end if;
    if v_source.value ? 'components'
      and pg_catalog.jsonb_typeof(v_source.value -> 'components') <> 'array' then
      raise exception 'Every combined-cost component list must be a JSON array.'
        using errcode = '22023';
    end if;
    for v_line in
      select component.value
      from pg_catalog.jsonb_array_elements(
        coalesce(v_source.value -> 'components', '[]'::jsonb)
      ) as component(value)
    loop
      if pg_catalog.jsonb_typeof(v_line.value) <> 'object' then
        raise exception 'Every combined-cost component must be a JSON object.'
          using errcode = '22023';
      end if;
      v_dependency_id := btrim(coalesce(v_line.value ->> 'ingredientId', ''));
      if v_dependency_id <> ''
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(new.data -> 'ingredients', '[]'::jsonb)
          ) as candidate(value)
          where pg_catalog.jsonb_typeof(candidate.value) = 'object'
            and btrim(coalesce(candidate.value ->> 'id', '')) = v_dependency_id
        ) then
        raise exception 'Combined cost "%" references missing ingredient ID %.',
          coalesce(nullif(btrim(v_source.value ->> 'name'), ''), 'untitled'),
          v_dependency_id
          using errcode = '55000';
      end if;
    end loop;

    -- Lock matching identities in deterministic order. Besides protecting the
    -- identity comparison, this makes a stale full-document update wait for an
    -- in-flight atomic delete and then observe its committed tombstone.
    for v_item in
      select item.active, item.item_kind, item.base_unit, item.name
      from public.pos_inventory_items as item
      where item.source_costing_ingredient_id = v_source_id
      order by item.business_id, item.id
      for update
    loop
      if not v_item.active then
        raise exception 'Cannot restore deleted costing source "%" from a stale cloud save. Refresh before saving again.', v_item.name
          using errcode = '55000';
      end if;
      if v_item.item_kind is distinct from v_kind
        or v_item.base_unit is distinct from v_base_unit then
        raise exception 'Cannot change the kind or physical unit for inventory source "%". Create a new costing ingredient instead.', v_item.name
          using errcode = '55000';
      end if;
    end loop;
  end loop;

  if new.data ? 'recipes'
    and pg_catalog.jsonb_typeof(new.data -> 'recipes') <> 'array' then
    raise exception 'The costing recipes field must be a JSON array.' using errcode = '22023';
  end if;
  for v_recipe in
    select recipe.value
    from pg_catalog.jsonb_array_elements(
      coalesce(new.data -> 'recipes', '[]'::jsonb)
    ) as recipe(value)
  loop
    if pg_catalog.jsonb_typeof(v_recipe.value) <> 'object'
      or (v_recipe.value ? 'lines'
        and pg_catalog.jsonb_typeof(v_recipe.value -> 'lines') <> 'array') then
      raise exception 'Every recipe and its lines must use the expected JSON structure.'
        using errcode = '22023';
    end if;
    for v_line in
      select line.value
      from pg_catalog.jsonb_array_elements(
        coalesce(v_recipe.value -> 'lines', '[]'::jsonb)
      ) as line(value)
    loop
      if pg_catalog.jsonb_typeof(v_line.value) <> 'object' then
        raise exception 'Every recipe line must be a JSON object.' using errcode = '22023';
      end if;
      v_dependency_id := btrim(coalesce(v_line.value ->> 'ingredientId', ''));
      if v_dependency_id <> ''
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(new.data -> 'ingredients', '[]'::jsonb)
          ) as candidate(value)
          where pg_catalog.jsonb_typeof(candidate.value) = 'object'
            and btrim(coalesce(candidate.value ->> 'id', '')) = v_dependency_id
        ) then
        raise exception 'Recipe "%" references missing ingredient ID %.',
          coalesce(nullif(btrim(v_recipe.value ->> 'name'), ''), 'untitled'),
          v_dependency_id
          using errcode = '55000';
      end if;
    end loop;
  end loop;

  if new.data ? 'mixtureDrafts'
    and pg_catalog.jsonb_typeof(new.data -> 'mixtureDrafts') <> 'array' then
    raise exception 'The combined-cost drafts field must be a JSON array.'
      using errcode = '22023';
  end if;
  for v_recipe in
    select draft.value
    from pg_catalog.jsonb_array_elements(
      coalesce(new.data -> 'mixtureDrafts', '[]'::jsonb)
    ) as draft(value)
  loop
    if pg_catalog.jsonb_typeof(v_recipe.value) <> 'object'
      or (v_recipe.value ? 'data'
        and pg_catalog.jsonb_typeof(v_recipe.value -> 'data') <> 'object')
      or (
        coalesce(v_recipe.value -> 'data', '{}'::jsonb) ? 'components'
        and pg_catalog.jsonb_typeof(
          coalesce(v_recipe.value -> 'data', '{}'::jsonb) -> 'components'
        ) <> 'array'
      )
      or (
        coalesce(v_recipe.value -> 'data', '{}'::jsonb) ? 'pendingIngredients'
        and pg_catalog.jsonb_typeof(
          coalesce(v_recipe.value -> 'data', '{}'::jsonb) -> 'pendingIngredients'
        ) <> 'array'
      ) then
      raise exception 'Every combined-cost draft must use the expected JSON structure.'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(
          v_recipe.value -> 'data' -> 'pendingIngredients',
          '[]'::jsonb
        )
      ) as pending(value)
      where pg_catalog.jsonb_typeof(pending.value) <> 'object'
        or char_length(btrim(coalesce(pending.value ->> 'id', '')))
          not between 1 and 200
    ) or exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(
          v_recipe.value -> 'data' -> 'pendingIngredients',
          '[]'::jsonb
        )
      ) as pending(value)
      group by btrim(coalesce(pending.value ->> 'id', ''))
      having count(*) > 1
    ) then
      raise exception 'Every draft-local pending ingredient needs a unique valid ID.'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(
          v_recipe.value -> 'data' -> 'pendingIngredients',
          '[]'::jsonb
        )
      ) as pending(value)
      where exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(new.data -> 'ingredients', '[]'::jsonb)
          ) as candidate(value)
          where btrim(coalesce(candidate.value ->> 'id', ''))
            = btrim(coalesce(pending.value ->> 'id', ''))
        )
        or exists (
          select 1
          from public.pos_inventory_items as item
          where item.source_costing_ingredient_id
            = btrim(coalesce(pending.value ->> 'id', ''))
        )
    ) then
      raise exception 'A draft-local pending ingredient cannot reuse a saved or inventory source ID.'
        using errcode = '55000';
    end if;
    for v_line in
      select component.value
      from pg_catalog.jsonb_array_elements(
        coalesce(v_recipe.value -> 'data' -> 'components', '[]'::jsonb)
      ) as component(value)
    loop
      if pg_catalog.jsonb_typeof(v_line.value) <> 'object' then
        raise exception 'Every draft component must be a JSON object.'
          using errcode = '22023';
      end if;
      v_dependency_id := btrim(coalesce(v_line.value ->> 'ingredientId', ''));
      if v_dependency_id <> ''
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(new.data -> 'ingredients', '[]'::jsonb)
          ) as candidate(value)
          where pg_catalog.jsonb_typeof(candidate.value) = 'object'
            and btrim(coalesce(candidate.value ->> 'id', '')) = v_dependency_id
        )
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(
              v_recipe.value -> 'data' -> 'pendingIngredients',
              '[]'::jsonb
            )
          ) as pending(value)
          where pg_catalog.jsonb_typeof(pending.value) = 'object'
            and btrim(coalesce(pending.value ->> 'id', '')) = v_dependency_id
        ) then
        raise exception 'Combined-cost draft "%" references missing ingredient ID %.',
          coalesce(
            nullif(btrim(v_recipe.value -> 'data' ->> 'name'), ''),
            'untitled'
          ),
          v_dependency_id
          using errcode = '55000';
      end if;
    end loop;
  end loop;

  -- Every removal must already have an inactive identity. The atomic delete
  -- RPC creates/deactivates that tombstone earlier in its transaction; a
  -- normal full-document upsert cannot silently omit an active or never-synced
  -- source and bypass the stock/dependency checks.
  if tg_op = 'UPDATE' then
    if old.data ? 'ingredients'
      and pg_catalog.jsonb_typeof(old.data -> 'ingredients') <> 'array' then
      raise exception 'The previous costing ingredients field is not a JSON array.'
        using errcode = '22023';
    end if;
    for v_source in
      select source.value
      from pg_catalog.jsonb_array_elements(
        coalesce(old.data -> 'ingredients', '[]'::jsonb)
      ) as source(value)
      where pg_catalog.jsonb_typeof(source.value) = 'object'
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(new.data -> 'ingredients', '[]'::jsonb)
          ) as current_source(value)
          where pg_catalog.jsonb_typeof(current_source.value) = 'object'
            and btrim(coalesce(current_source.value ->> 'id', ''))
              = btrim(coalesce(source.value ->> 'id', ''))
        )
    loop
      v_source_id := btrim(coalesce(v_source.value ->> 'id', ''));
      v_has_tombstone := false;
      for v_item in
        select item.active, item.item_kind, item.base_unit, item.name
        from public.pos_inventory_items as item
        where item.source_costing_ingredient_id = v_source_id
        order by item.business_id, item.id
        for update
      loop
        if v_item.active then
          raise exception 'Cannot remove costing source "%" with a normal cloud save. Use the inventory-safe delete action.', v_item.name
            using errcode = '55000';
        end if;
        v_has_tombstone := true;
      end loop;
      if not v_has_tombstone then
        raise exception 'Cannot remove costing source % with a normal cloud save. Use the inventory-safe delete action.', v_source_id
          using errcode = '55000';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.pos_inventory_sync_items(
  p_business_id uuid,
  p_items jsonb
)
returns table (
  inventory_item_id uuid,
  source_costing_ingredient_id text,
  item_kind text,
  item_name text,
  base_unit text,
  low_stock_threshold_base numeric,
  active boolean,
  revision bigint,
  sync_result text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry record;
  v_item public.pos_inventory_items%rowtype;
  v_source_id text;
  v_kind text;
  v_name text;
  v_base_unit text;
  v_result text;
  v_costing_data jsonb;
  v_costing_source jsonb;
  v_source_count integer;
  v_actual_kind text;
  v_actual_name text;
  v_actual_base text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can synchronize inventory items.'
      using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Inventory items must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'At most 500 inventory items can be synchronized at once.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(value)
    where jsonb_typeof(entry.value) <> 'object'
  ) then
    raise exception 'Every synchronized inventory item must be an object.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(value)
    group by btrim(coalesce(entry.value ->> 'sourceCostingIngredientId', ''))
    having count(*) > 1
  ) then
    raise exception 'A costing ingredient can appear only once in an inventory sync.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-inventory:' || p_business_id::text, 0)
  );
  select costing.data into v_costing_data
  from public.scoopies_state as costing
  where costing.id = 'main'
  for update;
  if not found then
    raise exception 'The main costing document was not found.' using errcode = 'P0002';
  end if;
  if pg_catalog.jsonb_typeof(v_costing_data) <> 'object'
    or (
      v_costing_data ? 'ingredients'
      and pg_catalog.jsonb_typeof(v_costing_data -> 'ingredients') <> 'array'
    ) then
    raise exception 'The main costing document has an invalid ingredients structure.'
      using errcode = '22023';
  end if;

  for v_entry in
    select entry.value, entry.ordinality
    from jsonb_array_elements(p_items) with ordinality as entry(value, ordinality)
    order by entry.ordinality
  loop
    v_source_id := btrim(coalesce(v_entry.value ->> 'sourceCostingIngredientId', ''));
    v_kind := btrim(coalesce(v_entry.value ->> 'kind', ''));
    v_name := btrim(coalesce(v_entry.value ->> 'name', ''));
    v_base_unit := btrim(coalesce(v_entry.value ->> 'baseUnit', ''));

    if char_length(v_source_id) not between 1 and 200 then
      raise exception 'Every inventory item needs a costing ingredient ID from 1 to 200 characters.'
        using errcode = '22023';
    end if;
    if v_kind not in ('purchased', 'mixture') then
      raise exception 'Inventory item % has an unknown kind.', v_source_id using errcode = '22023';
    end if;
    if char_length(v_name) not between 1 and 120 then
      raise exception 'Inventory item % needs a name from 1 to 120 characters.', v_source_id
        using errcode = '22023';
    end if;
    if v_base_unit not in ('g', 'ml', 'piece') then
      raise exception 'Inventory item % needs a canonical base unit of g, ml, or piece.', v_source_id
        using errcode = '22023';
    end if;

    select count(*)::integer into v_source_count
    from pg_catalog.jsonb_array_elements(
      coalesce(v_costing_data -> 'ingredients', '[]'::jsonb)
    ) as source(value)
    where pg_catalog.jsonb_typeof(source.value) = 'object'
      and btrim(coalesce(source.value ->> 'id', '')) = v_source_id;
    if v_source_count > 1 then
      raise exception 'The latest costing document contains duplicate source ID %.', v_source_id
        using errcode = '22023';
    end if;

    -- Resolve the globally unique identity while still holding the main-row
    -- lock. A stale client may harmlessly ask to sync an already-deleted
    -- source, but an absent source can never create, reactivate, or mutate an
    -- identity.
    select item.* into v_item
    from public.pos_inventory_items as item
    where item.source_costing_ingredient_id = v_source_id
    for update;
    if v_source_count = 0 then
      if not found then
        raise exception 'Costing source % is absent from the latest cloud document.', v_source_id
          using errcode = 'P0002';
      end if;
      if v_item.business_id is distinct from p_business_id then
        raise exception 'Costing source % is already attached to another business inventory.', v_source_id
          using errcode = '55000';
      end if;
      if v_item.active then
        raise exception 'Costing source % is absent while its inventory identity is still active. Restore or safely delete the source before synchronizing.', v_source_id
          using errcode = '55000';
      end if;
      if v_item.item_kind is distinct from v_kind
        or v_item.base_unit is distinct from v_base_unit then
        raise exception 'Deleted costing source % does not match its inactive inventory identity. Refresh before synchronizing.', v_source_id
          using errcode = '40001';
      end if;
      return query select v_item.id, v_item.source_costing_ingredient_id,
        v_item.item_kind, v_item.name, v_item.base_unit,
        v_item.low_stock_threshold_base, v_item.active, v_item.revision,
        'inactive'::text, v_item.updated_at;
      continue;
    end if;

    select source.value into v_costing_source
    from pg_catalog.jsonb_array_elements(
      coalesce(v_costing_data -> 'ingredients', '[]'::jsonb)
    ) as source(value)
    where pg_catalog.jsonb_typeof(source.value) = 'object'
      and btrim(coalesce(source.value ->> 'id', '')) = v_source_id;
    v_actual_kind := case when v_costing_source ->> 'kind' = 'mixture'
      then 'mixture' else 'purchased' end;
    v_actual_name := btrim(coalesce(v_costing_source ->> 'name', ''));
    v_actual_base := public._pos_inventory_base_unit(
      btrim(coalesce(v_costing_source ->> 'unit', ''))
    );
    if v_actual_kind is distinct from v_kind
      or v_actual_name is distinct from v_name
      or v_actual_base is distinct from v_base_unit then
      raise exception 'Costing source % changed on another device. Refresh before synchronizing inventory.', v_source_id
        using errcode = '40001';
    end if;

    if v_item.id is null then
      insert into public.pos_inventory_items (
        business_id, source_costing_ingredient_id, item_kind, name,
        base_unit, created_by, updated_by
      ) values (
        p_business_id, v_source_id, v_kind, v_name,
        v_base_unit, v_user_id, v_user_id
      ) returning * into v_item;
      v_result := 'created';
    elsif v_item.business_id is distinct from p_business_id then
      raise exception 'Costing source % is already attached to another business inventory.', v_source_id
        using errcode = '55000';
    elsif v_item.item_kind is distinct from v_kind
      or v_item.base_unit is distinct from v_base_unit then
      raise exception 'Cannot change the kind or base unit for existing inventory item "%"; create a new costing ingredient instead.', v_item.name
        using errcode = '55000';
    elsif v_item.name is distinct from v_name then
      update public.pos_inventory_items as item
      set name = v_name, revision = item.revision + 1, updated_by = v_user_id
      where item.business_id = p_business_id and item.id = v_item.id
      returning item.* into v_item;
      v_result := case when v_item.active then 'updated' else 'inactive' end;
    elsif not v_item.active then
      v_result := 'inactive';
    else
      v_result := 'unchanged';
    end if;

    return query select v_item.id, v_item.source_costing_ingredient_id,
      v_item.item_kind, v_item.name, v_item.base_unit,
      v_item.low_stock_threshold_base, v_item.active, v_item.revision,
      v_result, v_item.updated_at;
  end loop;
end;
$$;

create trigger pos_inventory_items_protected
before update or delete on public.pos_inventory_items
for each row execute function public.pos_inventory_protect_item();

create trigger pos_inventory_costing_state_guard
before insert or update or delete on public.scoopies_state
for each row execute function public.pos_inventory_guard_costing_state();

create trigger pos_inventory_transactions_immutable
before update or delete on public.pos_inventory_transactions
for each row execute function public.pos_forbid_mutation();

create trigger pos_inventory_transaction_lines_immutable
before update or delete on public.pos_inventory_transaction_lines
for each row execute function public.pos_forbid_mutation();

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
    and (p_include_inactive or item.active)
  order by item.active desc, pg_catalog.lower(item.name), item.id;
end;
$$;

create or replace function public.pos_inventory_set_threshold(
  p_business_id uuid,
  p_inventory_item_id uuid,
  p_threshold_base numeric,
  p_expected_revision bigint
)
returns table (
  inventory_item_id uuid,
  low_stock_threshold_base numeric,
  active boolean,
  revision bigint,
  updated_at timestamptz,
  is_retry boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.pos_inventory_items%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can change low-stock thresholds.'
      using errcode = '42501';
  end if;
  if p_threshold_base is not null
    and (p_threshold_base < 0 or p_threshold_base > 1000000000000) then
    raise exception 'Low-stock threshold must be null or from 0 to 1000000000000 base units.'
      using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'A positive expected item revision is required.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-inventory:' || p_business_id::text, 0)
  );
  select item.* into v_item
  from public.pos_inventory_items as item
  where item.business_id = p_business_id and item.id = p_inventory_item_id
  for update;
  if not found then
    raise exception 'The inventory item was not found.' using errcode = 'P0002';
  end if;

  if v_item.low_stock_threshold_base is not distinct from p_threshold_base then
    return query select v_item.id, v_item.low_stock_threshold_base,
      v_item.active, v_item.revision, v_item.updated_at, true;
    return;
  end if;
  if v_item.revision <> p_expected_revision then
    raise exception 'The inventory item changed on another device. Refresh and try again.'
      using errcode = '40001';
  end if;

  update public.pos_inventory_items as item
  set low_stock_threshold_base = p_threshold_base,
      revision = item.revision + 1, updated_by = v_user_id
  where item.business_id = p_business_id and item.id = p_inventory_item_id
  returning item.* into v_item;

  return query select v_item.id, v_item.low_stock_threshold_base,
    v_item.active, v_item.revision, v_item.updated_at, false;
end;
$$;

create or replace function public.pos_inventory_get_transactions(
  p_business_id uuid,
  p_inventory_item_id uuid default null,
  p_limit integer default 100
)
returns table (
  transaction_id uuid,
  client_transaction_id uuid,
  transaction_type text,
  reason text,
  note text,
  occurred_at timestamptz,
  created_at timestamptz,
  recorded_by uuid,
  recorded_by_name text,
  line_id uuid,
  line_number integer,
  item_sequence bigint,
  inventory_item_id uuid,
  item_name_snapshot text,
  base_unit_snapshot text,
  input_quantity numeric,
  input_unit text,
  input_quantity_base numeric,
  quantity_delta_base numeric,
  balance_before_base numeric,
  balance_after_base numeric,
  item_revision_before bigint,
  item_revision_after bigint
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
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can view inventory history.'
      using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception 'Inventory history limit must be from 1 to 200.' using errcode = '22023';
  end if;
  if p_inventory_item_id is not null and not exists (
    select 1 from public.pos_inventory_items as item
    where item.business_id = p_business_id and item.id = p_inventory_item_id
  ) then
    raise exception 'The inventory item was not found.' using errcode = 'P0002';
  end if;

  return query
  with selected_transactions as (
    select inventory_tx.id
    from public.pos_inventory_transactions as inventory_tx
    where inventory_tx.business_id = p_business_id
      and (p_inventory_item_id is null or exists (
        select 1 from public.pos_inventory_transaction_lines as filter_line
        where filter_line.business_id = inventory_tx.business_id
          and filter_line.transaction_id = inventory_tx.id
          and filter_line.inventory_item_id = p_inventory_item_id
      ))
    order by inventory_tx.occurred_at desc, inventory_tx.id desc
    limit p_limit
  )
  select inventory_tx.id, inventory_tx.client_transaction_id,
         inventory_tx.transaction_type, inventory_tx.reason, inventory_tx.note,
         inventory_tx.occurred_at, inventory_tx.created_at,
         inventory_tx.recorded_by, member.display_name,
         line.id, line.line_number, line.item_sequence, line.inventory_item_id,
         line.item_name_snapshot, line.base_unit_snapshot,
         line.input_quantity, line.input_unit, line.input_quantity_base,
         line.quantity_delta_base, line.balance_before_base,
         line.balance_after_base, line.item_revision_before,
         line.item_revision_after
  from selected_transactions as selected
  join public.pos_inventory_transactions as inventory_tx on inventory_tx.id = selected.id
  join public.pos_inventory_transaction_lines as line
    on line.business_id = inventory_tx.business_id and line.transaction_id = inventory_tx.id
  join public.pos_business_members as member
    on member.business_id = inventory_tx.business_id
   and member.user_id = inventory_tx.recorded_by
  where p_inventory_item_id is null
    or line.inventory_item_id = p_inventory_item_id
  order by inventory_tx.occurred_at desc, inventory_tx.id desc, line.line_number;
end;
$$;

create or replace function public.pos_inventory_prepare_source_change(
  p_business_id uuid,
  p_source_costing_ingredient_id text,
  p_item_kind text,
  p_name text,
  p_base_unit text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_source_id text := btrim(coalesce(p_source_costing_ingredient_id, ''));
  v_kind text := btrim(coalesce(p_item_kind, ''));
  v_name text := btrim(coalesce(p_name, ''));
  v_base text := btrim(coalesce(p_base_unit, ''));
  v_item public.pos_inventory_items%rowtype;
  v_costing_data jsonb;
  v_costing_source jsonb;
  v_source_count integer;
  v_actual_kind text;
  v_actual_name text;
  v_actual_base text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can prepare inventory source changes.'
      using errcode = '42501';
  end if;
  if char_length(v_source_id) not between 1 and 200
    or v_kind not in ('purchased', 'mixture')
    or char_length(v_name) not between 1 and 120
    or v_base not in ('g', 'ml', 'piece') then
    raise exception 'A valid source ID, item kind, name, and canonical base unit are required.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-inventory:' || p_business_id::text, 0)
  );
  select costing.data into v_costing_data
  from public.scoopies_state as costing
  where costing.id = 'main'
  for update;
  if not found then
    raise exception 'The main costing document was not found.' using errcode = 'P0002';
  end if;
  select count(*)::integer into v_source_count
  from pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(v_costing_data -> 'ingredients') = 'array'
      then v_costing_data -> 'ingredients' else '[]'::jsonb end
  ) as source(value)
  where pg_catalog.jsonb_typeof(source.value) = 'object'
    and btrim(coalesce(source.value ->> 'id', '')) = v_source_id;
  if v_source_count = 0 then
    raise exception 'Costing source % is absent from the latest cloud document.', v_source_id
      using errcode = 'P0002';
  elsif v_source_count > 1 then
    raise exception 'The latest costing document contains duplicate source ID %.', v_source_id
      using errcode = '22023';
  end if;
  select source.value into v_costing_source
  from pg_catalog.jsonb_array_elements(v_costing_data -> 'ingredients')
    as source(value)
  where pg_catalog.jsonb_typeof(source.value) = 'object'
    and btrim(coalesce(source.value ->> 'id', '')) = v_source_id;
  v_actual_kind := case when v_costing_source ->> 'kind' = 'mixture'
    then 'mixture' else 'purchased' end;
  v_actual_name := btrim(coalesce(v_costing_source ->> 'name', ''));
  v_actual_base := public._pos_inventory_base_unit(
    btrim(coalesce(v_costing_source ->> 'unit', ''))
  );
  if v_actual_kind is distinct from v_kind
    or v_actual_name is distinct from v_name
    or v_actual_base is distinct from v_base then
    raise exception 'The costing source changed on another device. Refresh before changing inventory identity.'
      using errcode = '40001';
  end if;

  select item.* into v_item
  from public.pos_inventory_items as item
  where item.source_costing_ingredient_id = v_source_id
  for update;
  if not found then
    insert into public.pos_inventory_items (
      business_id, source_costing_ingredient_id, item_kind, name,
      base_unit, created_by, updated_by
    ) values (
      p_business_id, v_source_id, v_kind, v_name,
      v_base, v_user_id, v_user_id
    );
    return true;
  end if;
  if v_item.business_id is distinct from p_business_id then
    raise exception 'Costing source % is already attached to another business inventory.', v_source_id
      using errcode = '55000';
  end if;
  if not v_item.active then
    raise exception 'Cannot change "%": its inventory identity is inactive after source deletion. Create a new costing ingredient instead.', v_item.name
      using errcode = '55000';
  end if;
  if v_item.item_kind is distinct from v_kind
    or v_item.base_unit is distinct from v_base then
    raise exception 'Cannot change the kind or base unit for existing inventory item "%"; create a new costing ingredient instead.', v_item.name
      using errcode = '55000';
  end if;
  if v_item.name is distinct from v_name then
    update public.pos_inventory_items as item
    set name = v_name, revision = item.revision + 1, updated_by = v_user_id
    where item.business_id = p_business_id and item.id = v_item.id;
  end if;
  return true;
end;
$$;

create or replace function public.pos_inventory_validate_source_delete(
  p_business_id uuid,
  p_source_costing_ingredient_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_source_id text := btrim(coalesce(p_source_costing_ingredient_id, ''));
  v_item public.pos_inventory_items%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can validate inventory source deletion.'
      using errcode = '42501';
  end if;
  if char_length(v_source_id) not between 1 and 200 then
    raise exception 'A costing ingredient ID from 1 to 200 characters is required.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-inventory:' || p_business_id::text, 0)
  );
  select item.* into v_item
  from public.pos_inventory_items as item
  where item.source_costing_ingredient_id = v_source_id
  for update;
  if found and v_item.business_id is distinct from p_business_id then
    raise exception 'Costing source % is attached to another business inventory.', v_source_id
      using errcode = '55000';
  end if;
  if not found or not v_item.active then
    return true;
  end if;
  if public._pos_inventory_balance(p_business_id, v_item.id) <> 0 then
    raise exception 'Cannot delete "%" from costing while its inventory balance is not zero.', v_item.name
      using errcode = '55000';
  end if;
  return true;
end;
$$;

create or replace function public.pos_inventory_prepare_source_delete(
  p_business_id uuid,
  p_source_costing_ingredient_id text,
  p_item_kind text,
  p_name text,
  p_base_unit text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_source_id text := btrim(coalesce(p_source_costing_ingredient_id, ''));
  v_kind text := btrim(coalesce(p_item_kind, ''));
  v_name text := btrim(coalesce(p_name, ''));
  v_base text := btrim(coalesce(p_base_unit, ''));
  v_item public.pos_inventory_items%rowtype;
  v_item_found boolean := false;
  v_costing_data jsonb;
  v_ingredients jsonb;
  v_source jsonb;
  v_source_count integer;
  v_actual_kind text;
  v_actual_name text;
  v_actual_base text;
  v_inventory_name text;
  v_entry record;
  v_line record;
  v_draft_data jsonb;
  v_remaining_ingredients jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can prepare an inventory source for deletion.'
      using errcode = '42501';
  end if;
  if char_length(v_source_id) not between 1 and 200
    or v_kind not in ('purchased', 'mixture')
    or char_length(v_name) > 120
    or v_base not in ('g', 'ml', 'piece') then
    raise exception 'A valid source ID, item kind, name up to 120 characters, and canonical base unit are required.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-inventory:' || p_business_id::text, 0)
  );

  -- Costing and inventory are changed under one transaction. Locking the
  -- authoritative document first also serializes this operation with normal
  -- cloud upserts, so dependency and identity checks use the latest row.
  select costing.data into v_costing_data
  from public.scoopies_state as costing
  where costing.id = 'main'
  for update;
  if not found then
    raise exception 'The main costing document was not found.' using errcode = 'P0002';
  end if;
  if pg_catalog.jsonb_typeof(v_costing_data) <> 'object' then
    raise exception 'The main costing document must be a JSON object.' using errcode = '22023';
  end if;
  if v_costing_data ? 'ingredients'
    and pg_catalog.jsonb_typeof(v_costing_data -> 'ingredients') <> 'array' then
    raise exception 'The costing ingredients field must be a JSON array.' using errcode = '22023';
  end if;
  v_ingredients := coalesce(v_costing_data -> 'ingredients', '[]'::jsonb);

  select count(*)::integer into v_source_count
  from pg_catalog.jsonb_array_elements(v_ingredients) as source(value)
  where pg_catalog.jsonb_typeof(source.value) = 'object'
    and btrim(coalesce(source.value ->> 'id', '')) = v_source_id;
  if v_source_count > 1 then
    raise exception 'The costing document contains duplicate source ID %.', v_source_id
      using errcode = '22023';
  end if;
  if v_source_count = 1 then
    select source.value into v_source
    from pg_catalog.jsonb_array_elements(v_ingredients) as source(value)
    where pg_catalog.jsonb_typeof(source.value) = 'object'
      and btrim(coalesce(source.value ->> 'id', '')) = v_source_id;
    v_actual_kind := case when v_source ->> 'kind' = 'mixture'
      then 'mixture' else 'purchased' end;
    v_actual_name := btrim(coalesce(v_source ->> 'name', ''));
    v_actual_base := public._pos_inventory_base_unit(
      btrim(coalesce(v_source ->> 'unit', ''))
    );
    if char_length(v_actual_name) > 120
      or v_actual_base is null then
      raise exception 'The latest costing source has an invalid name or unit.'
        using errcode = '22023';
    end if;
    if v_actual_kind is distinct from v_kind
      or v_actual_name is distinct from v_name
      or v_actual_base is distinct from v_base then
      raise exception 'The costing source changed on another device. Refresh before deleting it.'
        using errcode = '40001';
    end if;
  end if;
  v_inventory_name := coalesce(
    nullif(v_actual_name, ''), nullif(v_name, ''), 'Unnamed ingredient'
  );

  select item.* into v_item
  from public.pos_inventory_items as item
  where item.source_costing_ingredient_id = v_source_id
  for update;
  v_item_found := found;

  -- An absent source plus its inactive tombstone is the exact retry state.
  -- An older interrupted client may have left an active zero-balance identity
  -- after deleting the JSON first; safely close only that zero-balance case.
  if v_source_count = 0 then
    if pg_catalog.jsonb_path_exists(
        v_costing_data,
        '$.recipes[*].lines[*] ? (@.ingredientId == $sid)',
        pg_catalog.jsonb_build_object('sid', v_source_id)
      )
      or pg_catalog.jsonb_path_exists(
        v_costing_data,
        '$.ingredients[*].components[*] ? (@.ingredientId == $sid)',
        pg_catalog.jsonb_build_object('sid', v_source_id)
      )
      or pg_catalog.jsonb_path_exists(
        v_costing_data,
        '$.mixtureDrafts[*].data.components[*] ? (@.ingredientId == $sid)',
        pg_catalog.jsonb_build_object('sid', v_source_id)
      ) then
      raise exception 'Cannot finalize deletion of source % because the costing document still references it.', v_source_id
        using errcode = '55000';
    end if;
    -- Global deletion is already complete when any business owns the inactive
    -- tombstone. This is a mutation-free success even for another business's
    -- durable retry after it lost the original response.
    if v_item_found and not v_item.active then
      return true;
    end if;
    if not v_item_found then
      raise exception 'The costing source is already absent and has no inventory tombstone. Refresh before deleting.'
        using errcode = 'P0002';
    end if;
    if v_item.business_id is distinct from p_business_id then
      raise exception 'Costing source % is absent but still has an active identity attached to another business.', v_source_id
        using errcode = '55000';
    end if;
    if public._pos_inventory_balance(p_business_id, v_item.id) <> 0 then
      raise exception 'Costing source "%" is absent while its inventory balance is not zero. Restore the source and reconcile stock.', v_item.name
        using errcode = '55000';
    end if;
    if v_item.item_kind is distinct from v_kind
      or v_item.name is distinct from v_inventory_name
      or v_item.base_unit is distinct from v_base then
      raise exception 'The absent costing source does not match the current inventory identity. Refresh before deleting.'
        using errcode = '40001';
    end if;
    update public.pos_inventory_items as item
    set active = false, revision = item.revision + 1, updated_by = v_user_id
    where item.business_id = p_business_id and item.id = v_item.id;
    return true;
  end if;

  if v_item_found and v_item.business_id is distinct from p_business_id then
    raise exception 'Costing source % is attached to another business inventory and cannot be deleted by this business.', v_source_id
      using errcode = '55000';
  end if;

  if v_item_found then
    if v_item.item_kind is distinct from v_actual_kind
      or v_item.base_unit is distinct from v_actual_base then
      raise exception 'The costing source identity does not match its inventory identity. Refresh and reconcile it before deleting.'
        using errcode = '55000';
    end if;
    if v_item.active
      and public._pos_inventory_balance(p_business_id, v_item.id) <> 0 then
      raise exception 'Cannot delete "%" from costing while its inventory balance is not zero.', v_item.name
        using errcode = '55000';
    end if;
  end if;

  if v_costing_data ? 'recipes'
    and pg_catalog.jsonb_typeof(v_costing_data -> 'recipes') <> 'array' then
    raise exception 'The costing recipes field must be a JSON array.' using errcode = '22023';
  end if;
  for v_entry in
    select recipe.value
    from pg_catalog.jsonb_array_elements(
      coalesce(v_costing_data -> 'recipes', '[]'::jsonb)
    ) as recipe(value)
  loop
    if pg_catalog.jsonb_typeof(v_entry.value) <> 'object'
      or (v_entry.value ? 'lines'
        and pg_catalog.jsonb_typeof(v_entry.value -> 'lines') <> 'array') then
      raise exception 'Every recipe and its lines must use the expected JSON structure.'
        using errcode = '22023';
    end if;
    for v_line in
      select line.value
      from pg_catalog.jsonb_array_elements(
        coalesce(v_entry.value -> 'lines', '[]'::jsonb)
      ) as line(value)
    loop
      if pg_catalog.jsonb_typeof(v_line.value) = 'object'
        and btrim(coalesce(v_line.value ->> 'ingredientId', '')) = v_source_id then
        raise exception 'Cannot delete "%" because recipe "%" still uses it.',
          v_actual_name, coalesce(nullif(btrim(v_entry.value ->> 'name'), ''), 'untitled')
          using errcode = '55000';
      end if;
    end loop;
  end loop;

  for v_entry in
    select ingredient.value
    from pg_catalog.jsonb_array_elements(v_ingredients) as ingredient(value)
  loop
    if pg_catalog.jsonb_typeof(v_entry.value) <> 'object' then
      raise exception 'Every costing ingredient must be a JSON object.' using errcode = '22023';
    end if;
    if v_entry.value ? 'components'
      and pg_catalog.jsonb_typeof(v_entry.value -> 'components') <> 'array' then
      raise exception 'Every combined-cost component list must be a JSON array.'
        using errcode = '22023';
    end if;
    if btrim(coalesce(v_entry.value ->> 'id', '')) <> v_source_id then
      for v_line in
        select component.value
        from pg_catalog.jsonb_array_elements(
          coalesce(v_entry.value -> 'components', '[]'::jsonb)
        ) as component(value)
      loop
        if pg_catalog.jsonb_typeof(v_line.value) = 'object'
          and btrim(coalesce(v_line.value ->> 'ingredientId', '')) = v_source_id then
          raise exception 'Cannot delete "%" because combined cost "%" still uses it.',
            v_actual_name, coalesce(nullif(btrim(v_entry.value ->> 'name'), ''), 'untitled')
            using errcode = '55000';
        end if;
      end loop;
    end if;
  end loop;

  if v_costing_data ? 'mixtureDrafts'
    and pg_catalog.jsonb_typeof(v_costing_data -> 'mixtureDrafts') <> 'array' then
    raise exception 'The combined-cost drafts field must be a JSON array.'
      using errcode = '22023';
  end if;
  for v_entry in
    select draft.value
    from pg_catalog.jsonb_array_elements(
      coalesce(v_costing_data -> 'mixtureDrafts', '[]'::jsonb)
    ) as draft(value)
  loop
    if pg_catalog.jsonb_typeof(v_entry.value) <> 'object'
      or (v_entry.value ? 'data'
        and pg_catalog.jsonb_typeof(v_entry.value -> 'data') <> 'object') then
      raise exception 'Every combined-cost draft must use the expected JSON structure.'
        using errcode = '22023';
    end if;
    v_draft_data := coalesce(v_entry.value -> 'data', '{}'::jsonb);
    if v_draft_data ? 'components'
      and pg_catalog.jsonb_typeof(v_draft_data -> 'components') <> 'array' then
      raise exception 'Every draft component list must be a JSON array.'
        using errcode = '22023';
    end if;
    for v_line in
      select component.value
      from pg_catalog.jsonb_array_elements(
        coalesce(v_draft_data -> 'components', '[]'::jsonb)
      ) as component(value)
    loop
      if pg_catalog.jsonb_typeof(v_line.value) = 'object'
        and btrim(coalesce(v_line.value ->> 'ingredientId', '')) = v_source_id then
        raise exception 'Cannot delete "%" because combined-cost draft "%" still uses it.',
          v_actual_name, coalesce(nullif(btrim(v_draft_data ->> 'name'), ''), 'untitled')
          using errcode = '55000';
      end if;
    end loop;
  end loop;

  select coalesce(
    pg_catalog.jsonb_agg(source.value order by source.ordinality)
      filter (where btrim(coalesce(source.value ->> 'id', '')) <> v_source_id),
    '[]'::jsonb
  ) into v_remaining_ingredients
  from pg_catalog.jsonb_array_elements(v_ingredients)
    with ordinality as source(value, ordinality);

  -- Establish the inactive identity first so the costing-state guard permits
  -- this one source removal. Any later failure rolls both changes back.
  if not v_item_found then
    insert into public.pos_inventory_items (
      business_id, source_costing_ingredient_id, item_kind, name,
      base_unit, active, created_by, updated_by
    ) values (
      p_business_id, v_source_id, v_actual_kind, v_inventory_name,
      v_actual_base, false, v_user_id, v_user_id
    );
  elsif v_item.active then
    update public.pos_inventory_items as item
    set name = v_inventory_name, active = false,
        revision = item.revision + 1, updated_by = v_user_id
    where item.business_id = p_business_id and item.id = v_item.id;
  end if;

  update public.scoopies_state as costing
  set data = pg_catalog.jsonb_set(
        v_costing_data, '{ingredients}', v_remaining_ingredients, true
      ),
      updated_at = pg_catalog.clock_timestamp()
  where costing.id = 'main';
  return true;
end;
$$;

create or replace function public.pos_inventory_record_transaction(
  p_business_id uuid,
  p_client_transaction_id uuid,
  p_transaction_type text,
  p_lines jsonb,
  p_reason text default null,
  p_note text default null
)
returns table (
  transaction_id uuid,
  client_transaction_id uuid,
  transaction_type text,
  line_id uuid,
  line_number integer,
  inventory_item_id uuid,
  item_name text,
  base_unit text,
  input_quantity numeric,
  input_unit text,
  quantity_delta_base numeric,
  balance_before_base numeric,
  balance_after_base numeric,
  item_revision bigint,
  occurred_at timestamptz,
  recorded_by uuid,
  is_retry boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_type text := pg_catalog.lower(btrim(coalesce(p_transaction_type, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_fingerprint text;
  v_existing public.pos_inventory_transactions%rowtype;
  v_transaction public.pos_inventory_transactions%rowtype;
  v_entry record;
  v_item public.pos_inventory_items%rowtype;
  v_item_id uuid;
  v_quantity numeric(20,6);
  v_unit text;
  v_expected_revision bigint;
  v_input_base numeric(20,6);
  v_delta numeric(20,6);
  v_before numeric(20,6);
  v_after numeric(20,6);
  v_sequence bigint;
  v_revision_after bigint;
  v_line public.pos_inventory_transaction_lines%rowtype;
  v_match_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.pos_has_role(p_business_id, array['owner', 'manager']) then
    raise exception 'Only an owner or manager can record inventory transactions.'
      using errcode = '42501';
  end if;
  if p_client_transaction_id is null then
    raise exception 'A client transaction ID is required.' using errcode = '22023';
  end if;
  if v_type not in ('stock_in', 'waste', 'correction', 'stock_count') then
    raise exception 'Unknown inventory transaction type.' using errcode = '22023';
  end if;
  if v_type in ('waste', 'correction')
    and (v_reason is null or char_length(v_reason) not between 3 and 500) then
    raise exception 'Waste and correction transactions need a reason from 3 to 500 characters.'
      using errcode = '22023';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'Inventory reason cannot exceed 500 characters.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'Inventory note cannot exceed 1000 characters.' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) not between 1 and 200 then
    raise exception 'Inventory transaction lines must be a JSON array with 1 to 200 entries.'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as entry(value)
    where jsonb_typeof(entry.value) <> 'object'
  ) then
    raise exception 'Every inventory transaction line must be an object.'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as entry(value)
    group by coalesce(entry.value ->> 'inventoryItemId', '')
    having count(*) > 1
  ) then
    raise exception 'An inventory item can appear only once in a transaction.'
      using errcode = '22023';
  end if;

  -- Validate primitive JSON shapes before any casts or row locks.
  for v_entry in
    select entry.value, entry.ordinality
    from jsonb_array_elements(p_lines) with ordinality as entry(value, ordinality)
    order by entry.ordinality
  loop
    if coalesce(v_entry.value ->> 'inventoryItemId', '') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception 'Every inventory line needs a valid inventoryItemId UUID.'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_entry.value -> 'quantity') is distinct from 'number' then
      raise exception 'Every inventory line needs a numeric quantity.'
        using errcode = '22023';
    end if;
    if coalesce(v_entry.value ->> 'unit', '') not in ('g', 'kg', 'ml', 'l', 'piece') then
      raise exception 'Every inventory line needs a supported unit.'
        using errcode = '22023';
    end if;
    if coalesce(v_entry.value ->> 'expectedRevision', '') !~ '^[1-9][0-9]*$' then
      raise exception 'Every inventory line needs a positive integer expectedRevision.'
        using errcode = '22023';
    end if;
  end loop;

  v_fingerprint := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(
      jsonb_build_object(
        'transactionType', v_type,
        'lines', p_lines,
        'reason', v_reason,
        'note', v_note
      )::text,
      'UTF8'
    )),
    'hex'
  );

  -- A single business lock makes sync, stock edits, and configuration changes
  -- deterministic. Item rows are also locked so future internal callers can
  -- safely share the same balance protocol.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-inventory:' || p_business_id::text, 0)
  );

  select inventory_tx.* into v_existing
  from public.pos_inventory_transactions as inventory_tx
  where inventory_tx.business_id = p_business_id
    and inventory_tx.client_transaction_id = p_client_transaction_id;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'This client transaction ID was already used with different inventory details.'
        using errcode = '23505';
    end if;
    return query
    select v_existing.id, v_existing.client_transaction_id,
           v_existing.transaction_type, line.id, line.line_number,
           line.inventory_item_id, line.item_name_snapshot,
           line.base_unit_snapshot, line.input_quantity, line.input_unit,
           line.quantity_delta_base, line.balance_before_base,
           line.balance_after_base, line.item_revision_after,
           v_existing.occurred_at, v_existing.recorded_by, true
    from public.pos_inventory_transaction_lines as line
    where line.business_id = p_business_id
      and line.transaction_id = v_existing.id
    order by line.line_number;
    return;
  end if;

  perform item.id
  from public.pos_inventory_items as item
  join jsonb_array_elements(p_lines) as requested(value)
    on item.id = (requested.value ->> 'inventoryItemId')::uuid
  where item.business_id = p_business_id
  order by item.id
  for update of item;

  select count(*)::integer into v_match_count
  from public.pos_inventory_items as item
  join jsonb_array_elements(p_lines) as requested(value)
    on item.id = (requested.value ->> 'inventoryItemId')::uuid
  where item.business_id = p_business_id and item.active = true;
  if v_match_count <> jsonb_array_length(p_lines) then
    raise exception 'One or more active inventory items were not found in this business.'
      using errcode = 'P0002';
  end if;

  if v_type <> 'stock_count' and exists (
    select 1
    from public.pos_inventory_items as item
    join jsonb_array_elements(p_lines) as requested(value)
      on item.id = (requested.value ->> 'inventoryItemId')::uuid
    where item.business_id = p_business_id
      and item.active = true
      and not exists (
        select 1
        from public.pos_inventory_transaction_lines as previous_line
        where previous_line.business_id = p_business_id
          and previous_line.inventory_item_id = item.id
      )
  ) then
    raise exception 'Every inventory item must begin with an explicit physical stock count, including when its opening count is zero.'
      using errcode = '55000';
  end if;

  insert into public.pos_inventory_transactions (
    business_id, client_transaction_id, request_fingerprint,
    transaction_type, reason, note, metadata, recorded_by
  ) values (
    p_business_id, p_client_transaction_id, v_fingerprint,
    v_type, v_reason, v_note,
    jsonb_build_object('operationSchemaVersion', 1), v_user_id
  ) returning * into v_transaction;

  for v_entry in
    select entry.value, entry.ordinality
    from jsonb_array_elements(p_lines) with ordinality as entry(value, ordinality)
    order by entry.ordinality
  loop
    v_item_id := (v_entry.value ->> 'inventoryItemId')::uuid;
    v_quantity := (v_entry.value ->> 'quantity')::numeric(20,6);
    v_unit := v_entry.value ->> 'unit';
    v_expected_revision := (v_entry.value ->> 'expectedRevision')::bigint;

    select item.* into strict v_item
    from public.pos_inventory_items as item
    where item.business_id = p_business_id and item.id = v_item_id;

    if v_item.revision <> v_expected_revision then
      raise exception 'Inventory item "%" changed on another device. Refresh and try again.', v_item.name
        using errcode = '40001';
    end if;
    if public._pos_inventory_base_unit(v_unit) is distinct from v_item.base_unit then
      raise exception 'The unit for inventory item "%" is incompatible with its base unit.', v_item.name
        using errcode = '22023';
    end if;
    if v_type in ('stock_in', 'waste') and v_quantity <= 0 then
      raise exception 'Stock-in and waste quantities must be greater than zero.'
        using errcode = '22023';
    elsif v_type = 'correction' and v_quantity = 0 then
      raise exception 'A correction quantity cannot be zero.' using errcode = '22023';
    elsif v_type = 'stock_count' and v_quantity < 0 then
      raise exception 'A physical stock count cannot be negative.' using errcode = '22023';
    end if;
    if v_type = 'stock_in' and v_item.item_kind = 'mixture' then
      raise exception 'Prepared mixtures cannot use stock-in; record an explicit count or correction in Phase 1.'
        using errcode = '55000';
    end if;

    v_input_base := public._pos_inventory_to_base(v_quantity, v_unit);
    if v_input_base is null or abs(v_input_base) > 1000000000000 then
      raise exception 'Inventory quantity is outside the supported range.' using errcode = '22003';
    end if;
    v_before := public._pos_inventory_balance(p_business_id, v_item.id);
    v_delta := case v_type
      when 'stock_in' then v_input_base
      when 'waste' then -v_input_base
      when 'correction' then v_input_base
      when 'stock_count' then v_input_base - v_before
    end;
    v_after := v_before + v_delta;
    if v_after < 0 then
      raise exception 'Inventory item "%" would become negative.', v_item.name
        using errcode = '23514';
    end if;
    if v_after > 1000000000000 then
      raise exception 'Inventory balance for "%" exceeds the supported range.', v_item.name
        using errcode = '22003';
    end if;

    select coalesce(max(line.item_sequence), 0) + 1 into v_sequence
    from public.pos_inventory_transaction_lines as line
    where line.business_id = p_business_id
      and line.inventory_item_id = v_item.id;

    update public.pos_inventory_items as item
    set revision = item.revision + 1, updated_by = v_user_id
    where item.business_id = p_business_id and item.id = v_item.id
    returning item.revision into v_revision_after;

    insert into public.pos_inventory_transaction_lines (
      business_id, transaction_id, line_number, inventory_item_id,
      item_sequence, item_name_snapshot, base_unit_snapshot,
      input_quantity, input_unit, input_quantity_base,
      quantity_delta_base, balance_before_base, balance_after_base,
      item_revision_before, item_revision_after
    ) values (
      p_business_id, v_transaction.id, v_entry.ordinality::integer, v_item.id,
      v_sequence, v_item.name, v_item.base_unit,
      v_quantity, v_unit, v_input_base,
      v_delta, v_before, v_after,
      v_item.revision, v_revision_after
    ) returning * into v_line;

    return query select v_transaction.id, v_transaction.client_transaction_id,
      v_transaction.transaction_type, v_line.id, v_line.line_number,
      v_line.inventory_item_id, v_line.item_name_snapshot,
      v_line.base_unit_snapshot, v_line.input_quantity, v_line.input_unit,
      v_line.quantity_delta_base, v_line.balance_before_base,
      v_line.balance_after_base, v_line.item_revision_after,
      v_transaction.occurred_at, v_transaction.recorded_by, false;
  end loop;
end;
$$;

alter table public.pos_inventory_items enable row level security;
alter table public.pos_inventory_transactions enable row level security;
alter table public.pos_inventory_transaction_lines enable row level security;

-- The legacy shared costing table previously exposed destructive table
-- privileges. Row triggers and RLS do not protect TRUNCATE, so browser roles
-- receive only the three operations required by the cloud upsert/realtime
-- flow. DELETE, TRUNCATE, TRIGGER, and REFERENCES stay owner-only.
revoke all on table public.scoopies_state from public, anon, authenticated;
grant select, insert, update on table public.scoopies_state to authenticated;

do $$
begin
  if pg_catalog.to_regclass('public.scoopies_activity') is not null then
    execute 'revoke all on table public.scoopies_activity from public, anon, authenticated';
    execute 'grant select, insert on table public.scoopies_activity to authenticated';
  end if;
end;
$$;

create policy pos_inventory_items_member_read
on public.pos_inventory_items for select to authenticated
using (public.pos_is_member(business_id));

create policy pos_inventory_transactions_manager_read
on public.pos_inventory_transactions for select to authenticated
using (public.pos_has_role(business_id, array['owner', 'manager']));

create policy pos_inventory_transaction_lines_manager_read
on public.pos_inventory_transaction_lines for select to authenticated
using (public.pos_has_role(business_id, array['owner', 'manager']));

revoke all on table
  public.pos_inventory_items,
  public.pos_inventory_transactions,
  public.pos_inventory_transaction_lines
from public, anon, authenticated;

revoke all on function public._pos_inventory_base_unit(text)
  from public, anon, authenticated;
revoke all on function public._pos_inventory_to_base(numeric, text)
  from public, anon, authenticated;
revoke all on function public._pos_inventory_balance(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.pos_inventory_protect_item()
  from public, anon, authenticated;
revoke all on function public.pos_inventory_guard_costing_state()
  from public, anon, authenticated;
revoke all on function public.pos_inventory_sync_items(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.pos_inventory_get_items(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.pos_inventory_get_transactions(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.pos_inventory_record_transaction(
  uuid, uuid, text, jsonb, text, text
) from public, anon, authenticated;
revoke all on function public.pos_inventory_set_threshold(uuid, uuid, numeric, bigint)
  from public, anon, authenticated;
revoke all on function public.pos_inventory_validate_source_delete(uuid, text)
  from public, anon, authenticated;
revoke all on function public.pos_inventory_prepare_source_delete(
  uuid, text, text, text, text
)
  from public, anon, authenticated;
revoke all on function public.pos_inventory_prepare_source_change(
  uuid, text, text, text, text
)
  from public, anon, authenticated;

grant execute on function public.pos_inventory_sync_items(uuid, jsonb)
  to authenticated;
grant execute on function public.pos_inventory_get_items(uuid, boolean)
  to authenticated;
grant execute on function public.pos_inventory_get_transactions(uuid, uuid, integer)
  to authenticated;
grant execute on function public.pos_inventory_record_transaction(
  uuid, uuid, text, jsonb, text, text
) to authenticated;
grant execute on function public.pos_inventory_set_threshold(uuid, uuid, numeric, bigint)
  to authenticated;
grant execute on function public.pos_inventory_validate_source_delete(uuid, text)
  to authenticated;
grant execute on function public.pos_inventory_prepare_source_delete(
  uuid, text, text, text, text
)
  to authenticated;
grant execute on function public.pos_inventory_prepare_source_change(
  uuid, text, text, text, text
)
  to authenticated;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 5, 'name', 'inventory_phase_1_foundation'),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

comment on table public.pos_inventory_items is
  'Inventory identities owned by one business and linked globally one-to-one to the shared costing document source IDs; balances live only in the append-only ledger.';
comment on table public.pos_inventory_transactions is
  'Immutable, idempotent headers for manual stock-in, waste, correction, and physical count operations.';
comment on table public.pos_inventory_transaction_lines is
  'Immutable base-unit quantity deltas and before/after snapshots. Current quantity is the sum of deltas.';
comment on function public.pos_inventory_record_transaction(
  uuid, uuid, text, jsonb, text, text
) is
  'Records an atomic manual inventory transaction. Client UUID retries are exact and item expected revisions prevent lost edits.';
comment on function public.pos_inventory_prepare_source_delete(
  uuid, text, text, text, text
) is
  'Atomically validates the latest costing source and dependencies, removes only that source from scoopies_state/main, and creates or preserves its zero-balance inactive inventory tombstone.';
comment on function public.pos_inventory_validate_source_delete(uuid, text) is
  'Read-only deletion preflight: locks the business and rejects an existing active source whose inventory balance is not zero.';
comment on function public.pos_inventory_prepare_source_change(
  uuid, text, text, text, text
) is
  'Post-save validation and synchronization for one authoritative existing costing source; rejects absent, stale, tombstoned, or cross-business identities.';
comment on function public.pos_inventory_guard_costing_state() is
  'Protects scoopies_state/main identity, validates saved dependency references, and rejects normal saves that omit sources or revive/change inventory identities outside the atomic lifecycle RPCs.';

commit;
