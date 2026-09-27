-- Validation-only rollback for POS Phase 2.
-- Do not use after a real product has been published.

begin;

do $$
begin
  if exists (select 1 from public.pos_product_versions) then
    raise exception 'Phase 2 rollback refused: published product versions exist.'
      using errcode = '55000';
  end if;
end;
$$;

drop function if exists public.pos_set_product_availability(uuid, uuid, boolean);
drop function if exists public.pos_publish_costing_product(
  uuid, text, text, text, bigint, bigint, bigint, jsonb, text, text, uuid
);
drop function if exists public.pos_get_catalog(uuid);
drop function if exists public.pos_get_publication_status(uuid);
drop function if exists public.pos_get_my_businesses();
drop function if exists public.pos_costing_publication_hash(
  text, text, text, bigint, bigint, bigint, jsonb, text
);
drop function if exists public.pos_costing_publication_payload(
  text, text, text, bigint, bigint, bigint, jsonb, text
);

drop index if exists public.pos_product_versions_product_hash_idx;

alter table public.pos_product_versions
  drop constraint if exists pos_product_versions_snapshot_size_valid,
  drop constraint if exists pos_product_versions_hash_valid,
  drop constraint if exists pos_product_versions_size_valid,
  drop constraint if exists pos_product_versions_recipe_id_valid;

alter table public.pos_products
  drop constraint if exists pos_products_source_costing_id_valid;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 1, 'name', 'pos_phase_1_foundation'),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
