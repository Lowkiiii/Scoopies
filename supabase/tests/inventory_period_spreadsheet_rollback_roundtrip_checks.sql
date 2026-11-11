-- Schema-13 rollback is allowed only before operational period data exists.
-- Exercise rollback and reapply on the disposable CI database.
\set ON_ERROR_STOP on

\ir ../rollback/202611110013_inventory_period_spreadsheet.rollback.sql

do $$
begin
  if not exists (
    select 1 from public.pos_system_metadata
    where key = 'schema_version'
      and (value ->> 'version')::integer = 12
      and value ->> 'name' = 'inventory_phase_2b_category'
  ) then
    raise exception 'Schema-13 rollback did not restore schema 12 metadata.';
  end if;
  if to_regclass('public.pos_inventory_periods') is not null
    or to_regprocedure('public.pos_inventory_get_spreadsheet(uuid,uuid)') is not null
    or exists (
      select 1 from pg_trigger
      where tgrelid = 'public.pos_inventory_items'::regclass
        and tgname = 'pos_inventory_items_fill_source_identity'
        and not tgisinternal
    ) then
    raise exception 'Schema-13 rollback left period objects behind.';
  end if;
end;
$$;

\ir ../migrations/202611110013_inventory_period_spreadsheet.sql

do $$
begin
  if not exists (
    select 1 from public.pos_system_metadata
    where key = 'schema_version'
      and (value ->> 'version')::integer = 13
      and value ->> 'name' = 'inventory_period_spreadsheet'
  ) or to_regclass('public.pos_inventory_periods') is null then
    raise exception 'Schema 13 did not reapply after rollback.';
  end if;
end;
$$;
