-- Matcha Luna POS schema 16: archive menu drinks for a clean re-publish.
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

  if v_version is distinct from 15
    or v_name is distinct from 'inventory_manual_purchase_facts' then
    raise exception
      'Refusing schema-16 migration: expected 15:inventory_manual_purchase_facts, found %:%.',
      coalesce(v_version::text, '<missing>'), coalesce(v_name, '<missing>');
  end if;
end;
$$;

-- Keep every immutable product/version/sale record, while removing this menu
-- item from the active POS and releasing its Pricing source for a fresh publish.
create or replace function public.pos_archive_product(
  p_business_id uuid,
  p_product_id uuid
)
returns table (product_id uuid, archived_at timestamptz)
language plpgsql
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

  select member.role into v_role
  from public.pos_business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.active = true;

  if v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'Only an owner or manager can archive a POS product.'
      using errcode = '42501';
  end if;

  update public.pos_products as product
  set archived_at = clock_timestamp(),
      available = false,
      source_costing_product_id = null
  where product.business_id = p_business_id
    and product.id = p_product_id
    and product.archived_at is null
  returning product.id, product.archived_at into product_id, archived_at;

  if product_id is null then
    raise exception 'Active POS product not found.' using errcode = 'P0002';
  end if;

  return next;
end;
$$;

revoke all on function public.pos_archive_product(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.pos_archive_product(uuid, uuid) to authenticated;

comment on function public.pos_archive_product(uuid, uuid) is
  'Archives one POS product, retains sales history, and releases its Pricing source for fresh publication.';

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 16, 'name', 'pos_archive_drinks_for_republish'),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
