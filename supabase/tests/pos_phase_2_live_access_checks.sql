-- Live Supabase Phase 2 role/RPC smoke test.
--
-- Run only through an authenticated project-owner SQL connection after the
-- Phase 2 migration. It needs two existing auth accounts. Every fixture is in
-- this transaction and the script always rolls back after a successful run.

begin;

do $$
begin
  if (select count(*) from auth.users) < 2 then
    raise exception 'This check needs at least two existing auth accounts.';
  end if;

  if to_regclass('public.scoopies_state') is null
    or not exists (select 1 from public.scoopies_state where id = 'main') then
    raise exception 'The main costing row is required for the checksum invariant.';
  end if;
end;
$$;

create temporary table phase2_live_context (
  owner_id uuid not null,
  owner_email text not null,
  staff_id uuid not null,
  staff_email text not null,
  business_id uuid not null,
  owner_product_id uuid,
  manager_product_id uuid
) on commit drop;

create temporary table phase2_live_costing_before as
select
  count(*)::bigint as row_count,
  md5(string_agg(id || ':' || data::text, '|' order by id)) as checksum,
  sum(pg_column_size(data))::bigint as data_bytes
from public.scoopies_state;

with selected_accounts as (
  select id, email, row_number() over (
    order by last_sign_in_at desc nulls last, created_at, id
  ) as account_number
  from auth.users
), fixture_business as (
  insert into public.pos_businesses (
    name, timezone, currency_code, receipt_prefix, created_by
  )
  select
    'Scoopies Phase 2 Live Test', 'Asia/Manila', 'PHP', 'T2S', owner.id
  from selected_accounts as owner
  where owner.account_number = 1
  returning id, created_by
)
insert into phase2_live_context (
  owner_id, owner_email, staff_id, staff_email, business_id
)
select
  owner.id,
  owner.email,
  staff.id,
  staff.email,
  fixture_business.id
from fixture_business
join selected_accounts as owner
  on owner.id = fixture_business.created_by
join selected_accounts as staff
  on staff.account_number = 2;

insert into public.pos_business_members (
  business_id, user_id, role, display_name
)
select business_id, owner_id, 'owner', 'Phase 2 Test Owner'
from phase2_live_context;

insert into public.pos_registers (business_id, name, created_by)
select business_id, 'Phase 2 Test Register', owner_id
from phase2_live_context;

grant select, update on table phase2_live_context to authenticated;
grant select on table phase2_live_context to anon;

select set_config(
  'request.jwt.claim.sub',
  (select owner_id::text from phase2_live_context),
  true
);
set local role authenticated;

select public.pos_add_member_by_email(
  (select business_id from phase2_live_context),
  (select staff_email from phase2_live_context),
  'manager',
  'Phase 2 Test Manager'
);

with publication as (
  select *
  from public.pos_publish_costing_product(
    (select business_id from phase2_live_context),
    'phase2-live-owner-product',
    'phase2-live-owner-recipe',
    'Owner Test Matcha',
    17000,
    6200,
    1500,
    jsonb_build_object(
      'schemaVersion', 1,
      'sourceProductId', 'phase2-live-owner-product',
      'sourceRecipeId', 'phase2-live-owner-recipe',
      'name', 'Owner Test Matcha',
      'size', '12 oz',
      'sellingPriceCentavos', 17000,
      'ingredientCostCentavos', 6200,
      'packagingCostCentavos', 1500,
      'fixture', 'phase2-live-access'
    ),
    '12 oz',
    'Live Test',
    null
  )
)
update phase2_live_context
set owner_product_id = publication.product_id
from publication;

do $$
declare
  v_business_id uuid := (select business_id from phase2_live_context);
begin
  if not exists (
    select 1
    from public.pos_get_my_businesses() as workspace
    where workspace.business_id = v_business_id
  ) then
    raise exception 'Owner workspace discovery failed.';
  end if;

  if (select count(*) from public.pos_get_publication_status(v_business_id)) <> 1 then
    raise exception 'Owner publication status failed.';
  end if;

  if (select count(*) from public.pos_get_catalog(v_business_id)) <> 1 then
    raise exception 'Owner safe catalog read failed.';
  end if;

  begin
    insert into public.pos_products (
      business_id, source_costing_product_id, name, created_by
    ) values (
      v_business_id, 'forbidden-owner-write', 'Forbidden',
      (select owner_id from phase2_live_context)
    );
    raise exception 'Owner browser role wrote a catalog table directly.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  (select staff_id::text from phase2_live_context),
  true
);
set local role authenticated;

