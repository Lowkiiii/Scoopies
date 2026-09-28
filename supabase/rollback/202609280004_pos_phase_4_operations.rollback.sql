-- POS Phase 4 rollback.
--
-- Completed live/training sales and close facts remain valid immutable Phase 1
-- records. Exact Phase 3 reports do not understand financial reversal events,
-- so this rollback refuses before changing anything if one exists. It also
-- refuses while any shift is open because Phase 3 cannot explicitly close or
-- reconcile it.

begin;

do $$
begin
  if exists (
    select 1 from public.pos_sale_events as event
    where event.event_type in (
      'void_before_preparation',
      'refund_before_preparation',
      'refund_after_preparation'
    )
  ) then
    raise exception 'Phase 4 rollback blocked: financial reversals exist and Phase 3 reports would overstate revenue. Keep/reapply Phase 4 or migrate those reports first.'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from public.pos_shifts as shift
    where shift.status = 'open'
  ) then
    raise exception 'Phase 4 rollback blocked: close every open shift first.'
      using errcode = '55000';
  end if;
end;
$$;

drop function if exists public.pos_get_end_of_day_summary(uuid, date, boolean);
drop function if exists public.pos_get_recent_sales_v2(uuid, boolean, integer);
drop function if exists public.pos_void_sale(uuid, uuid, text);
drop function if exists public.pos_complete_shift_sale(
  uuid, uuid, boolean, uuid, jsonb, text, bigint, text, text
);
drop function if exists public.pos_complete_sale(
  uuid, uuid, jsonb, text, bigint, text, text
);
drop function if exists public.pos_close_shift(
  uuid, uuid, bigint, bigint, bigint, text
);
drop function if exists public.pos_get_shift_status(uuid);
drop function if exists public.pos_open_shift(uuid, boolean, bigint);
drop function if exists public._pos_phase4_complete_sale(
  uuid, uuid, boolean, uuid, jsonb, text, bigint, text, text, boolean
);
drop function if exists public._pos_phase4_metrics(uuid, uuid, date, boolean);
drop index if exists public.pos_sale_events_one_reversal_uq;

-- Exact Phase 3 restoration follows.
-- Scoopie's POS Phase 3: atomic checkout and cashier-safe sales reporting
--
-- Checkout is the only browser-executable write path. It snapshots the
-- immutable active product version, derives every amount on the server, and
-- completes the sale, payment, receipt, and audit event in one transaction.

