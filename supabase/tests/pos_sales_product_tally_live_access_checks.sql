-- Read-only production smoke test for the v7 product tally. No ledger or
-- catalog rows are inserted, updated, or deleted.

begin isolation level repeatable read;

create temporary table tally_live_context on commit drop as
with selected_member as (
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
  limit 1
), expected as (
  select
    mode.is_training,
    count(distinct item.product_id)::bigint as product_count,
    coalesce(sum(item.quantity), 0)::bigint as units_sold,
    count(distinct (sale.id, item.product_id)) filter (
      where item.product_id is not null
    )::bigint as product_order_count
  from selected_member as member
  cross join (values (false), (true)) as mode(is_training)
  left join public.pos_sales as sale
    on sale.business_id = member.business_id
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
  group by mode.is_training
)
select member.business_id, member.user_id,
       coalesce(max(expected.product_count)
         filter (where not expected.is_training), 0)::bigint
         as live_product_count,
       coalesce(max(expected.units_sold)
         filter (where not expected.is_training), 0)::bigint
         as live_units_sold,
       coalesce(max(expected.product_order_count)
         filter (where not expected.is_training), 0)::bigint
         as live_product_order_count,
       coalesce(max(expected.product_count)
         filter (where expected.is_training), 0)::bigint
         as training_product_count,
       coalesce(max(expected.units_sold)
         filter (where expected.is_training), 0)::bigint
         as training_units_sold,
       coalesce(max(expected.product_order_count)
         filter (where expected.is_training), 0)::bigint
         as training_product_order_count
from selected_member as member
cross join expected
group by member.business_id, member.user_id;

do $$
begin
  if (select count(*) from tally_live_context) <> 1 then
    raise exception 'No active owner with completed sales is available for the live tally smoke test.';
  end if;
end;
$$;

grant select on table tally_live_context to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from tally_live_context),
  true
);

do $$
declare
  v_context record;
  v_product_count bigint;
  v_units_sold bigint;
  v_product_order_count bigint;
begin
  select * into strict v_context from tally_live_context;

  select count(*)::bigint,
         coalesce(sum(tally.units_sold), 0)::bigint,
         coalesce(sum(tally.order_count), 0)::bigint
    into v_product_count, v_units_sold, v_product_order_count
  from public.pos_get_sales_product_tally(
    v_context.business_id, false
  ) as tally;

  if v_product_count is distinct from v_context.live_product_count
    or v_units_sold is distinct from v_context.live_units_sold
    or v_product_order_count is distinct from v_context.live_product_order_count then
    raise exception 'Live product tally differs from the immutable ledger: rows %, units %, orders %.',
      v_product_count, v_units_sold, v_product_order_count;
  end if;

  if exists (
    select 1
    from public.pos_get_sales_product_tally(
      v_context.business_id, false
    ) as tally
    where nullif(pg_catalog.btrim(tally.item_name), '') is null
      or tally.order_count <= 0
      or tally.units_sold <= 0
  ) then
    raise exception 'Live product tally returned a blank label or nonpositive count.';
  end if;

  select count(*)::bigint,
         coalesce(sum(tally.units_sold), 0)::bigint,
         coalesce(sum(tally.order_count), 0)::bigint
    into v_product_count, v_units_sold, v_product_order_count
  from public.pos_get_sales_product_tally(
    v_context.business_id, true
  ) as tally;

  if v_product_count is distinct from v_context.training_product_count
    or v_units_sold is distinct from v_context.training_units_sold
    or v_product_order_count is distinct from v_context.training_product_order_count then
    raise exception 'Training product tally differs from the immutable ledger: rows %, units %, orders %.',
      v_product_count, v_units_sold, v_product_order_count;
  end if;
end;
$$;

reset role;
select 'PASS: POS sales-product tally live access checks' as result;
rollback;
