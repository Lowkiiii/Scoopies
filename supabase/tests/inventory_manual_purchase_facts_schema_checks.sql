-- Non-destructive schema checks for inventory schema 15.

do $$
declare
  v_version integer;
  v_name text;
  v_sync_definition text;
begin
  select (value ->> 'version')::integer, value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata where key = 'schema_version';
  if v_version <> 15 or v_name <> 'inventory_manual_purchase_facts' then
    raise exception 'Expected schema 15 inventory_manual_purchase_facts, found %:%.',
      v_version, v_name;
  end if;

  if to_regprocedure(
    'public.pos_inventory_sync_spreadsheet_sources(uuid)'
  ) is null then
    raise exception 'Spreadsheet source synchronization RPC is missing.';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.pos_inventory_sync_spreadsheet_sources(uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.pos_inventory_sync_spreadsheet_sources(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Spreadsheet source synchronization RPC grants are wrong.';
  end if;

  select pg_get_functiondef(
    'public.pos_inventory_sync_spreadsheet_sources(uuid)'::regprocedure
  ) into v_sync_definition;
  if v_sync_definition ~* 'purchase_quantity_base|purchase_price_centavos|amountPerItem|purchaseQty|batchYield' then
    raise exception 'Source synchronization still reads or writes Costing purchase facts.';
  end if;
end;
$$;
