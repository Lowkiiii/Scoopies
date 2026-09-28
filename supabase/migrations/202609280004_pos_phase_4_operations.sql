-- Scoopie's POS Phase 4: shift operations, training mode, audited voids,
-- and end-of-day reporting.
--
-- Completed sales, item snapshots, and payments remain immutable. A whole-sale
-- cancellation is represented by one append-only `void_before_preparation`
-- event. All money accepted from clients is integer Philippine centavos.

begin;

-- Phase 4 supports one whole-sale financial reversal. This protects reporting
-- even if a future write path forgets to take the application advisory lock.
create unique index if not exists pos_sale_events_one_reversal_uq
  on public.pos_sale_events (business_id, sale_id)
  where event_type in (
    'void_before_preparation',
    'refund_before_preparation',
    'refund_after_preparation'
  );

-- One internal financial definition is shared by shift, today, recent, and
-- end-of-day reports. Browser roles cannot execute this helper directly.
create or replace function public._pos_phase4_metrics(
  p_business_id uuid,
  p_shift_id uuid,
  p_business_date date,
  p_is_training boolean
)
returns table (
  gross_sale_count bigint,
  voided_sale_count bigint,
  net_sale_count bigint,
  gross_items_sold bigint,
  voided_items_sold bigint,
  net_items_sold bigint,
  gross_sales_centavos bigint,
  voided_sales_centavos bigint,
  net_sales_centavos bigint,
  cash_net_centavos bigint,
  gcash_net_centavos bigint,
  gotyme_net_centavos bigint,
  net_estimated_cost_centavos bigint,
  estimated_gross_profit_centavos bigint,
  cash_expenses_centavos bigint,
  gcash_expenses_centavos bigint,
  gotyme_expenses_centavos bigint,
  cash_pay_ins_centavos bigint,
  cash_pay_outs_centavos bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with selected_sales as (
    select sale.id, sale.shift_id, sale.total_centavos,
           sale.estimated_cost_centavos
    from public.pos_sales as sale
    where sale.business_id = p_business_id
      and sale.status = 'completed'
      and (
        (p_shift_id is not null and sale.shift_id = p_shift_id)
        or
        (p_shift_id is null
          and p_business_date is not null
          and sale.business_date = p_business_date
          and sale.is_training = p_is_training)
      )
  ), reversals as (
    select event.sale_id, event.event_type, event.amount_centavos,
           event.payment_method, event.retain_cost
    from public.pos_sale_events as event
    join selected_sales as sale on sale.id = event.sale_id
    where event.business_id = p_business_id
      and event.event_type in (
        'void_before_preparation',
        'refund_before_preparation',
        'refund_after_preparation'
      )
  ), item_totals as (
    select item.sale_id, coalesce(sum(item.quantity), 0)::bigint as units
    from public.pos_sale_items as item
    join selected_sales as sale on sale.id = item.sale_id
    where item.business_id = p_business_id
    group by item.sale_id
  ), sale_rollup as (
    select
      count(*)::bigint as gross_sale_count,
      count(*) filter (
        where reversal.event_type = 'void_before_preparation'
      )::bigint
        as voided_sale_count,
      coalesce(sum(items.units), 0)::bigint as gross_items_sold,
      coalesce(sum(items.units) filter (
        where reversal.event_type = 'void_before_preparation'
      ), 0)::bigint
        as voided_items_sold,
      coalesce(sum(sale.total_centavos), 0)::bigint as gross_sales_centavos,
      coalesce(sum(reversal.amount_centavos), 0)::bigint as voided_sales_centavos,
      coalesce(sum(sale.estimated_cost_centavos)
        filter (
          where reversal.sale_id is null or reversal.retain_cost = true
        ), 0)::bigint
        as net_estimated_cost_centavos
    from selected_sales as sale
    left join reversals as reversal on reversal.sale_id = sale.id
    left join item_totals as items on items.sale_id = sale.id
  ), payment_gross as (
    select
      coalesce(sum(payment.amount_centavos)
        filter (where payment.method = 'cash'), 0)::bigint
        as cash_gross_centavos,
      coalesce(sum(payment.amount_centavos)
        filter (where payment.method = 'gcash'), 0)::bigint
        as gcash_gross_centavos,
      coalesce(sum(payment.amount_centavos)
        filter (where payment.method = 'gotyme'), 0)::bigint
        as gotyme_gross_centavos
    from selected_sales as sale
    join public.pos_payments as payment
      on payment.business_id = p_business_id
     and payment.sale_id = sale.id
  ), reversal_rollup as (
    select
      coalesce(sum(reversal.amount_centavos)
        filter (where reversal.payment_method = 'cash'), 0)::bigint
        as cash_reversed_centavos,
      coalesce(sum(reversal.amount_centavos)
        filter (where reversal.payment_method = 'gcash'), 0)::bigint
        as gcash_reversed_centavos,
      coalesce(sum(reversal.amount_centavos)
        filter (where reversal.payment_method = 'gotyme'), 0)::bigint
        as gotyme_reversed_centavos
    from reversals as reversal
  ), expense_rollup as (
    select
      coalesce(sum(expense.amount_centavos)
        filter (where expense.payment_source = 'cash'), 0)::bigint
        as cash_expenses_centavos,
      coalesce(sum(expense.amount_centavos)
        filter (where expense.payment_source = 'gcash'), 0)::bigint
        as gcash_expenses_centavos,
      coalesce(sum(expense.amount_centavos)
        filter (where expense.payment_source = 'gotyme'), 0)::bigint
        as gotyme_expenses_centavos
    from public.pos_expenses as expense
    where expense.business_id = p_business_id
      and p_shift_id is not null
      and expense.shift_id = p_shift_id
  ), movement_rollup as (
    select
      coalesce(sum(movement.amount_centavos)
        filter (where movement.movement_type = 'pay_in'), 0)::bigint
        as cash_pay_ins_centavos,
      coalesce(sum(movement.amount_centavos)
        filter (where movement.movement_type = 'pay_out'), 0)::bigint
        as cash_pay_outs_centavos
    from public.pos_cash_movements as movement
    where movement.business_id = p_business_id
      and p_shift_id is not null
      and movement.shift_id = p_shift_id
  )
  select
    sales.gross_sale_count,
    sales.voided_sale_count,
    sales.gross_sale_count - sales.voided_sale_count,
    sales.gross_items_sold,
    sales.voided_items_sold,
    sales.gross_items_sold - sales.voided_items_sold,
    sales.gross_sales_centavos,
    sales.voided_sales_centavos,
    sales.gross_sales_centavos - sales.voided_sales_centavos,
    payments.cash_gross_centavos - reversed.cash_reversed_centavos,
    payments.gcash_gross_centavos - reversed.gcash_reversed_centavos,
    payments.gotyme_gross_centavos - reversed.gotyme_reversed_centavos,
    sales.net_estimated_cost_centavos,
    (sales.gross_sales_centavos - sales.voided_sales_centavos)
      - sales.net_estimated_cost_centavos,
    expenses.cash_expenses_centavos,
    expenses.gcash_expenses_centavos,
    expenses.gotyme_expenses_centavos,
    movements.cash_pay_ins_centavos,
    movements.cash_pay_outs_centavos
  from sale_rollup as sales
  cross join payment_gross as payments
  cross join reversal_rollup as reversed
  cross join expense_rollup as expenses
  cross join movement_rollup as movements;
$$;

revoke all on function public._pos_phase4_metrics(uuid, uuid, date, boolean)
  from public, anon, authenticated;

create or replace function public.pos_open_shift(
  p_business_id uuid,
  p_is_training boolean,
  p_opening_cash_centavos bigint
)
returns table (
  shift_id uuid,
  register_id uuid,
  register_name text,
  is_training boolean,
  opening_cash_centavos bigint,
  opened_at timestamptz,
  opened_by_display_name text,
  is_retry boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_register_id uuid;
  v_register_name text;
  v_register_count integer;
  v_shift record;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select member.role into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true
  for share;

  if v_role is null or v_role not in ('owner', 'manager', 'cashier') then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;

  if p_is_training is null then
    raise exception 'Shift mode is required.' using errcode = '22023';
  end if;
  if p_is_training and v_role not in ('owner', 'manager') then
    raise exception 'Only an owner or manager can open training mode.'
      using errcode = '42501';
  end if;
  if p_opening_cash_centavos is null
    or p_opening_cash_centavos not between 0 and 100000000000 then
    raise exception 'Opening cash must be a supported nonnegative centavo amount.'
      using errcode = '22023';
  end if;
  if p_is_training and p_opening_cash_centavos <> 0 then
    raise exception 'Training shifts must start with zero opening cash.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-shift:' || p_business_id::text, 0)
  );

  select count(*)::integer, min(register.id::text)::uuid
    into v_register_count, v_register_id
  from public.pos_registers as register
  where register.business_id = p_business_id
    and register.active = true
    and register.archived_at is null;

  if v_register_count = 0 then
    raise exception 'No active register is available.' using errcode = '55000';
  elsif v_register_count > 1 then
    raise exception 'This POS version requires exactly one active register.'
      using errcode = '55000';
  end if;

  select register.name into strict v_register_name
  from public.pos_registers as register
  where register.business_id = p_business_id and register.id = v_register_id
  for update;

  select shift.* into v_shift
  from public.pos_shifts as shift
  where shift.business_id = p_business_id
    and shift.register_id = v_register_id
    and shift.status = 'open'
  for update;

  if found then
    if v_shift.is_training = p_is_training
      and v_shift.opening_cash_centavos = p_opening_cash_centavos then
      return query
      select v_shift.id, v_register_id, v_register_name, v_shift.is_training,
             v_shift.opening_cash_centavos, v_shift.opened_at,
             member.display_name, true
      from public.pos_business_members as member
      where member.business_id = p_business_id
        and member.user_id = v_shift.opened_by;
      return;
    end if;

    raise exception 'A % shift is already open. Close it before opening a new shift.',
      case when v_shift.is_training then 'training' else 'live' end
      using errcode = '55000';
  end if;

  insert into public.pos_shifts (
    business_id, register_id, status, is_training,
    opening_cash_centavos, opened_by
  ) values (
    p_business_id, v_register_id, 'open', p_is_training,
    p_opening_cash_centavos, v_user_id
  ) returning * into v_shift;

  return query
  select v_shift.id, v_register_id, v_register_name, v_shift.is_training,
         v_shift.opening_cash_centavos, v_shift.opened_at,
         member.display_name, false
  from public.pos_business_members as member
  where member.business_id = p_business_id and member.user_id = v_user_id;