create or replace function public.pos_complete_sale(
  p_business_id uuid,
  p_client_sale_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_cash_tendered_centavos bigint default null,
  p_reference_number text default null,
  p_note text default null
)
returns table (
  sale_id uuid,
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
  v_fingerprint text;
  v_existing_sale_id uuid;
  v_existing_status text;
  v_existing_fingerprint text;
  v_register_id uuid;
  v_shift_id uuid;
  v_sale_id uuid;
  v_product_name text;
  v_product_size text;
  v_unit_price bigint;
  v_ingredient_cost bigint;
  v_packaging_cost bigint;
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

  -- Authorize before request validation so outsiders cannot use this RPC as a
  -- catalog or validation oracle.
  select member.role
    into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true
  for share;

  if v_role is null or v_role not in ('owner', 'manager', 'cashier') then
    raise exception 'Active POS membership is required.' using errcode = '42501';
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
      or not (cart.item ? 'product_id')
      or not (cart.item ? 'product_version_id')
      or not (cart.item ? 'quantity')
      or (select count(*) from jsonb_object_keys(cart.item)) <> 3
      or jsonb_typeof(cart.item -> 'product_id') is distinct from 'string'
      or jsonb_typeof(cart.item -> 'product_version_id') is distinct from 'string'
      or jsonb_typeof(cart.item -> 'quantity') is distinct from 'number'
      or (cart.item ->> 'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or (cart.item ->> 'product_version_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or (cart.item ->> 'quantity') !~ '^[0-9]+$'
      or (cart.item ->> 'quantity')::numeric not between 1 and 10000
  ) then
    raise exception 'Each cart line requires only product_id, product_version_id, and an integer quantity from 1 to 10000.'
      using errcode = '22023';
  end if;

  if (
    select count(*) <> count(distinct (cart.item ->> 'product_id')::uuid)
    from jsonb_array_elements(p_items) as cart(item)
  ) then
    raise exception 'A product can appear only once in a cart.' using errcode = '22023';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'product_id', (cart.item ->> 'product_id')::uuid,
      'product_version_id', (cart.item ->> 'product_version_id')::uuid,
      'quantity', (cart.item ->> 'quantity')::integer
    )
    order by (cart.item ->> 'product_id')::uuid
  )
    into v_normalized_items
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

  v_fingerprint := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        jsonb_build_object(
          'checkoutSchemaVersion', 1,
          'items', v_normalized_items,
          'paymentMethod', v_method,
          'cashTenderedCentavos', case
            when v_method = 'cash' then p_cash_tendered_centavos
            else null
          end,
          'referenceNumber', case
            when v_method = 'cash' then null
            else v_reference
          end,
          'note', v_note
        )::text,
        'UTF8'
      )
    ),
    'hex'
  );

  -- Serialize the same client request across tabs/devices. A retry checks the
  -- committed sale before catalog or shift state, so a lost response remains
  -- recoverable even if the catalog subsequently changed.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pos-sale:' || p_business_id::text || ':' || p_client_sale_id::text,
      0
    )
  );

  select sale.id, sale.status, sale.request_fingerprint
    into v_existing_sale_id, v_existing_status, v_existing_fingerprint
  from public.pos_sales as sale
  where sale.business_id = p_business_id
    and sale.client_sale_id = p_client_sale_id
  for update;

  if v_existing_sale_id is not null then
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception 'This checkout ID was already used for a different request. Start a new checkout.'
        using errcode = '23505';
    end if;
    if v_existing_status <> 'completed' then
      raise exception 'The matching checkout exists but is not complete.'
        using errcode = '55000';
    end if;

    return query
    select
      sale.id,
      sale.receipt_number,
      sale.business_date,
      sale.completed_at,
      payment.method,
      (select count(*)::integer
       from public.pos_sale_items as item
       where item.business_id = sale.business_id and item.sale_id = sale.id),
      (select coalesce(sum(item.quantity), 0)::bigint
       from public.pos_sale_items as item
       where item.business_id = sale.business_id and item.sale_id = sale.id),
      sale.subtotal_centavos,
      sale.total_centavos,
      payment.cash_tendered_centavos,
      payment.change_given_centavos,
      true
    from public.pos_sales as sale
    join public.pos_payments as payment
      on payment.business_id = sale.business_id
     and payment.sale_id = sale.id
     and payment.payment_number = 1
    where sale.business_id = p_business_id
      and sale.id = v_existing_sale_id;
    return;
  end if;

  -- Phase 3 deliberately auto-opens the single-register MVP shift at zero
  -- opening cash. Explicit drawer opening/closing is a later phase.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-shift:' || p_business_id::text, 0)
  );

  select shift.id, shift.register_id
    into v_shift_id, v_register_id
  from public.pos_shifts as shift
  join public.pos_registers as register
    on register.business_id = shift.business_id
   and register.id = shift.register_id
  where shift.business_id = p_business_id
    and shift.status = 'open'
    and shift.is_training = false
    and register.active = true
    and register.archived_at is null
  order by shift.opened_at, shift.id
  limit 1
  for update of shift;

  if v_shift_id is null then
    select register.id
      into v_register_id
    from public.pos_registers as register
    where register.business_id = p_business_id
      and register.active = true
      and register.archived_at is null
      and not exists (
        select 1
        from public.pos_shifts as occupied
        where occupied.business_id = register.business_id
          and occupied.register_id = register.id
          and occupied.status = 'open'
      )
    order by register.created_at, register.id
    limit 1
    for update;

    if v_register_id is null then
      raise exception 'No active register is available for checkout.'
        using errcode = '55000';
    end if;

    insert into public.pos_shifts (
      business_id, register_id, status, is_training,
      opening_cash_centavos, opened_by
    ) values (
      p_business_id, v_register_id, 'open', false, 0, v_user_id
    ) returning id into v_shift_id;
  end if;

  insert into public.pos_sales (
    business_id,
    shift_id,
    client_sale_id,
    request_fingerprint,
    status,
    entry_mode,
    is_training,
    cashier_id,
    note
  ) values (
    p_business_id,
    v_shift_id,
    p_client_sale_id,
    v_fingerprint,
    'open',
    'live',
    false,
    v_user_id,
    v_note
  ) returning id into v_sale_id;

  for v_item in
    select
      (cart.item ->> 'product_id')::uuid as product_id,
      (cart.item ->> 'product_version_id')::uuid as product_version_id,
      (cart.item ->> 'quantity')::integer as quantity
    from jsonb_array_elements(v_normalized_items) as cart(item)
    order by (cart.item ->> 'product_id')::uuid
  loop
    select
      version.name_snapshot,
      version.size_snapshot,
      version.selling_price_centavos,
      version.ingredient_cost_centavos,
      version.packaging_cost_centavos
    into
      v_product_name,
      v_product_size,
      v_unit_price,
      v_ingredient_cost,
      v_packaging_cost
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

    if v_unit_price * v_item.quantity > 100000000000
      or (v_ingredient_cost + v_packaging_cost) * v_item.quantity > 100000000000 then
      raise exception 'A cart line exceeds the supported amount.' using errcode = '22003';
    end if;

    v_line_number := v_line_number + 1;
    insert into public.pos_sale_items (
      business_id,
      sale_id,
      line_number,
      product_id,
      product_version_id,
      name_snapshot,
      size_snapshot,
      quantity,
      unit_price_centavos,
      ingredient_unit_cost_centavos,
      packaging_unit_cost_centavos,
      line_discount_centavos
    ) values (
      p_business_id,
      v_sale_id,
      v_line_number,
      v_item.product_id,
      v_item.product_version_id,
      v_product_name,
      v_product_size,
      v_item.quantity,
      v_unit_price,
      v_ingredient_cost,
      v_packaging_cost,
      0
    );
  end loop;

  select
    count(*)::integer,
    coalesce(sum(item.quantity), 0)::bigint,
    coalesce(sum(item.gross_amount_centavos), 0)::bigint,
    coalesce(sum(item.estimated_line_cost_centavos), 0)::bigint
  into v_item_count, v_units_sold, v_subtotal, v_estimated_cost
  from public.pos_sale_items as item
  where item.business_id = p_business_id
    and item.sale_id = v_sale_id;

  if v_subtotal > 100000000000 or v_estimated_cost > 100000000000 then
    raise exception 'Sale totals exceed the supported amount.' using errcode = '22003';
  end if;

  if v_method = 'cash' and p_cash_tendered_centavos < v_subtotal then
    raise exception 'Cash received is less than the sale total.' using errcode = '22023';
  end if;

  v_cash_tendered := case when v_method = 'cash' then p_cash_tendered_centavos else null end;
  v_change := case when v_method = 'cash' then p_cash_tendered_centavos - v_subtotal else null end;

  insert into public.pos_payments (
    business_id,
    sale_id,
    payment_number,
    method,
    amount_centavos,
    processor_fee_centavos,
    cash_tendered_centavos,
    change_given_centavos,
    reference_number,
    confirmed_by
  ) values (
    p_business_id,
    v_sale_id,
    1,
    v_method,
    v_subtotal,
    0,
    v_cash_tendered,
    v_change,
    case when v_method = 'cash' then null else v_reference end,
    v_user_id
  );

  -- Allocate only after all cart/payment validation so failed requests do not
  -- consume receipt numbers. The Phase 1 UPSERT allocator is row-atomic.
  select allocated.business_date, allocated.receipt_sequence, allocated.receipt_number
    into v_business_date, v_receipt_sequence, v_receipt_number
  from public.pos_allocate_receipt(
    p_business_id,
    false,
    pg_catalog.clock_timestamp()
  ) as allocated;

  update public.pos_sales as sale
  set status = 'completed',
      business_date = v_business_date,
      receipt_sequence = v_receipt_sequence,
      receipt_number = v_receipt_number
  where sale.business_id = p_business_id
    and sale.id = v_sale_id
  returning sale.completed_at into v_completed_at;

  insert into public.pos_sale_events (
    business_id,
    sale_id,
    event_type,
    amount_centavos,
    payment_method,
    retain_cost,
    reference_number,
    acted_by,
    metadata
  ) values (
    p_business_id,
    v_sale_id,
    'completed',
    v_subtotal,
    v_method,
    true,
    case when v_method = 'cash' then null else v_reference end,
    v_user_id,
    jsonb_build_object('checkoutSchemaVersion', 1)
  );

  return query select
    v_sale_id,
    v_receipt_number,
    v_business_date,
    v_completed_at,
    v_method,
    v_item_count,
    v_units_sold,
    v_subtotal,
    v_subtotal,
    v_cash_tendered,
    v_change,
    false;
