-- Read-only schema 9 structural, privilege, and compatibility checks.

do $$
declare
  v_version integer;
  v_name text;
  v_bucket record;
  v_delete_policy text;
  v_snapshot_constraint text;
  v_result text;
begin
  select (value ->> 'version')::integer, value ->> 'name'
    into v_version, v_name
  from public.pos_system_metadata
  where key = 'schema_version';

  if v_version is distinct from 9
    or v_name is distinct from 'pos_matcha_upgrades_and_product_media' then
    raise exception 'Expected schema 9, found %:%', v_version, v_name;
  end if;

  if to_regclass('public.pos_product_matcha_options') is null then
    raise exception 'Matcha option table is missing.';
  end if;
  if not (select relrowsecurity from pg_class
          where oid = 'public.pos_product_matcha_options'::regclass) then
    raise exception 'Matcha option table does not enforce RLS.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pos_products'
      and column_name = 'image_object_path' and is_nullable = 'YES'
  ) then
    raise exception 'Product image path column is missing.';
  end if;

  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'pos_sale_items'
        and column_name in (
          'matcha_option_id', 'matcha_option_code_snapshot',
          'matcha_option_name_snapshot', 'matcha_option_revision_snapshot',
          'matcha_surcharge_centavos',
          'matcha_ingredient_cost_delta_centavos',
          'base_unit_price_centavos',
          'base_ingredient_unit_cost_centavos'
        )) <> 8 then
    raise exception 'One or more immutable Matcha sale snapshots are missing.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pos_sale_items'::regclass
      and conname = 'pos_sale_items_matcha_option_fk'
      and contype = 'f'
  ) then
    raise exception 'Sale-to-option composite foreign key is missing.';
  end if;
  select pg_get_constraintdef(constraint_row.oid)
    into v_snapshot_constraint
  from pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.pos_sale_items'::regclass
    and constraint_row.conname = 'pos_sale_items_matcha_snapshot_valid';
  if v_snapshot_constraint is null
    or v_snapshot_constraint not ilike '%matcha_option_code_snapshot IS NOT NULL%'
    or v_snapshot_constraint not ilike '%matcha_option_name_snapshot IS NOT NULL%'
    or v_snapshot_constraint not ilike '%matcha_option_revision_snapshot IS NOT NULL%' then
    raise exception 'Matcha sale snapshot constraint permits incomplete upgrade facts.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.pos_sale_items'::regclass
      and tgname = 'pos_sale_items_immutable'
      and not tgisinternal
  ) then
    raise exception 'Sale item append-only protection is missing.';
  end if;

  select bucket.public, bucket.file_size_limit, bucket.allowed_mime_types
    into v_bucket
  from storage.buckets as bucket
  where bucket.id = 'pos-product-images';
  if not found or not v_bucket.public
    or v_bucket.file_size_limit <> 2097152
    or v_bucket.allowed_mime_types is distinct from array['image/webp']::text[] then
    raise exception 'Product image bucket configuration is incorrect.';
  end if;
  if to_regprocedure('storage.allow_any_operation(text[])') is null
    or not has_function_privilege(
      'authenticated',
      'storage.allow_any_operation(text[])',
      'EXECUTE'
    ) then
    raise exception 'Authenticated Storage policy helper support is unavailable.';
  end if;
  if (select value from public.pos_system_metadata
      where key = 'pos_product_images_bucket_owner') is distinct from
      jsonb_build_object('owner', 'pos_schema_9', 'version', 1) then
    raise exception 'Product image bucket ownership marker is missing.';
  end if;

  if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'pos_product_images_manager_insert'
        and cmd = 'INSERT'
    ) or not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'pos_product_images_manager_write_select'
        and cmd = 'SELECT'
    ) or not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'pos_product_images_manager_delete'
        and cmd = 'DELETE'
    ) or exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname like 'pos_product_images_%'
        and cmd = 'UPDATE'
    ) then
    raise exception 'Storage write policy surface is incomplete or permits UPDATE.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'pos_product_images_manager_write_select'
      and qual ilike '%allow_any_operation%'
      and qual ilike '%object.upload%'
      and qual ilike '%object.delete%'
      and qual not ilike '%object.list%'
  ) then
    raise exception 'Storage write SELECT policy permits listing or lacks operation scoping.';
  end if;

  select policy.qual into v_delete_policy
  from pg_policies as policy
  where policy.schemaname = 'storage'
    and policy.tablename = 'objects'
    and policy.policyname = 'pos_product_images_manager_delete';
  if v_delete_policy not ilike '%image_object_path%' then
    raise exception 'Storage DELETE policy does not protect attached product images.';
  end if;

  if has_table_privilege('authenticated', 'public.pos_product_matcha_options', 'INSERT')
    or has_table_privilege('authenticated', 'public.pos_product_matcha_options', 'UPDATE')
    or has_table_privilege('authenticated', 'public.pos_product_matcha_options', 'DELETE')
    or has_table_privilege('authenticated', 'public.pos_products', 'UPDATE') then
    raise exception 'Authenticated browser role has direct catalog mutation privileges.';
  end if;

  if has_function_privilege('anon',
      'public.pos_complete_shift_sale_v3(uuid,uuid,boolean,uuid,jsonb,text,bigint,text,text)',
      'EXECUTE')
    or has_function_privilege('anon', 'public.pos_get_catalog_v2(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.pos_get_product_media(uuid)', 'EXECUTE')
    or has_function_privilege('anon',
      'public.pos_set_product_image(uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'Anonymous role can execute a schema-9 public RPC.';
  end if;

  if not has_function_privilege('authenticated',
      'public.pos_complete_shift_sale_v3(uuid,uuid,boolean,uuid,jsonb,text,bigint,text,text)',
      'EXECUTE')
    or not has_function_privilege('authenticated', 'public.pos_get_catalog_v2(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.pos_get_product_media(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated',
      'public.pos_set_product_image(uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'Authenticated role is missing a schema-9 public RPC.';
  end if;

  if has_function_privilege('authenticated',
      'public._pos_phase4_complete_sale_v3(uuid,uuid,boolean,uuid,jsonb,text,bigint,text,text)',
      'EXECUTE')
    or has_function_privilege('authenticated',
      'public._pos_sale_item_summary(uuid,uuid)', 'EXECUTE') then
    raise exception 'Authenticated role can execute a schema-9 internal helper.';
  end if;

  if not exists (
    select 1 from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'pos_complete_shift_sale_v3', 'pos_get_catalog_v2',
        'pos_get_product_media', 'pos_set_product_image'
      )
      and procedure.prosecdef
      and exists (
        select 1 from unnest(procedure.proconfig) as setting
        where setting like 'search_path=%'
      )
    group by namespace.nspname
    having count(*) = 4
  ) then
    raise exception 'A public schema-9 RPC is not SECURITY DEFINER/search-path safe.';
  end if;

  -- Cached clients must retain both older endpoints and fingerprints.
  if to_regprocedure(
      'public.pos_complete_sale(uuid,uuid,jsonb,text,bigint,text,text)'
    ) is null
    or to_regprocedure(
      'public.pos_complete_shift_sale(uuid,uuid,boolean,uuid,jsonb,text,bigint,text,text)'
    ) is null then
    raise exception 'A cached-client checkout endpoint was removed.';
  end if;
  if pg_get_functiondef(
      'public._pos_phase4_complete_sale(uuid,uuid,boolean,uuid,jsonb,text,bigint,text,text,boolean)'::regprocedure
    ) not like '%checkoutSchemaVersion%case when p_legacy_client then 1 else 2%' then
    raise exception 'Schema-1/2 fingerprint implementation changed.';
  end if;

  select pg_get_function_result(
    'public.pos_get_catalog_v2(uuid)'::regprocedure
  ) into v_result;
  if v_result not ilike '%image_object_path%'
    or v_result not ilike '%matcha_upgrades%' then
    raise exception 'Catalog v2 omits image or Matcha fields: %', v_result;
  end if;

  if pg_get_functiondef(
      'public.pos_get_recent_sales_v2(uuid,boolean,integer)'::regprocedure
    ) not ilike '%_pos_sale_item_summary%'
    or pg_get_functiondef(
      'public.pos_get_sales_history_page(uuid,boolean,timestamp with time zone,uuid,integer)'::regprocedure
    ) not ilike '%_pos_sale_item_summary%' then
    raise exception 'Receipt reports do not render immutable Matcha snapshots.';
  end if;
end;
$$;

select 'PASS: schema 9 Matcha/media structural checks' as result;