end;
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
  cross join lateral (
    select count(*)::bigint as item_count,
           coalesce(sum(item.quantity), 0)::bigint as units_sold,
           string_agg(
             item.quantity::text || ' x ' || item.name_snapshot
               || case when item.size_snapshot is null then ''
                    else ' (' || item.size_snapshot || ')' end,
             ', ' order by item.line_number
           ) as item_summary
    from public.pos_sale_items as item
    where item.business_id = sale.business_id and item.sale_id = sale.id
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

create or replace function public.pos_get_end_of_day_summary(
  p_business_id uuid,
  p_business_date date,
  p_is_training boolean
)
returns table (
  business_date date,
  business_timezone text,
  is_training boolean,
  gross_sale_count bigint,
  voided_sale_count bigint,
  net_sale_count bigint,
  gross_items_sold bigint,
  voided_items_sold bigint,
  net_items_sold bigint,
  gross_sales_centavos bigint,
  voided_sales_centavos bigint,
  net_sales_centavos bigint,
  cash_net_centavos bigint,
  gcash_net_centavos bigint,
  gotyme_net_centavos bigint,
  estimated_cost_centavos bigint,
  estimated_gross_profit_centavos bigint,
  can_view_costs boolean,
  opened_shift_count bigint,
  closed_shift_count bigint
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
  v_date date;
  v_can_view_costs boolean;
  v_metrics record;
  v_opened_shift_count bigint;
  v_closed_shift_count bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select member.role, business.timezone into v_role, v_timezone
  from public.pos_business_members as member
  join public.pos_businesses as business on business.id = member.business_id
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true;
  if v_role is null then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;
  if p_is_training is null then
    raise exception 'Report mode is required.' using errcode = '22023';
  end if;

  v_date := coalesce(
    p_business_date,
    (pg_catalog.timezone(v_timezone, pg_catalog.now()))::date
  );
  v_can_view_costs := v_role in ('owner', 'manager');

  select * into strict v_metrics
  from public._pos_phase4_metrics(p_business_id, null, v_date, p_is_training);

  select count(*)::bigint,
         count(*) filter (where shift.status = 'closed')::bigint
    into v_opened_shift_count, v_closed_shift_count
  from public.pos_shifts as shift
  where shift.business_id = p_business_id
    and shift.is_training = p_is_training
    and (pg_catalog.timezone(v_timezone, shift.opened_at))::date = v_date;

  return query select
    v_date, v_timezone, p_is_training,
    v_metrics.gross_sale_count, v_metrics.voided_sale_count,
    v_metrics.net_sale_count, v_metrics.gross_items_sold,
    v_metrics.voided_items_sold, v_metrics.net_items_sold,
    v_metrics.gross_sales_centavos, v_metrics.voided_sales_centavos,
    v_metrics.net_sales_centavos, v_metrics.cash_net_centavos,
    v_metrics.gcash_net_centavos, v_metrics.gotyme_net_centavos,
    case when v_can_view_costs
      then v_metrics.net_estimated_cost_centavos else null::bigint end,
    case when v_can_view_costs
      then v_metrics.estimated_gross_profit_centavos else null::bigint end,
    v_can_view_costs, v_opened_shift_count, v_closed_shift_count;
end;
$$;

create or replace function public.pos_void_sale(
  p_business_id uuid,
  p_sale_id uuid,
  p_reason text
)
returns table (
  sale_id uuid,
  shift_id uuid,
  is_training boolean,
  receipt_number text,
  event_id uuid,
  voided_at timestamptz,
  payment_method text,
  voided_amount_centavos bigint,
  reason text,
  is_retry boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_sale record;
  v_existing record;
  v_event record;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select member.role into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true
  for share;

  if v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'Only an owner or manager can void a completed sale.'
      using errcode = '42501';
  end if;
  if p_sale_id is null then
    raise exception 'A sale ID is required.' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) not between 3 and 500 then
    raise exception 'A void reason from 3 to 500 characters is required.'
      using errcode = '22023';
  end if;

  -- Close and void serialize on the same business shift lock. If void wins,
  -- close includes it; if close wins, a new void is rejected.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-shift:' || p_business_id::text, 0)
  );

  select sale.id, sale.shift_id, sale.is_training, sale.receipt_number,
         sale.total_centavos, sale.status as sale_status,
         shift.status as shift_status, payment.method as payment_method,
         payment.reference_number,
         (select count(*)::integer
          from public.pos_payments as all_payment
          where all_payment.business_id = sale.business_id
            and all_payment.sale_id = sale.id) as payment_count,
         (select coalesce(sum(all_payment.amount_centavos), 0)::bigint
          from public.pos_payments as all_payment
          where all_payment.business_id = sale.business_id
            and all_payment.sale_id = sale.id) as payment_total_centavos
    into v_sale
  from public.pos_sales as sale
  join public.pos_shifts as shift
    on shift.business_id = sale.business_id and shift.id = sale.shift_id
  join public.pos_payments as payment
    on payment.business_id = sale.business_id
   and payment.sale_id = sale.id and payment.payment_number = 1
  where sale.business_id = p_business_id and sale.id = p_sale_id
  for update of shift, sale;

  if not found or v_sale.sale_status <> 'completed' then
    raise exception 'The completed sale was not found.' using errcode = 'P0002';
  end if;
  if v_sale.payment_count <> 1
    or v_sale.payment_total_centavos <> v_sale.total_centavos then
    raise exception 'Whole-sale void currently requires one payment matching the sale total.'
      using errcode = '55000';
  end if;

  select event.id, event.event_type, event.reason, event.created_at,
         event.payment_method, event.amount_centavos
    into v_existing
  from public.pos_sale_events as event
  where event.business_id = p_business_id
    and event.sale_id = p_sale_id
    and event.event_type in (
      'void_before_preparation',
      'refund_before_preparation',
      'refund_after_preparation'
    )
  order by event.created_at, event.id
  limit 1;

  -- An exact uncertain retry resolves even if the original shift was closed
  -- after the first response was lost.
  if found then
    if v_existing.event_type = 'void_before_preparation'
      and v_existing.reason = v_reason then
      return query select
        v_sale.id, v_sale.shift_id, v_sale.is_training,
        v_sale.receipt_number, v_existing.id, v_existing.created_at,
        v_existing.payment_method, v_existing.amount_centavos,
        v_existing.reason, true;
      return;
    end if;
    raise exception 'This sale was already reversed with different details.'
      using errcode = '23505';
  end if;

  if v_sale.shift_status <> 'open' then
    raise exception 'A sale cannot be voided after its shift is closed.'
      using errcode = '55000';
  end if;

  insert into public.pos_sale_events (
    business_id, sale_id, event_type, amount_centavos, payment_method,
    retain_cost, reference_number, reason, metadata, acted_by
  ) values (
    p_business_id, p_sale_id, 'void_before_preparation',
    v_sale.total_centavos, v_sale.payment_method, false,
    v_sale.reference_number, v_reason,
    jsonb_build_object(
      'operationSchemaVersion', 1,
      'shiftId', v_sale.shift_id,
      'receiptNumber', v_sale.receipt_number
    ),
    v_user_id
  ) returning * into v_event;

  return query select
    v_sale.id, v_sale.shift_id, v_sale.is_training,
    v_sale.receipt_number, v_event.id, v_event.created_at,
    v_event.payment_method, v_event.amount_centavos,
    v_event.reason, false;
end;
$$;

-- New clients bind every checkout to the exact shift and mode shown in the UI.
-- No defaults are used so PostgREST cannot confuse this contract with the
-- seven-argument Phase 3 compatibility endpoint.
create or replace function public.pos_complete_shift_sale(
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
begin
  return query
  select completed.sale_id, completed.shift_id, completed.is_training,
         completed.receipt_number, completed.business_date,
         completed.completed_at, completed.payment_method,
         completed.item_count, completed.units_sold,
         completed.subtotal_centavos, completed.total_centavos,
         completed.cash_tendered_centavos, completed.change_given_centavos,
         completed.is_retry
  from public._pos_phase4_complete_sale(
    p_business_id, p_shift_id, p_is_training, p_client_sale_id, p_items,
    p_payment_method, p_cash_tendered_centavos, p_reference_number,
    p_note, false
  ) as completed;
end;
$$;

-- Cached Phase 3 clients remain usable during a staged static-site rollout.
-- This wrapper preserves the v1 idempotency fingerprint, but it never opens a
-- shift and never selects a training shift. A new sale requires exactly one
-- already-open live shift; an exact old retry still resolves after close.
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
begin
  return query
  select completed.sale_id, completed.receipt_number,
         completed.business_date, completed.completed_at,
         completed.payment_method, completed.item_count,
         completed.units_sold, completed.subtotal_centavos,
         completed.total_centavos, completed.cash_tendered_centavos,
         completed.change_given_centavos, completed.is_retry
  from public._pos_phase4_complete_sale(
    p_business_id, null, null, p_client_sale_id, p_items,
    p_payment_method, p_cash_tendered_centavos, p_reference_number,
    p_note, true
  ) as completed;
end;
$$;

create or replace function public._pos_phase4_complete_sale(
  p_business_id uuid,
  p_requested_shift_id uuid,
  p_requested_is_training boolean,
  p_client_sale_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_cash_tendered_centavos bigint,
  p_reference_number text,
  p_note text,
  p_legacy_client boolean
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
  v_shift_id uuid;
  v_is_training boolean;
  v_open_live_count integer;
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

  -- Authorize before validating the request so outsiders cannot use checkout
  -- as a product, shift, or validation oracle.
  select member.role into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true
  for share;

  if v_role is null or v_role not in ('owner', 'manager', 'cashier') then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;

  if not p_legacy_client
    and (p_requested_shift_id is null or p_requested_is_training is null) then
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
    ) order by (cart.item ->> 'product_id')::uuid
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
    'checkoutSchemaVersion', case when p_legacy_client then 1 else 2 end,
    'items', v_normalized_items,
    'paymentMethod', v_method,
    'cashTenderedCentavos', case when v_method = 'cash'
      then p_cash_tendered_centavos else null end,
    'referenceNumber', case when v_method = 'cash' then null else v_reference end,
    'note', v_note
  );
  if not p_legacy_client then
    v_fingerprint_payload := v_fingerprint_payload || jsonb_build_object(
      'shiftId', p_requested_shift_id,
      'isTraining', p_requested_is_training
    );
  end if;

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
    if v_existing.request_fingerprint is distinct from v_fingerprint
      or (p_legacy_client and v_existing.is_training) then
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-shift:' || p_business_id::text, 0)
  );

  if p_legacy_client then
    select count(*)::integer, min(shift.id::text)::uuid
      into v_open_live_count, v_shift_id
    from public.pos_shifts as shift
    join public.pos_registers as register
      on register.business_id = shift.business_id
     and register.id = shift.register_id
    where shift.business_id = p_business_id
      and shift.status = 'open'
      and shift.is_training = false
      and register.active = true
      and register.archived_at is null;

    if v_open_live_count = 0 then
      raise exception 'Open a live shift before checkout.' using errcode = '55000';
    elsif v_open_live_count > 1 then
      raise exception 'Select a register with the updated POS before checkout.'
        using errcode = '55000';
    end if;
    v_is_training := false;
  else
    v_shift_id := p_requested_shift_id;
    v_is_training := p_requested_is_training;
  end if;

  perform 1
  from public.pos_shifts as shift
  join public.pos_registers as register
    on register.business_id = shift.business_id
   and register.id = shift.register_id
  where shift.business_id = p_business_id
    and shift.id = v_shift_id
    and shift.status = 'open'
    and shift.is_training = v_is_training
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
    p_business_id, v_shift_id, p_client_sale_id, v_fingerprint,
    'open', 'live', v_is_training, v_user_id, v_note
  ) returning id into v_sale_id;

  for v_item in
    select
      (cart.item ->> 'product_id')::uuid as product_id,
      (cart.item ->> 'product_version_id')::uuid as product_version_id,
      (cart.item ->> 'quantity')::integer as quantity
    from jsonb_array_elements(v_normalized_items) as cart(item)
    order by (cart.item ->> 'product_id')::uuid
  loop
    select version.name_snapshot, version.size_snapshot,
           version.selling_price_centavos,
           version.ingredient_cost_centavos,
           version.packaging_cost_centavos
      into v_product_name, v_product_size, v_unit_price,
           v_ingredient_cost, v_packaging_cost
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
      business_id, sale_id, line_number, product_id, product_version_id,
      name_snapshot, size_snapshot, quantity, unit_price_centavos,
      ingredient_unit_cost_centavos, packaging_unit_cost_centavos,
      line_discount_centavos
    ) values (
      p_business_id, v_sale_id, v_line_number, v_item.product_id,
      v_item.product_version_id, v_product_name, v_product_size,
      v_item.quantity, v_unit_price, v_ingredient_cost, v_packaging_cost, 0
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
    p_business_id, v_is_training, pg_catalog.clock_timestamp()
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
      'checkoutSchemaVersion', case when p_legacy_client then 1 else 2 end,
      'shiftId', v_shift_id,
      'isTraining', v_is_training
    )
  );

  return query select
    v_sale_id, v_shift_id, v_is_training, v_receipt_number,
    v_business_date, v_completed_at, v_method, v_item_count, v_units_sold,
    v_subtotal, v_subtotal, v_cash_tendered, v_change, false;
