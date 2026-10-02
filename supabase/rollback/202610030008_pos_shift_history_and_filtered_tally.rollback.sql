-- Filtered product-tally and closed-shift history rollback.
--
-- Only the derived read APIs and their supporting index are removed. No
-- completed sale, item, payment, reversal, or shift reconciliation is changed.

begin;

-- Refuse to erase a later release or hotfix. Lock the metadata row so another
-- migration cannot advance it between the version check and the drops.
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

  if v_version is distinct from 8
    or v_name is distinct from 'pos_shift_history_and_filtered_tally' then
    raise exception
      'Refusing shift-history rollback: expected schema 8:pos_shift_history_and_filtered_tally, found %:%.',
      coalesce(v_version::text, '<missing>'), coalesce(v_name, '<missing>');
  end if;
end;
$$;

drop function if exists public.pos_get_closed_shifts_page(
  uuid, boolean, date, date, timestamptz, uuid, integer
);
drop function if exists public.pos_get_sales_product_tally_v2(
  uuid, boolean, date, date, uuid
);

drop index if exists public.pos_shifts_history_cursor_idx;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 7, 'name', 'pos_sales_product_tally'),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
