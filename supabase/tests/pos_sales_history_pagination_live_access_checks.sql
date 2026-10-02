-- Read-only production smoke test for the v6 history APIs. No ledger rows are
-- inserted, updated, or deleted; the temporary context disappears on rollback.

begin isolation level repeatable read;

create temporary table history_live_context on commit drop as
select member.business_id,
       member.user_id,
       (
         select count(*)::integer
         from public.pos_sales as sale
         where sale.business_id = member.business_id
           and sale.status = 'completed'
           and sale.is_training = false
       ) as live_count,
       (
         select count(*)::integer
         from public.pos_sales as sale
         where sale.business_id = member.business_id
           and sale.status = 'completed'
           and sale.is_training = true
       ) as training_count
from public.pos_business_members as member
where member.active = true
  and member.role = 'owner'
  and exists (
    select 1
    from public.pos_sales as sale
    where sale.business_id = member.business_id
      and sale.status = 'completed'
  )
order by live_count desc, training_count desc, member.business_id
limit 1;

do $$
begin
  if (select count(*) from history_live_context) <> 1 then
    raise exception 'No active owner with completed sales is available for the live history smoke test.';
  end if;
end;
$$;

grant select on table history_live_context to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from history_live_context),
  true
);

do $$
declare
  v_business_id uuid;
  v_live_count integer;
  v_training_count integer;
  v_summary_count bigint;
  v_can_view_costs boolean;
  v_page_count integer;
  v_distinct_count integer;
  v_all_has_more boolean;
  v_any_has_more boolean;
  v_cursor_time timestamptz;
  v_cursor_id uuid;
  v_older_count integer;
begin
  select context.business_id, context.live_count, context.training_count
    into v_business_id, v_live_count, v_training_count
  from history_live_context as context;

  select summary.gross_sale_count, summary.can_view_costs
    into v_summary_count, v_can_view_costs
  from public.pos_get_sales_history_summary(v_business_id, false) as summary;

  if v_summary_count is distinct from v_live_count
    or v_can_view_costs is distinct from true then
    raise exception 'Live history summary count or owner cost access differs from the ledger.';
  end if;

  select summary.gross_sale_count
    into v_summary_count
  from public.pos_get_sales_history_summary(v_business_id, true) as summary;

  if v_summary_count is distinct from v_training_count then
    raise exception 'Training history summary count differs from the ledger.';
  end if;

  select count(*)::integer,
         count(distinct page.sale_id)::integer,
         coalesce(bool_and(page.has_more), false),
         coalesce(bool_or(page.has_more), false)
    into v_page_count, v_distinct_count, v_all_has_more, v_any_has_more
  from public.pos_get_sales_history_page(
    v_business_id, false, null, null, 20
  ) as page;

  if v_page_count <> least(v_live_count, 20)
    or v_distinct_count <> v_page_count
    or v_all_has_more is distinct from (v_live_count > 20)
    or v_any_has_more is distinct from (v_live_count > 20) then
    raise exception 'First live history page count, uniqueness, or has-more flag is wrong.';
  end if;

  if v_live_count > 20 then
    select page.completed_at, page.sale_id
      into v_cursor_time, v_cursor_id
    from public.pos_get_sales_history_page(
      v_business_id, false, null, null, 20
    ) as page
    order by page.completed_at, page.sale_id
    limit 1;

    select count(*)::integer
      into v_older_count
    from public.pos_get_sales_history_page(
      v_business_id, false, v_cursor_time, v_cursor_id, 20
    );

    if v_older_count <> least(v_live_count - 20, 20) then
      raise exception 'The first older-sales cursor page has the wrong count.';
    end if;
  end if;
end;
$$;

reset role;
select 'PASS: POS sales-history live access checks' as result;
rollback;