end;
$$;

create or replace function public.pos_close_shift(
  p_business_id uuid,
  p_shift_id uuid,
  p_counted_cash_centavos bigint,
  p_verified_gcash_centavos bigint,
  p_verified_gotyme_centavos bigint,
  p_close_notes text
)
returns table (
  shift_id uuid,
  register_id uuid,
  register_name text,
  is_training boolean,
  opened_at timestamptz,
  closed_at timestamptz,
  gross_sale_count bigint,
  voided_sale_count bigint,
  net_sale_count bigint,
  net_items_sold bigint,
  gross_sales_centavos bigint,
  voided_sales_centavos bigint,
  net_sales_centavos bigint,
  opening_cash_centavos bigint,
  expected_cash_centavos bigint,
  counted_cash_centavos bigint,
  cash_variance_centavos bigint,
  expected_gcash_centavos bigint,
  verified_gcash_centavos bigint,
  gcash_variance_centavos bigint,
  expected_gotyme_centavos bigint,
  verified_gotyme_centavos bigint,
  gotyme_variance_centavos bigint,
  estimated_cost_centavos bigint,
  estimated_gross_profit_centavos bigint,
  can_view_costs boolean,
  is_retry boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_can_view_costs boolean;
  v_note text := nullif(pg_catalog.btrim(coalesce(p_close_notes, '')), '');
  v_shift record;
  v_metrics record;
  v_expected_cash bigint;
  v_expected_gcash bigint;
  v_expected_gotyme bigint;
  v_counted_cash bigint;
  v_verified_gcash bigint;
  v_verified_gotyme bigint;
  v_is_retry boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select member.role into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true
  for share;

  if v_role is null or v_role not in ('owner', 'manager', 'cashier') then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;
  if p_shift_id is null then
    raise exception 'A shift ID is required.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Close notes cannot exceed 500 characters.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-shift:' || p_business_id::text, 0)
  );

  select shift.*, register.name as register_name
    into v_shift
  from public.pos_shifts as shift
  join public.pos_registers as register
    on register.business_id = shift.business_id
   and register.id = shift.register_id
  where shift.business_id = p_business_id
    and shift.id = p_shift_id
  for update of shift;

  if not found then
    raise exception 'The POS shift was not found.' using errcode = 'P0002';
  end if;
  if v_shift.is_training and v_role not in ('owner', 'manager') then
    raise exception 'Only an owner or manager can close training mode.'
      using errcode = '42501';
  end if;

  v_can_view_costs := v_role in ('owner', 'manager');

  -- Resolve an uncertain close from stored facts before checking mutable state.
  if v_shift.status = 'closed' then
    if v_shift.is_training then
      if p_counted_cash_centavos is not null
        or p_verified_gcash_centavos is not null
        or p_verified_gotyme_centavos is not null
        or v_note is distinct from v_shift.close_notes then
        raise exception 'This shift was already closed with different reconciliation details.'
          using errcode = '23505';
      end if;
    elsif p_counted_cash_centavos is distinct from v_shift.counted_cash_centavos
      or p_verified_gcash_centavos is distinct from v_shift.verified_gcash_centavos
      or p_verified_gotyme_centavos is distinct from v_shift.verified_gotyme_centavos
      or v_note is distinct from v_shift.close_notes then
      raise exception 'This shift was already closed with different reconciliation details.'
        using errcode = '23505';
    end if;
    v_is_retry := true;
  else
    if v_shift.is_training then
      if p_counted_cash_centavos is not null
        or p_verified_gcash_centavos is not null
        or p_verified_gotyme_centavos is not null then
        raise exception 'Training shifts reconcile automatically; do not submit real account counts.'
          using errcode = '22023';
      end if;
    else
      if p_counted_cash_centavos is null
        or p_verified_gcash_centavos is null
        or p_verified_gotyme_centavos is null
        or p_counted_cash_centavos not between 0 and 100000000000
        or p_verified_gcash_centavos not between 0 and 100000000000
        or p_verified_gotyme_centavos not between 0 and 100000000000 then
        raise exception 'Live close requires supported nonnegative cash, GCash, and GoTyme counts.'
          using errcode = '22023';
      end if;
    end if;
  end if;

  select * into strict v_metrics
  from public._pos_phase4_metrics(
    p_business_id, p_shift_id, null, v_shift.is_training
  );

  if not v_is_retry then
    v_expected_cash := v_shift.opening_cash_centavos
      + v_metrics.cash_net_centavos
      + v_metrics.cash_pay_ins_centavos
      - v_metrics.cash_pay_outs_centavos
      - v_metrics.cash_expenses_centavos;
    -- Online verification reconciles shift receipts, not the full wallet or
    -- bank balance: there is no opening GCash/GoTyme balance on a shift.
    v_expected_gcash := v_metrics.gcash_net_centavos;
    v_expected_gotyme := v_metrics.gotyme_net_centavos;

    if v_expected_cash < 0 or v_expected_gcash < 0 or v_expected_gotyme < 0 then
      raise exception 'Expected account balance cannot be negative; review expenses and cash movements.'
        using errcode = '55000';
    end if;

    v_counted_cash := case when v_shift.is_training
      then v_expected_cash else p_counted_cash_centavos end;
    v_verified_gcash := case when v_shift.is_training
      then v_expected_gcash else p_verified_gcash_centavos end;
    v_verified_gotyme := case when v_shift.is_training
      then v_expected_gotyme else p_verified_gotyme_centavos end;

    update public.pos_shifts as shift
    set status = 'closed',
        expected_cash_centavos = v_expected_cash,
        counted_cash_centavos = v_counted_cash,
        expected_gcash_centavos = v_expected_gcash,
        verified_gcash_centavos = v_verified_gcash,
        expected_gotyme_centavos = v_expected_gotyme,
        verified_gotyme_centavos = v_verified_gotyme,
        closed_by = v_user_id,
        closed_at = pg_catalog.clock_timestamp(),
        close_notes = v_note
    where shift.business_id = p_business_id and shift.id = p_shift_id
    returning shift.*, v_shift.register_name as register_name into v_shift;
  end if;

  return query select
    v_shift.id, v_shift.register_id, v_shift.register_name,
    v_shift.is_training, v_shift.opened_at, v_shift.closed_at,
    v_metrics.gross_sale_count, v_metrics.voided_sale_count,
    v_metrics.net_sale_count, v_metrics.net_items_sold,
    v_metrics.gross_sales_centavos, v_metrics.voided_sales_centavos,
    v_metrics.net_sales_centavos, v_shift.opening_cash_centavos,
    v_shift.expected_cash_centavos, v_shift.counted_cash_centavos,
    v_shift.cash_variance_centavos, v_shift.expected_gcash_centavos,
    v_shift.verified_gcash_centavos, v_shift.gcash_variance_centavos,
    v_shift.expected_gotyme_centavos, v_shift.verified_gotyme_centavos,
    v_shift.gotyme_variance_centavos,
    case when v_can_view_costs
      then v_metrics.net_estimated_cost_centavos else null::bigint end,
    case when v_can_view_costs
      then v_metrics.estimated_gross_profit_centavos else null::bigint end,
    v_can_view_costs, v_is_retry;
