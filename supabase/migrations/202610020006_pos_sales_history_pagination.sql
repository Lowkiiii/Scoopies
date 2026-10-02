-- Scoopie's POS sales-history pagination and all-time reporting.
--
-- The checkout screen deliberately keeps its existing latest-20 RPC. This
-- migration adds a separate cursor API for older immutable receipts and an
-- authoritative aggregate so clients never derive "overall sales" from a
-- partially loaded page set.

begin;

create index pos_sales_history_cursor_idx
  on public.pos_sales (
    business_id,
    is_training,
    completed_at desc,
    id desc
  )
  where status = 'completed';

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

  -- Authorize before validating page inputs so outsiders cannot use errors as
  -- a membership or ledger oracle.
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
  cross join page_state
  order by sale.completed_at desc, sale.id desc;
end;
$$;

create or replace function public.pos_get_sales_history_summary(
  p_business_id uuid,
  p_is_training boolean
)
returns table (
  first_business_date date,
  last_business_date date,
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
  if p_is_training is null then
    raise exception 'History mode is required.' using errcode = '22023';
  end if;

  v_can_view_costs := v_role in ('owner', 'manager');

  return query
  with selected_sales as (
    select sale.id, sale.business_date, sale.total_centavos,
           sale.estimated_cost_centavos
    from public.pos_sales as sale
    where sale.business_id = p_business_id
      and sale.status = 'completed'
      and sale.is_training = p_is_training
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
      min(sale.business_date) as first_business_date,
      max(sale.business_date) as last_business_date,
      count(*)::bigint as gross_sale_count,
      count(*) filter (
        where reversal.event_type = 'void_before_preparation'
      )::bigint as voided_sale_count,
      coalesce(sum(items.units), 0)::bigint as gross_items_sold,
      coalesce(sum(items.units) filter (
        where reversal.event_type = 'void_before_preparation'
      ), 0)::bigint as voided_items_sold,
      coalesce(sum(sale.total_centavos), 0)::bigint
        as gross_sales_centavos,
      coalesce(sum(reversal.amount_centavos), 0)::bigint
        as voided_sales_centavos,
      coalesce(sum(sale.estimated_cost_centavos) filter (
        where reversal.sale_id is null or reversal.retain_cost = true
      ), 0)::bigint as net_estimated_cost_centavos
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
  )
  select
    sales.first_business_date,
    sales.last_business_date,
    v_timezone,
    p_is_training,
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
    case when v_can_view_costs
      then sales.net_estimated_cost_centavos else null::bigint end,
    case when v_can_view_costs then
      (sales.gross_sales_centavos - sales.voided_sales_centavos)
        - sales.net_estimated_cost_centavos
      else null::bigint end,
    v_can_view_costs
  from sale_rollup as sales
  cross join payment_gross as payments
  cross join reversal_rollup as reversed;
end;
$$;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 6, 'name', 'pos_sales_history_pagination'),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

revoke all on function public.pos_get_sales_history_page(
  uuid, boolean, timestamptz, uuid, integer
) from public, anon, authenticated;
revoke all on function public.pos_get_sales_history_summary(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.pos_get_sales_history_page(
  uuid, boolean, timestamptz, uuid, integer
) to authenticated;
grant execute on function public.pos_get_sales_history_summary(uuid, boolean)
  to authenticated;

comment on function public.pos_get_sales_history_page(
  uuid, boolean, timestamptz, uuid, integer
) is
  'Cashier-safe immutable receipt history in newest-first keyset pages. The timestamp/UUID cursor is exclusive; costs are NULL for cashiers.';
comment on function public.pos_get_sales_history_summary(uuid, boolean) is
  'Authoritative all-time mode-specific sales totals and business-date span. Estimated cost and gross profit are NULL for cashiers.';

commit;
