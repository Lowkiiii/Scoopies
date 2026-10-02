-- Read-only production smoke test for the v8 filtered tally and closed-shift
-- history. No catalog, ledger, event, or shift rows are mutated.

begin isolation level repeatable read;

create temporary table shift_v8_live_context on commit drop as
select member.business_id, member.user_id
from public.pos_business_members as member
where member.active = true
  and member.role = 'owner'
  and exists (
    select 1
    from public.pos_sales as sale
    where sale.business_id = member.business_id
      and sale.status = 'completed'
  )
order by member.business_id
limit 1;

do $$
begin
  if (select count(*) from shift_v8_live_context) <> 1 then
    raise exception 'No active owner with completed sales is available for the v8 live smoke test.';
  end if;
end;
$$;

create temporary table shift_v8_expected_tally on commit drop as
select
  mode.is_training,
  count(distinct item.product_id)::bigint as product_count,
  coalesce(sum(item.quantity), 0)::bigint as units_sold,
  count(distinct (sale.id, item.product_id)) filter (
    where item.product_id is not null
  )::bigint as product_order_count,
  coalesce(sum(item.line_total_centavos), 0)::bigint
    as net_sales_centavos
from shift_v8_live_context as context
cross join (values (false), (true)) as mode(is_training)
left join public.pos_sales as sale
  on sale.business_id = context.business_id
 and sale.status = 'completed'
 and sale.is_training = mode.is_training
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
left join public.pos_sale_items as item
  on item.business_id = sale.business_id
 and item.sale_id = sale.id
group by mode.is_training;

create temporary table shift_v8_expected_history on commit drop as
select mode.is_training,
       count(shift.id)::integer as shift_count
from shift_v8_live_context as context
cross join (values (false), (true)) as mode(is_training)
left join public.pos_shifts as shift
  on shift.business_id = context.business_id
 and shift.status = 'closed'
 and shift.is_training = mode.is_training
group by mode.is_training;

grant select on table shift_v8_live_context to authenticated;
grant select on table shift_v8_expected_tally to authenticated;
grant select on table shift_v8_expected_history to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from shift_v8_live_context),
  true
);

do $$
declare
  v_business_id uuid := (select business_id from shift_v8_live_context);
  v_mode boolean;
  v_expected record;
  v_product_count bigint;
  v_units_sold bigint;
  v_product_order_count bigint;
  v_net_sales bigint;
  v_shift_count integer;
  v_page_count integer;
  v_distinct_count integer;
  v_all_has_more boolean;
  v_any_has_more boolean;
begin
  foreach v_mode in array array[false, true] loop
    select * into strict v_expected
    from shift_v8_expected_tally as expected
    where expected.is_training = v_mode;

    select count(*)::bigint,
           coalesce(sum(tally.units_sold), 0)::bigint,
           coalesce(sum(tally.order_count), 0)::bigint,
           coalesce(sum(tally.net_sales_centavos), 0)::bigint
      into v_product_count, v_units_sold, v_product_order_count,
           v_net_sales
    from public.pos_get_sales_product_tally_v2(
      v_business_id, v_mode, null, null, null
    ) as tally;

    if v_product_count is distinct from v_expected.product_count
      or v_units_sold is distinct from v_expected.units_sold
      or v_product_order_count is distinct from
        v_expected.product_order_count
      or v_net_sales is distinct from v_expected.net_sales_centavos then
      raise exception 'V8 % tally differs from immutable ledger: rows %, units %, product-orders %, sales %.',
        case when v_mode then 'training' else 'live' end,
        v_product_count, v_units_sold, v_product_order_count, v_net_sales;
    end if;

    if exists (
      select 1
      from public.pos_get_sales_product_tally_v2(
        v_business_id, v_mode, null, null, null
      ) as tally
      where tally.product_id is null
        or nullif(pg_catalog.btrim(tally.item_name), '') is null
        or tally.order_count <= 0
        or tally.units_sold <= 0
        or tally.net_sales_centavos <= 0
    ) then
      raise exception 'V8 tally returned an invalid identity, label, count, or amount.';
    end if;

    select expected.shift_count into strict v_shift_count
    from shift_v8_expected_history as expected
    where expected.is_training = v_mode;

    select count(*)::integer,
           count(distinct history.shift_id)::integer,
           coalesce(bool_and(history.has_more), false),
           coalesce(bool_or(history.has_more), false)
      into v_page_count, v_distinct_count, v_all_has_more, v_any_has_more
    from public.pos_get_closed_shifts_page(
      v_business_id, v_mode, null, null, null, null, 20
    ) as history;

    if v_page_count <> least(v_shift_count, 20)
      or v_distinct_count <> v_page_count
      or v_all_has_more is distinct from (v_shift_count > 20)
      or v_any_has_more is distinct from (v_shift_count > 20) then
      raise exception 'V8 % shift-history page count, uniqueness, or has-more flag is wrong.',
        case when v_mode then 'training' else 'live' end;
    end if;

    if exists (
      select 1
      from public.pos_get_closed_shifts_page(
        v_business_id, v_mode, null, null, null, null, 20
      ) as history
      where history.closed_at is null
        or history.closed_business_date is null
        or history.expected_cash_centavos is null
        or history.counted_cash_centavos is null
        or history.expected_gcash_centavos is null
        or history.verified_gcash_centavos is null
        or history.expected_gotyme_centavos is null
        or history.verified_gotyme_centavos is null
        or history.net_sales_centavos
          <> history.gross_sales_centavos - history.voided_sales_centavos
        or history.estimated_cost_centavos is null
        or history.estimated_gross_profit_centavos is null
        or history.can_view_costs is not true
    ) then
      raise exception 'V8 shift history returned incomplete reconciliation or owner cost data.';
    end if;
  end loop;
end;
$$;

reset role;
select 'PASS: POS shift-history live access checks' as result;
rollback;