end;
$$;

create or replace function public.pos_get_today_summary(p_business_id uuid)
returns table (
  business_date date,
  sale_count bigint,
  items_sold bigint,
  total_sales_centavos bigint,
  cash_sales_centavos bigint,
  gcash_sales_centavos bigint,
  gotyme_sales_centavos bigint,
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
  v_timezone text;
  v_business_date date;
  v_sale_count bigint;
  v_items_sold bigint;
  v_total_sales bigint;
  v_cash_sales bigint;
  v_gcash_sales bigint;
  v_gotyme_sales bigint;
  v_cost bigint;
  v_can_view_costs boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select member.role, business.timezone
    into v_role, v_timezone
  from public.pos_business_members as member
  join public.pos_businesses as business on business.id = member.business_id
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true;

  if v_role is null then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;

  v_can_view_costs := v_role in ('owner', 'manager');
  v_business_date := (pg_catalog.timezone(v_timezone, pg_catalog.now()))::date;

  select
    count(*)::bigint,
    coalesce(sum(sale.total_centavos), 0)::bigint,
    coalesce(sum(sale.estimated_cost_centavos), 0)::bigint
  into v_sale_count, v_total_sales, v_cost
  from public.pos_sales as sale
  where sale.business_id = p_business_id
    and sale.status = 'completed'
    and sale.is_training = false
    and sale.business_date = v_business_date;

  select coalesce(sum(item.quantity), 0)::bigint
    into v_items_sold
  from public.pos_sale_items as item
  join public.pos_sales as sale
    on sale.business_id = item.business_id
   and sale.id = item.sale_id
  where sale.business_id = p_business_id
    and sale.status = 'completed'
    and sale.is_training = false
    and sale.business_date = v_business_date;

  select
    coalesce(sum(payment.amount_centavos) filter (where payment.method = 'cash'), 0)::bigint,
    coalesce(sum(payment.amount_centavos) filter (where payment.method = 'gcash'), 0)::bigint,
    coalesce(sum(payment.amount_centavos) filter (where payment.method = 'gotyme'), 0)::bigint
  into v_cash_sales, v_gcash_sales, v_gotyme_sales
  from public.pos_payments as payment
  join public.pos_sales as sale
    on sale.business_id = payment.business_id
   and sale.id = payment.sale_id
  where sale.business_id = p_business_id
    and sale.status = 'completed'
    and sale.is_training = false
    and sale.business_date = v_business_date;

  return query select
    v_business_date,
    v_sale_count,
    v_items_sold,
    v_total_sales,
    v_cash_sales,
    v_gcash_sales,
    v_gotyme_sales,
    case when v_can_view_costs then v_cost else null::bigint end,
    case when v_can_view_costs then v_total_sales - v_cost else null::bigint end,
    v_can_view_costs;
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

  select member.role
    into v_role
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
    sale.id,
    sale.receipt_number,
    sale.business_date,
    sale.completed_at,
    member.display_name,
    item_totals.item_count,
    item_totals.units_sold,
    item_totals.item_summary,
    sale.total_centavos,
    payment.method,
    payment.reference_number,
    case when v_can_view_costs then sale.estimated_cost_centavos else null::bigint end,
    case when v_can_view_costs
      then sale.total_centavos - sale.estimated_cost_centavos
      else null::bigint
    end,
    v_can_view_costs
  from public.pos_sales as sale
  join public.pos_business_members as member
    on member.business_id = sale.business_id
   and member.user_id = sale.cashier_id
  join public.pos_payments as payment
    on payment.business_id = sale.business_id
   and payment.sale_id = sale.id
   and payment.payment_number = 1
  cross join lateral (
    select
      count(*)::bigint as item_count,
      coalesce(sum(item.quantity), 0)::bigint as units_sold,
      string_agg(
        item.quantity::text || ' x ' || item.name_snapshot
          || case
            when item.size_snapshot is null then ''
            else ' (' || item.size_snapshot || ')'
          end,
        ', ' order by item.line_number
      ) as item_summary
    from public.pos_sale_items as item
    where item.business_id = sale.business_id
      and item.sale_id = sale.id
  ) as item_totals
  where sale.business_id = p_business_id
    and sale.status = 'completed'
    and sale.is_training = false
  order by sale.completed_at desc, sale.id desc
  limit p_limit;
end;
$$;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 3, 'name', 'pos_phase_3_checkout_reporting'),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

revoke all on function public.pos_complete_sale(
  uuid, uuid, jsonb, text, bigint, text, text
) from public, anon, authenticated;
revoke all on function public.pos_get_today_summary(uuid)
  from public, anon, authenticated;
revoke all on function public.pos_get_recent_sales(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.pos_complete_sale(
  uuid, uuid, jsonb, text, bigint, text, text
) to authenticated;
grant execute on function public.pos_get_today_summary(uuid) to authenticated;
grant execute on function public.pos_get_recent_sales(uuid, integer) to authenticated;

comment on function public.pos_complete_sale(
  uuid, uuid, jsonb, text, bigint, text, text
) is
  'Atomic POS checkout. Exact client-ID retries return the original receipt; all price and cost facts come from the validated active immutable product version.';
comment on function public.pos_get_today_summary(uuid) is
  'Business-timezone daily sales and payment totals. Estimated cost and gross profit are NULL for cashiers.';
comment on function public.pos_get_recent_sales(uuid, integer) is
  'Cashier-safe recent completed sales. Estimated cost and gross profit are NULL for cashiers.';

commit;