end;
$$;

create or replace function public.pos_get_shift_status(p_business_id uuid)
returns table (
  business_timezone text,
  current_business_date date,
  register_id uuid,
  register_name text,
  has_open_shift boolean,
  shift_id uuid,
  is_training boolean,
  opening_cash_centavos bigint,
  opened_at timestamptz,
  opened_by_display_name text,
  gross_sale_count bigint,
  voided_sale_count bigint,
  net_sale_count bigint,
  net_items_sold bigint,
  net_sales_centavos bigint,
  cash_net_centavos bigint,
  gcash_net_centavos bigint,
  gotyme_net_centavos bigint,
  estimated_cost_centavos bigint,
  estimated_gross_profit_centavos bigint,
  can_view_costs boolean,
  can_open_live boolean,
  can_open_training boolean,
  can_close_shift boolean,
  can_void_sales boolean,
  last_closed_shift_id uuid,
  last_closed_is_training boolean,
  last_closed_at timestamptz,
  last_cash_variance_centavos bigint
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

  return query
  select
    v_timezone,
    (pg_catalog.timezone(v_timezone, pg_catalog.now()))::date,
    register.id,
    register.name,
    (open_shift.id is not null),
    open_shift.id,
    open_shift.is_training,
    open_shift.opening_cash_centavos,
    open_shift.opened_at,
    opener.display_name,
    coalesce(metrics.gross_sale_count, 0)::bigint,
    coalesce(metrics.voided_sale_count, 0)::bigint,
    coalesce(metrics.net_sale_count, 0)::bigint,
    coalesce(metrics.net_items_sold, 0)::bigint,
    coalesce(metrics.net_sales_centavos, 0)::bigint,
    coalesce(metrics.cash_net_centavos, 0)::bigint,
    coalesce(metrics.gcash_net_centavos, 0)::bigint,
    coalesce(metrics.gotyme_net_centavos, 0)::bigint,
    case when v_can_view_costs
      then coalesce(metrics.net_estimated_cost_centavos, 0)::bigint
      else null::bigint
    end,
    case when v_can_view_costs
      then coalesce(metrics.estimated_gross_profit_centavos, 0)::bigint
      else null::bigint
    end,
    v_can_view_costs,
    open_shift.id is null,
    open_shift.id is null and v_role in ('owner', 'manager'),
    open_shift.id is not null
      and (open_shift.is_training = false or v_role in ('owner', 'manager')),
    open_shift.id is not null and v_role in ('owner', 'manager'),
    last_shift.id,
    last_shift.is_training,
    last_shift.closed_at,
    last_shift.cash_variance_centavos
  from public.pos_registers as register
  left join lateral (
    select shift.*
    from public.pos_shifts as shift
    where shift.business_id = register.business_id
      and shift.register_id = register.id
      and shift.status = 'open'
    limit 1
  ) as open_shift on true
  left join public.pos_business_members as opener
    on opener.business_id = open_shift.business_id
   and opener.user_id = open_shift.opened_by
  left join lateral public._pos_phase4_metrics(
    p_business_id, open_shift.id, null, coalesce(open_shift.is_training, false)
  ) as metrics on true
  left join lateral (
    select shift.id, shift.is_training, shift.closed_at,
           shift.cash_variance_centavos
    from public.pos_shifts as shift
    where shift.business_id = register.business_id
      and shift.register_id = register.id
      and shift.status = 'closed'
    order by shift.closed_at desc, shift.id desc
    limit 1
  ) as last_shift on true
  where register.business_id = p_business_id
    and register.active = true
    and register.archived_at is null
  order by register.created_at, register.id;
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
  v_date date;
  v_metrics record;
  v_can_view_costs boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select member.role, business.timezone into v_role, v_timezone
  from public.pos_business_members as member
  join public.pos_businesses as business on business.id = member.business_id
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true;

  if v_role is null then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;

  v_can_view_costs := v_role in ('owner', 'manager');
  v_date := (pg_catalog.timezone(v_timezone, pg_catalog.now()))::date;
  select * into strict v_metrics
  from public._pos_phase4_metrics(p_business_id, null, v_date, false);

  return query select
    v_date,
    v_metrics.net_sale_count,
    v_metrics.net_items_sold,
    v_metrics.net_sales_centavos,
    v_metrics.cash_net_centavos,
    v_metrics.gcash_net_centavos,
    v_metrics.gotyme_net_centavos,
    case when v_can_view_costs
      then v_metrics.net_estimated_cost_centavos else null::bigint end,
    case when v_can_view_costs
      then v_metrics.estimated_gross_profit_centavos else null::bigint end,
    v_can_view_costs;
end;
$$;

-- Preserve the Phase 3 result shape for cached clients. Reversed live sales
-- remain visible for audit but are unmistakably marked and contribute zero to
-- the displayed net total and before-preparation estimated cost.
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
  cross join lateral (
    select count(*)::bigint as item_count,
           coalesce(sum(item.quantity), 0)::bigint as units_sold,
           string_agg(
             item.quantity::text || ' x ' || item.name_snapshot
               || case when item.size_snapshot is null then ''
                    else ' (' || item.size_snapshot || ')' end,
             ', ' order by item.line_number
           ) as item_summary
    from public.pos_sale_items as item
    where item.business_id = sale.business_id and item.sale_id = sale.id
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

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 4, 'name', 'pos_phase_4_operations'),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

revoke all on function public._pos_phase4_complete_sale(
  uuid, uuid, boolean, uuid, jsonb, text, bigint, text, text, boolean
) from public, anon, authenticated;
revoke all on function public._pos_phase4_metrics(uuid, uuid, date, boolean)
  from public, anon, authenticated;
revoke all on function public.pos_open_shift(uuid, boolean, bigint)
  from public, anon, authenticated;
revoke all on function public.pos_get_shift_status(uuid)
  from public, anon, authenticated;
revoke all on function public.pos_close_shift(
  uuid, uuid, bigint, bigint, bigint, text
) from public, anon, authenticated;
revoke all on function public.pos_complete_shift_sale(
  uuid, uuid, boolean, uuid, jsonb, text, bigint, text, text
) from public, anon, authenticated;
revoke all on function public.pos_complete_sale(
  uuid, uuid, jsonb, text, bigint, text, text
) from public, anon, authenticated;
revoke all on function public.pos_void_sale(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.pos_get_today_summary(uuid)
  from public, anon, authenticated;
revoke all on function public.pos_get_recent_sales(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.pos_get_recent_sales_v2(uuid, boolean, integer)
  from public, anon, authenticated;
revoke all on function public.pos_get_end_of_day_summary(uuid, date, boolean)
  from public, anon, authenticated;

grant execute on function public.pos_open_shift(uuid, boolean, bigint)
  to authenticated;
grant execute on function public.pos_get_shift_status(uuid)
  to authenticated;
grant execute on function public.pos_close_shift(
  uuid, uuid, bigint, bigint, bigint, text
) to authenticated;
grant execute on function public.pos_complete_shift_sale(
  uuid, uuid, boolean, uuid, jsonb, text, bigint, text, text
) to authenticated;
grant execute on function public.pos_complete_sale(
  uuid, uuid, jsonb, text, bigint, text, text
) to authenticated;
grant execute on function public.pos_void_sale(uuid, uuid, text)
  to authenticated;
grant execute on function public.pos_get_today_summary(uuid)
  to authenticated;
grant execute on function public.pos_get_recent_sales(uuid, integer)
  to authenticated;
grant execute on function public.pos_get_recent_sales_v2(uuid, boolean, integer)
  to authenticated;
grant execute on function public.pos_get_end_of_day_summary(uuid, date, boolean)
  to authenticated;

comment on function public.pos_open_shift(uuid, boolean, bigint) is
  'Opens the single active register in immutable live or training mode. Training requires manager authority and zero opening cash.';
comment on function public.pos_close_shift(uuid, uuid, bigint, bigint, bigint, text) is
  'Atomically computes expected balances and closes a shift. Training shifts auto-reconcile; live counts are caller facts.';
comment on function public.pos_complete_shift_sale(
  uuid, uuid, boolean, uuid, jsonb, text, bigint, text, text
) is
  'Atomic shift-bound checkout. The database validates open mode and owns all price, cost, receipt, and payment facts.';
comment on function public.pos_complete_sale(
  uuid, uuid, jsonb, text, bigint, text, text
) is
  'Safe Phase 3 compatibility checkout. It never opens a shift and only creates live sales in an existing unambiguous live shift.';
comment on function public.pos_void_sale(uuid, uuid, text) is
  'Owner/manager whole-sale void before preparation, represented by one immutable financial reversal event.';
comment on function public.pos_get_end_of_day_summary(uuid, date, boolean) is
  'Mode-explicit business-timezone daily gross, void, net, payment, cost, and estimated gross-profit summary.';

commit;
