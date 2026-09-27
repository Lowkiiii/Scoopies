-- Live Supabase role/RLS smoke test.
--
-- Safe only after the Phase 1 migration and when at least two auth accounts
-- already exist. All temporary membership and business changes are rolled back.

begin;

do $$
begin
  if (select count(*) from auth.users) < 2 then
    raise exception 'This check needs at least two existing auth accounts.';
  end if;
end;
$$;

create temporary table phase1_live_context (
  owner_id uuid not null,
  owner_email text not null,
  cashier_id uuid not null,
  cashier_email text not null,
  business_id uuid
) on commit drop;

insert into phase1_live_context (owner_id, owner_email, cashier_id, cashier_email)
select
  owner_account.id,
  owner_account.email,
  cashier_account.id,
  cashier_account.email
from (
  select id, email
  from auth.users
  order by last_sign_in_at desc nulls last, created_at, id
  limit 1
) as owner_account
cross join (
  select id, email
  from auth.users
  order by last_sign_in_at desc nulls last, created_at, id
  offset 1
  limit 1
) as cashier_account;

grant select, update on table phase1_live_context to authenticated;

select set_config(
  'request.jwt.claim.sub',
  (select owner_id::text from phase1_live_context),
  true
);

set local role authenticated;

update phase1_live_context
set business_id = public.pos_bootstrap_business(
  'Scoopies Phase 1 Live Test',
  'TST',
  'Asia/Manila'
);

select public.pos_add_member_by_email(
  (select business_id from phase1_live_context),
  (select cashier_email from phase1_live_context),
  'cashier',
  'Phase 1 Test Cashier'
);

do $$
begin
  if (select count(*) from public.pos_businesses) <> 1 then
    raise exception 'Owner could not read the test business.';
  end if;

  begin
    execute format(
      'insert into public.pos_sales (business_id) values (%L)',
      (select business_id from phase1_live_context)
    );
    raise exception 'Owner browser role inserted a sale directly.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.pos_allocate_receipt(
      (select business_id from phase1_live_context),
      false,
      now()
    );
    raise exception 'Owner browser role called the internal receipt allocator.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select set_config(
  'request.jwt.claim.sub',
  (select cashier_id::text from phase1_live_context),
  true
);

set local role authenticated;

do $$
begin
  if (select count(*) from public.pos_businesses) <> 1 then
    raise exception 'Cashier could not read the test business identity.';
  end if;

  if exists (select 1 from public.pos_shifts) then
    raise exception 'Cashier could read protected shift reconciliation.';
  end if;

  if exists (select 1 from public.pos_product_versions) then
    raise exception 'Cashier could read protected cost-bearing versions.';
  end if;

  begin
    perform public.pos_add_member_by_email(
      (select business_id from phase1_live_context),
      (select owner_email from phase1_live_context),
      'owner',
      'Unauthorized Change'
    );
    raise exception 'Cashier called the owner-only member function.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select set_config(
  'request.jwt.claim.sub',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  true
);

set local role authenticated;

do $$
begin
  if exists (select 1 from public.pos_businesses) then
    raise exception 'Authenticated non-member could read a POS business.';
  end if;
end;
$$;

reset role;
set local role anon;

do $$
begin
  begin
    perform 1 from public.pos_sales limit 1;
    raise exception 'Anonymous role read the POS sales table.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select 'PASS: POS Phase 1 live access checks' as result;

rollback;
