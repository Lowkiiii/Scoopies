-- Scoopie's all-time POS product tally.
--
-- The tally is derived only from immutable completed-sale item snapshots.
-- Products are grouped by their stable product ID so a later publication
-- (for example, adding a 12 oz size label) does not split one drink into two
-- rows. Every whole-receipt financial reversal is removed so this remains a
-- net product-sales tally. Whether an after-preparation refund retains cost or
-- consumes inventory is a separate profit/inventory concern.

begin;

create or replace function public.pos_get_sales_product_tally(
  p_business_id uuid,
  p_is_training boolean
)
returns table (
  item_name text,
  size_label text,
  order_count bigint,
  units_sold bigint
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

  -- Authorize before validating request details so callers cannot use input
  -- errors to probe business membership.
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

  return query
  with eligible_lines as (
    select
      item.product_id,
      item.sale_id,
      item.line_number,
      item.name_snapshot,
      item.size_snapshot,
      item.quantity,
      sale.completed_at
    from public.pos_sales as sale
    join public.pos_sale_items as item
      on item.business_id = sale.business_id
     and item.sale_id = sale.id
    where sale.business_id = p_business_id
      and sale.status = 'completed'
      and sale.is_training = p_is_training
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
    coalesce(
      nullif(pg_catalog.btrim(product.name), ''),
      totals.latest_name_snapshot
    )::text as item_name,
    coalesce(
      nullif(pg_catalog.btrim(active_version.size_snapshot), ''),
      totals.latest_size_snapshot
    )::text as size_label,
    totals.order_count,
    totals.units_sold
  from product_totals as totals
  left join public.pos_products as product
    on product.business_id = p_business_id
   and product.id = totals.product_id
  left join public.pos_product_versions as active_version
    on active_version.business_id = p_business_id
   and active_version.product_id = totals.product_id
   and active_version.id = product.active_version_id
  order by totals.units_sold desc,
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

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 7, 'name', 'pos_sales_product_tally'),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

revoke all on function public.pos_get_sales_product_tally(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.pos_get_sales_product_tally(uuid, boolean)
  to authenticated;

comment on function public.pos_get_sales_product_tally(uuid, boolean) is
  'All-time Live or Training net product-sales tally for active members. Groups immutable sale items by stable product ID, excludes whole-receipt voids and refunds, and exposes no cost data.';

commit;
