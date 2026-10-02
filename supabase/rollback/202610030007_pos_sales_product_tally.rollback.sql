-- POS all-time product-tally rollback.
--
-- This removes only the derived read API. It never changes completed sales,
-- sale items, payments, events, products, or inventory data.

begin;

-- Refuse to erase a later release or hotfix. Locking the metadata row keeps a
-- concurrent migration from advancing it between this check and the drop.
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

  if v_version is distinct from 7
    or v_name is distinct from 'pos_sales_product_tally' then
    raise exception
      'Refusing product-tally rollback: expected schema 7:pos_sales_product_tally, found %:%.',
      coalesce(v_version::text, '<missing>'), coalesce(v_name, '<missing>');
  end if;
end;
$$;

drop function if exists public.pos_get_sales_product_tally(uuid, boolean);

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 6, 'name', 'pos_sales_history_pagination'),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
