-- POS Phase 3 rollback.
--
-- Sales already completed through Phase 3 remain valid immutable Phase 1
-- records. This removes only the checkout/reporting RPC surface.

begin;

drop function if exists public.pos_get_recent_sales(uuid, integer);
drop function if exists public.pos_get_today_summary(uuid);
drop function if exists public.pos_complete_sale(
  uuid, uuid, jsonb, text, bigint, text, text
);

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 2, 'name', 'pos_phase_2_catalog_publication'),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
