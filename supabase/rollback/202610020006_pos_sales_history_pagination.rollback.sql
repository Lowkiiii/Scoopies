-- POS sales-history pagination rollback.
--
-- This removes only derived read APIs and their supporting index. Completed
-- receipts and every other Phase 1-5 record remain untouched.

begin;

-- Refuse to erase a later release or hotfix. The metadata row is locked so a
-- concurrent migration cannot advance it between this check and the drops.
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

  if v_version is distinct from 6
    or v_name is distinct from 'pos_sales_history_pagination' then
    raise exception
      'Refusing sales-history rollback: expected schema 6:pos_sales_history_pagination, found %:%.',
      coalesce(v_version::text, '<missing>'), coalesce(v_name, '<missing>');
  end if;
end;
$$;

drop function if exists public.pos_get_sales_history_summary(uuid, boolean);
drop function if exists public.pos_get_sales_history_page(
  uuid, boolean, timestamptz, uuid, integer
);
drop index if exists public.pos_sales_history_cursor_idx;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 5, 'name', 'inventory_phase_1_foundation'),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
