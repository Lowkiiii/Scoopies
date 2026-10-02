-- Scoopie's filterable product tally and immutable closed-shift history.
--
-- Both APIs derive their results from completed sales, append-only reversal
-- events, and stored shift reconciliation facts. They never rewrite ledger
-- rows. Date filters are inclusive business dates; a shift history date is
-- the date on which Close shift was confirmed in the business timezone.

begin;

create index pos_shifts_history_cursor_idx
  on public.pos_shifts (
    business_id,
    is_training,
    closed_at desc,
    id desc
  )
  where status = 'closed';

create or replace function public.pos_get_sales_product_tally_v2(
  p_business_id uuid,
  p_is_training boolean,
  p_date_from date,
  p_date_to date,
  p_shift_id uuid
)
returns table (
  product_id uuid,
  item_name text,
  size_label text,
  order_count bigint,
  units_sold bigint,
  net_sales_centavos bigint
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

  -- Authorize first so malformed filters cannot be used as a business or
  -- shift-membership oracle.
  select member.role into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true;

  if v_role is null then
    raise exception 'Active POS membership is required.' using errcode = '42501';
  end if;
  if p_is_training is null then
    raise exception 'Tally mode is required.' using errcode = '22023';
  end if;
  if p_date_from is not null and p_date_to is not null
    and p_date_from > p_date_to then
    raise exception 'Tally start date cannot be after end date.'
      using errcode = '22023';
  end if;

  if p_shift_id is not null
    and (p_date_from is not null or p_date_to is not null) then
    raise exception 'Choose either a shift or a date range for the tally, not both.'
      using errcode = '22023';
  end if;

  if p_shift_id is not null then
    perform 1
    from public.pos_shifts as shift
    where shift.business_id = p_business_id
      and shift.id = p_shift_id
      and shift.is_training = p_is_training;

    if not found then
      raise exception 'The selected shift was not found in the requested mode.'
        using errcode = 'P0002';
    end if;
  end if;

  return query
  with eligible_lines as (
    select
      item.product_id,
      item.sale_id,
      item.line_number,
      item.name_snapshot,
      item.size_snapshot,
      item.quantity,
      item.line_total_centavos,
      sale.completed_at
    from public.pos_sales as sale
    join public.pos_sale_items as item
      on item.business_id = sale.business_id
     and item.sale_id = sale.id
    where sale.business_id = p_business_id
      and sale.status = 'completed'
      and sale.is_training = p_is_training
      and (p_shift_id is null or sale.shift_id = p_shift_id)
      and (p_date_from is null or sale.business_date >= p_date_from)
      and (p_date_to is null or sale.business_date <= p_date_to)
      and not exists (
        select 1
        from public.pos_sale_events as event
        where event.business_id = sale.business_id
          and event.sale_id = sale.id
          and event.event_type in (
            'void_before_preparation',
            'refund_before_preparation',
            'refund_after_preparation'
          )
      )
  ), product_totals as (
    select
      line.product_id,
      count(distinct line.sale_id)::bigint as order_count,
      coalesce(sum(line.quantity), 0)::bigint as units_sold,
      coalesce(sum(line.line_total_centavos), 0)::bigint
        as net_sales_centavos,
      (array_agg(
        pg_catalog.btrim(line.name_snapshot)
        order by line.completed_at desc, line.sale_id desc,
                 line.line_number desc
      ))[1] as latest_name_snapshot,
      (array_agg(
        nullif(pg_catalog.btrim(line.size_snapshot), '')
        order by line.completed_at desc, line.sale_id desc,
                 line.line_number desc
      ) filter (
        where nullif(pg_catalog.btrim(line.size_snapshot), '') is not null
      ))[1] as latest_size_snapshot
    from eligible_lines as line
    group by line.product_id
  )
  select
    totals.product_id,
    coalesce(
      nullif(pg_catalog.btrim(product.name), ''),
      totals.latest_name_snapshot
    )::text as item_name,
    coalesce(
      nullif(pg_catalog.btrim(active_version.size_snapshot), ''),
      totals.latest_size_snapshot
    )::text as size_label,
    totals.order_count,
    totals.units_sold,
    totals.net_sales_centavos
  from product_totals as totals
  left join public.pos_products as product
    on product.business_id = p_business_id
   and product.id = totals.product_id
  left join public.pos_product_versions as active_version
    on active_version.business_id = p_business_id
   and active_version.product_id = totals.product_id
   and active_version.id = product.active_version_id
  order by totals.units_sold desc, totals.net_sales_centavos desc,
           pg_catalog.lower(coalesce(
             nullif(pg_catalog.btrim(product.name), ''),
             totals.latest_name_snapshot
           )),
           pg_catalog.lower(coalesce(
             nullif(pg_catalog.btrim(active_version.size_snapshot), ''),
             totals.latest_size_snapshot,
             ''
           )),
           totals.product_id;
end;
$$;

create or replace function public.pos_get_closed_shifts_page(
  p_business_id uuid,
  p_is_training boolean,
  p_date_from date,
  p_date_to date,
  p_before_closed_at timestamptz,
  p_before_shift_id uuid,
  p_limit integer
)
returns table (
  shift_id uuid,
  register_id uuid,
  register_name text,
  event_id uuid,
  event_name text,
  is_training boolean,
  opened_business_date date,
  closed_business_date date,
  opened_at timestamptz,
  opened_by_display_name text,
  closed_at timestamptz,
  closed_by_display_name text,
  close_notes text,
  gross_sale_count bigint,
  voided_sale_count bigint,
  net_sale_count bigint,
  net_items_sold bigint,
  gross_sales_centavos bigint,
  voided_sales_centavos bigint,
  net_sales_centavos bigint,
  cash_net_centavos bigint,
  gcash_net_centavos bigint,
  gotyme_net_centavos bigint,
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
  v_timezone text;
  v_can_view_costs boolean;
  v_closed_from timestamptz;
  v_closed_before timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  -- Authorization intentionally precedes every filter and cursor check.
  select member.role, business.timezone
    into v_role, v_timezone
  from public.pos_business_members as member
  join public.pos_businesses as business
    on business.id = member.business_id
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true;

  if v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'Active owner or manager membership is required.'
      using errcode = '42501';
  end if;
  if p_is_training is null then
    raise exception 'Shift-history mode is required.' using errcode = '22023';
  end if;
  if p_date_from is not null and p_date_to is not null
    and p_date_from > p_date_to then
    raise exception 'Shift-history start date cannot be after end date.'
      using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Shift-history page limit must be from 1 to 100.'
      using errcode = '22023';
  end if;
  if (p_before_closed_at is null) <> (p_before_shift_id is null) then
    raise exception 'Shift-history cursor time and shift ID must be provided together.'
      using errcode = '22023';
  end if;

  v_can_view_costs := v_role in ('owner', 'manager');
  v_closed_from := case when p_date_from is null then null::timestamptz
    else p_date_from::timestamp at time zone v_timezone end;
  v_closed_before := case when p_date_to is null then null::timestamptz
    else (p_date_to + 1)::timestamp at time zone v_timezone end;

  return query
  with candidate_shifts as (
    select
      shift.*,
      (pg_catalog.timezone(v_timezone, shift.opened_at))::date
        as opened_business_date,
      (pg_catalog.timezone(v_timezone, shift.closed_at))::date
        as closed_business_date
    from public.pos_shifts as shift
    where shift.business_id = p_business_id
      and shift.status = 'closed'
      and shift.is_training = p_is_training
      and (v_closed_from is null or shift.closed_at >= v_closed_from)
      and (v_closed_before is null or shift.closed_at < v_closed_before)
      and (
        p_before_closed_at is null
        or (shift.closed_at, shift.id)
          < (p_before_closed_at, p_before_shift_id)
      )
    order by shift.closed_at desc, shift.id desc
    limit p_limit + 1
  ), page_shifts as (
    select candidate.*
    from candidate_shifts as candidate
    order by candidate.closed_at desc, candidate.id desc
    limit p_limit
  ), page_state as (
    select (count(*) > p_limit) as has_more
    from candidate_shifts
  )
  select
    shift.id,
    shift.register_id,
    register.name,
    shift.event_id,
    event.name,
    shift.is_training,
    shift.opened_business_date,
    shift.closed_business_date,
    shift.opened_at,
    opener.display_name,
    shift.closed_at,
    closer.display_name,
    shift.close_notes,
    metrics.gross_sale_count,
    metrics.voided_sale_count,
    metrics.net_sale_count,
    metrics.net_items_sold,
    metrics.gross_sales_centavos,
    metrics.voided_sales_centavos,
    metrics.net_sales_centavos,
    metrics.cash_net_centavos,
    metrics.gcash_net_centavos,
    metrics.gotyme_net_centavos,
    shift.opening_cash_centavos,
    shift.expected_cash_centavos,
    shift.counted_cash_centavos,
    shift.cash_variance_centavos,
    shift.expected_gcash_centavos,
    shift.verified_gcash_centavos,
    shift.gcash_variance_centavos,
    shift.expected_gotyme_centavos,
    shift.verified_gotyme_centavos,
    shift.gotyme_variance_centavos,
    case when v_can_view_costs
      then metrics.net_estimated_cost_centavos else null::bigint end,
    case when v_can_view_costs
      then metrics.estimated_gross_profit_centavos else null::bigint end,
    v_can_view_costs,
    page_state.has_more
  from page_shifts as shift
  join public.pos_registers as register
    on register.business_id = shift.business_id
   and register.id = shift.register_id
  join public.pos_business_members as opener
    on opener.business_id = shift.business_id
   and opener.user_id = shift.opened_by
  join public.pos_business_members as closer
    on closer.business_id = shift.business_id
   and closer.user_id = shift.closed_by
  left join public.pos_events as event
    on event.business_id = shift.business_id
   and event.id = shift.event_id
  cross join lateral public._pos_phase4_metrics(
    p_business_id, shift.id, null, shift.is_training
  ) as metrics
  cross join page_state
  order by shift.closed_at desc, shift.id desc;
end;
$$;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object(
    'version', 8,
    'name', 'pos_shift_history_and_filtered_tally'
  ),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

revoke all on function public.pos_get_sales_product_tally_v2(
  uuid, boolean, date, date, uuid
) from public, anon, authenticated;
revoke all on function public.pos_get_closed_shifts_page(
  uuid, boolean, date, date, timestamptz, uuid, integer
) from public, anon, authenticated;

grant execute on function public.pos_get_sales_product_tally_v2(
  uuid, boolean, date, date, uuid
) to authenticated;
grant execute on function public.pos_get_closed_shifts_page(
  uuid, boolean, date, date, timestamptz, uuid, integer
) to authenticated;

comment on function public.pos_get_sales_product_tally_v2(
  uuid, boolean, date, date, uuid
) is
  'Net product totals from immutable item snapshots, filterable by inclusive sale business dates and/or one exact mode-matched shift. Whole reversed receipts are excluded.';
comment on function public.pos_get_closed_shifts_page(
  uuid, boolean, date, date, timestamptz, uuid, integer
) is
  'Owner/manager closed-shift reconciliation history in newest-first keyset pages. Inclusive dates use the business-local date on which Close shift was confirmed.';

commit;
