-- Non-destructive schema checks for POS schema 16.
do $$
declare
  v_version integer;
  v_name text;
begin
  select (value ->> 'version')::integer, value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata
  where key = 'schema_version';

  if v_version <> 16 or v_name <> 'pos_archive_drinks_for_republish' then
    raise exception 'Expected schema 16 pos_archive_drinks_for_republish, found %:%.',
      v_version, v_name;
  end if;

  if to_regprocedure('public.pos_archive_product(uuid,uuid)') is null then
    raise exception 'pos_archive_product(uuid,uuid) is missing.';
  end if;

  if not has_function_privilege('authenticated', 'public.pos_archive_product(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.pos_archive_product(uuid,uuid)', 'EXECUTE') then
    raise exception 'pos_archive_product execute grants are incorrect.';
  end if;
end;
$$;