with publication as (
  select *
  from public.pos_publish_costing_product(
    (select business_id from phase2_live_context),
    'phase2-live-manager-product',
    'phase2-live-manager-recipe',
    'Manager Test Matcha',
    18000,
    6800,
    1600,
    jsonb_build_object(
      'schemaVersion', 1,
      'sourceProductId', 'phase2-live-manager-product',
      'sourceRecipeId', 'phase2-live-manager-recipe',
      'name', 'Manager Test Matcha',
      'size', '16 oz',
      'sellingPriceCentavos', 18000,
      'ingredientCostCentavos', 6800,
      'packagingCostCentavos', 1600,
      'fixture', 'phase2-live-access'
    ),
    '16 oz',
    'Live Test',
    null
  )
)
update phase2_live_context
set manager_product_id = publication.product_id
from publication;

do $$
begin
  if (select count(*) from public.pos_get_publication_status(
      (select business_id from phase2_live_context)
    )) <> 2 then
    raise exception 'Manager publication or status access failed.';
  end if;
end;
$$;

reset role;

update public.pos_business_members as member
set role = 'cashier', updated_at = now()
where member.business_id = (select business_id from phase2_live_context)
  and member.user_id = (select staff_id from phase2_live_context);

select set_config(
  'request.jwt.claim.sub',
  (select staff_id::text from phase2_live_context),
  true
);
set local role authenticated;

do $$
declare
  v_business_id uuid := (select business_id from phase2_live_context);
begin
  if (select count(*) from public.pos_get_catalog(v_business_id)) <> 2 then
    raise exception 'Cashier could not read the safe catalog.';
  end if;

  if exists (select 1 from public.pos_product_versions) then
    raise exception 'Cashier could directly read cost-bearing product versions.';
  end if;

  begin
    perform public.pos_get_publication_status(v_business_id);
    raise exception 'Cashier called the cost-bearing publication-status RPC.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.pos_publish_costing_product(
      v_business_id,
      'forbidden-cashier-product', 'forbidden-cashier-recipe', 'Forbidden',
      10000, 1000, 1000,
      jsonb_build_object(
        'schemaVersion', 1,
        'sourceProductId', 'forbidden-cashier-product',
        'sourceRecipeId', 'forbidden-cashier-recipe',
        'name', 'Forbidden',
        'size', null,
        'sellingPriceCentavos', 10000,
        'ingredientCostCentavos', 1000,
        'packagingCostCentavos', 1000
      ),
      null, null, null
    );
    raise exception 'Cashier published a product.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', true);
set local role authenticated;

do $$
begin
  if exists (select 1 from public.pos_get_my_businesses()) then
    raise exception 'Authenticated outsider discovered a POS workspace.';
  end if;

  begin
    perform public.pos_get_catalog((select business_id from phase2_live_context));
    raise exception 'Authenticated outsider read another business catalog.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;

do $$
begin
  begin
    perform public.pos_get_catalog((select business_id from phase2_live_context));
    raise exception 'Anonymous role executed the catalog RPC.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.pos_get_my_businesses();
    raise exception 'Anonymous role executed workspace discovery.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
declare
  v_before record;
  v_after record;
begin
  select * into strict v_before from phase2_live_costing_before;

  select
    count(*)::bigint as row_count,
    md5(string_agg(id || ':' || data::text, '|' order by id)) as checksum,
    sum(pg_column_size(data))::bigint as data_bytes
    into v_after
  from public.scoopies_state;

  if v_after.row_count is distinct from v_before.row_count
    or v_after.checksum is distinct from v_before.checksum
    or v_after.data_bytes is distinct from v_before.data_bytes then
    raise exception 'The costing document changed during Phase 2 live checks.';
  end if;
end;
$$;

select 'PASS: POS Phase 2 live access checks' as result;

rollback;
