-- Destructive fixture test for a disposable/local database only.
-- All fixtures are wrapped in a transaction and rolled back.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'cashier@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'outsider@example.test'),
  ('00000000-0000-4000-8000-000000000004', 'second-owner@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

create temporary table phase1_context as
select public.pos_bootstrap_business('Scoopies Test', 'SCP', 'Asia/Manila') as business_id;

select public.pos_add_member_by_email(
  (select business_id from phase1_context),
  'cashier@example.test',
  'cashier',
  'Test Cashier'
);

do $$
declare
  v_business_id uuid := (select business_id from phase1_context);
begin
  begin
    perform public.pos_add_member_by_email(
      v_business_id, 'owner@example.test', 'manager', 'Original Owner'
    );
    raise exception 'The last active owner was demoted.';
  exception
    when sqlstate '55000' then null;
  end;

  if (
    select member.role
    from public.pos_business_members as member
    where member.business_id = v_business_id
      and member.user_id = '00000000-0000-4000-8000-000000000001'
  ) is distinct from 'owner' then
    raise exception 'Rejected last-owner demotion still changed the role.';
  end if;
end;
$$;

select public.pos_add_member_by_email(
  (select business_id from phase1_context),
  'second-owner@example.test',
  'owner',
  'Second Owner'
);

select public.pos_add_member_by_email(
  (select business_id from phase1_context),
  'owner@example.test',
  'manager',
  'Original Owner'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);

select public.pos_add_member_by_email(
  (select business_id from phase1_context),
  'owner@example.test',
  'owner',
  'Original Owner'
);

select public.pos_add_member_by_email(
  (select business_id from phase1_context),
  'second-owner@example.test',
  'manager',
  'Second Owner'
);

do $$
declare
  v_business_id uuid := (select business_id from phase1_context);
begin
  if (
    select member.role
    from public.pos_business_members as member
    where member.business_id = v_business_id
      and member.user_id = '00000000-0000-4000-8000-000000000001'
  ) is distinct from 'owner' then
    raise exception 'The original owner was not restored.';
  end if;

  if (
    select member.role
    from public.pos_business_members as member
    where member.business_id = v_business_id
      and member.user_id = '00000000-0000-4000-8000-000000000004'
  ) is distinct from 'manager' then
    raise exception 'The second owner was not safely demoted.';
  end if;

  begin
    perform public.pos_add_member_by_email(
      v_business_id, 'outsider@example.test', 'manager', 'Unauthorized Manager'
    );
    raise exception 'A manager called the owner-only member function.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);

do $$
declare
  v_business_id uuid := (select business_id from phase1_context);
begin
  begin
    perform public.pos_add_member_by_email(
      v_business_id, 'outsider@example.test', 'owner', 'Unauthorized Owner'
    );
    raise exception 'A cashier called the owner-only member function.';
  exception
    when insufficient_privilege then null;
  end;

  if exists (
    select 1
    from public.pos_business_members as member
    where member.business_id = v_business_id
      and member.user_id = '00000000-0000-4000-8000-000000000003'
  ) then
    raise exception 'Denied member change still modified membership.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

do $$
begin
  if (select count(*) from public.pos_businesses) <> 1 then
    raise exception 'Owner could not read the bootstrapped business.';
  end if;

  begin
    execute format(
      'insert into public.pos_sales (business_id) values (%L)',
      (select business_id from phase1_context)
    );
    raise exception 'Authenticated browser role inserted a sale directly.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.pos_allocate_receipt(
      (select business_id from phase1_context), false, now()
    );
    raise exception 'Browser role called the internal receipt allocator.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
#variable_conflict use_variable
declare
  business_id uuid := (select context.business_id from phase1_context as context);
  owner_id uuid := '00000000-0000-4000-8000-000000000001';
  register_id uuid;
  shift_id uuid := gen_random_uuid();
  category_id uuid := gen_random_uuid();
  product_id uuid := gen_random_uuid();
  version_id uuid := gen_random_uuid();
  sale_id uuid := gen_random_uuid();
  payment_id uuid := gen_random_uuid();
  receipt record;
  second_receipt record;
  training_receipt record;
  overflow_receipt record;
  line_total bigint;
  line_cost bigint;
begin
  select register.id into strict register_id
  from public.pos_registers as register
  where register.business_id = business_id;

  insert into public.pos_categories (
    id, business_id, name, created_by
  ) values (
    category_id, business_id, 'Matcha', owner_id
  );

  insert into public.pos_products (
    id, business_id, source_costing_product_id, category_id, name, created_by
  ) values (
    product_id, business_id, 'costing-matcha-12oz', category_id,
    'Matcha Latte 12oz', owner_id
  );

  insert into public.pos_product_versions (
    id, business_id, product_id, version_number, name_snapshot, size_snapshot,
    selling_price_centavos, ingredient_cost_centavos, packaging_cost_centavos,
    source_costing_hash, costing_snapshot, published_by
  ) values (
    version_id, business_id, product_id, 1, 'Matcha Latte 12oz', '12oz',
    17000, 6242, 1555, 'fixture-hash-v1', jsonb_build_object('source', 'fixture'), owner_id
  );

  update public.pos_products
  set active_version_id = version_id
  where id = product_id;

  insert into public.pos_shifts (
    id, business_id, register_id, is_training, opening_cash_centavos, opened_by
  ) values (
    shift_id, business_id, register_id, false, 200000, owner_id
  );

  select * into strict receipt
  from public.pos_allocate_receipt(business_id, false, timestamptz '2026-10-04 01:00:00+00');

  select * into strict second_receipt
  from public.pos_allocate_receipt(business_id, false, timestamptz '2026-10-04 01:01:00+00');

  select * into strict training_receipt
  from public.pos_allocate_receipt(business_id, true, timestamptz '2026-10-04 01:02:00+00');

  if receipt.receipt_sequence <> 1 or second_receipt.receipt_sequence <> 2 then
    raise exception 'Real receipt sequence is not sequential.';
  end if;

  if receipt.receipt_number <> 'SCP-20261004-0001'
    or training_receipt.receipt_number <> 'TRN-20261004-0001' then
    raise exception 'Receipt formatting or training isolation is incorrect.';
  end if;

  update public.pos_receipt_counters as counter
  set last_number = 9999
  where counter.business_id = business_id
    and counter.business_date = date '2026-10-04'
    and counter.is_training = false;

  if not found then
    raise exception 'Could not prepare the five-digit receipt fixture.';
  end if;

  select * into strict overflow_receipt
  from public.pos_allocate_receipt(business_id, false, timestamptz '2026-10-04 01:03:00+00');

  if overflow_receipt.receipt_sequence <> 10000
    or overflow_receipt.receipt_number <> 'SCP-20261004-10000' then
    raise exception 'Five-digit receipt was truncated: %', overflow_receipt.receipt_number;
  end if;

  begin
    insert into public.pos_sales (
      business_id, shift_id, client_sale_id, request_fingerprint, status,
      is_training, business_date, receipt_sequence, receipt_number,
      cashier_id, completed_at
    ) values (
      business_id, shift_id, gen_random_uuid(), repeat('b', 64), 'completed',
      false, overflow_receipt.business_date, overflow_receipt.receipt_sequence,
      overflow_receipt.receipt_number, owner_id, now()
    );
    raise exception 'A sale bypassed the required open state.';
  exception
    when sqlstate '55000' then null;
  end;

  insert into public.pos_sales (
    id, business_id, shift_id, client_sale_id, request_fingerprint,
    is_training, cashier_id
  ) values (
    sale_id, business_id, shift_id, gen_random_uuid(), repeat('a', 64),
    false, owner_id
  );

  insert into public.pos_sale_items (
    business_id, sale_id, line_number, product_id, product_version_id,
    name_snapshot, size_snapshot, quantity, unit_price_centavos,
    ingredient_unit_cost_centavos, packaging_unit_cost_centavos,
    line_discount_centavos
  ) values (
    business_id, sale_id, 1, product_id, version_id,
    'Matcha Latte 12oz', '12oz', 2, 17000, 6242, 1555, 500
  ) returning line_total_centavos, estimated_line_cost_centavos
    into line_total, line_cost;

  if line_total <> 33500 or line_cost <> 15594 then
    raise exception 'Centavo line calculations were not exact.';
  end if;

  insert into public.pos_payments (
    id, business_id, sale_id, method, amount_centavos,
    cash_tendered_centavos, change_given_centavos, confirmed_by
  ) values (
    payment_id, business_id, sale_id, 'cash', 33000, 40000, 7000, owner_id
  );

  begin
    update public.pos_sales
    set status = 'completed',
        business_date = receipt.business_date,
        receipt_sequence = receipt.receipt_sequence,
        receipt_number = receipt.receipt_number
    where id = sale_id;
    raise exception 'A sale completed with an underpayment.';
  exception
    when check_violation then null;
  end;

  if (select sale.status from public.pos_sales as sale where sale.id = sale_id) <> 'open' then
    raise exception 'Rejected underpayment did not leave the sale open.';
  end if;

  insert into public.pos_payments (
    business_id, sale_id, payment_number, method, amount_centavos,
    reference_number, confirmed_by
  ) values (
    business_id, sale_id, 2, 'gcash', 500, 'GCASH-FIXTURE-1', owner_id
  );

  begin
    update public.pos_sales
    set status = 'completed',
        business_date = receipt.business_date,
        receipt_sequence = receipt.receipt_sequence,
        receipt_number = receipt.receipt_number,
        subtotal_centavos = 35000,
        discount_centavos = 1500,
        total_centavos = 33500,
        estimated_cost_centavos = 15594
    where id = sale_id;
    raise exception 'A sale completed with mismatched header totals.';
  exception
    when sqlstate '55000' then null;
  end;

  update public.pos_sales
  set status = 'completed',
      business_date = receipt.business_date,
      receipt_sequence = receipt.receipt_sequence,
      receipt_number = receipt.receipt_number
  where id = sale_id;

  if not exists (
    select 1
    from public.pos_sales as sale
    where sale.id = sale_id
      and sale.status = 'completed'
      and sale.subtotal_centavos = 34000
      and sale.discount_centavos = 500
      and sale.total_centavos = 33500
      and sale.estimated_cost_centavos = 15594
      and sale.completed_at is not null
  ) then
    raise exception 'Valid sale completion did not derive exact header totals.';
  end if;

  insert into public.pos_sale_events (
    business_id, sale_id, event_type, amount_centavos, retain_cost, acted_by
  ) values (
    business_id, sale_id, 'completed', 0, true, owner_id
  );

  begin
    insert into public.pos_sale_items (
      business_id, sale_id, line_number, product_id, product_version_id,
      name_snapshot, size_snapshot, quantity, unit_price_centavos,
      ingredient_unit_cost_centavos, packaging_unit_cost_centavos,
      line_discount_centavos
    ) values (
      business_id, sale_id, 2, product_id, version_id,
      'Late injected item', '12oz', 1, 17000, 6242, 1555, 0
    );
    raise exception 'An item was appended to a completed sale.';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    insert into public.pos_payments (
      business_id, sale_id, payment_number, method, amount_centavos,
      reference_number, confirmed_by
    ) values (
      business_id, sale_id, 3, 'gotyme', 1, 'LATE-PAYMENT', owner_id
    );
    raise exception 'A payment was appended to a completed sale.';
  exception
    when sqlstate '55000' then null;
  end;

  if (select count(*) from public.pos_sale_items as item where item.sale_id = sale_id) <> 1 then
    raise exception 'Completed sale item count changed.';
  end if;

  if (select count(*) from public.pos_payments as payment where payment.sale_id = sale_id) <> 2 then
    raise exception 'Completed sale payment count changed.';
  end if;

  begin
    update public.pos_product_versions
    set selling_price_centavos = 18000
    where id = version_id;
    raise exception 'Published product version was mutable.';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    update public.pos_sales
    set total_centavos = 1
    where id = sale_id;
    raise exception 'Completed sale was mutable.';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    delete from public.pos_payments where id = payment_id;
    raise exception 'Confirmed payment was deletable.';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    insert into public.pos_shifts (
      business_id, register_id, is_training, opening_cash_centavos, opened_by
    ) values (
      business_id, register_id, true, 0, owner_id
    );
    raise exception 'A register accepted two open shifts.';
  exception
    when unique_violation then null;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);

do $$
begin
  if exists (select 1 from public.pos_businesses) then
    raise exception 'Non-member could read another business.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);

do $$
begin
  if not exists (select 1 from public.pos_products) then
    raise exception 'Cashier could not read the sellable product identity.';
  end if;
  if exists (select 1 from public.pos_product_versions) then
    raise exception 'Cashier could read protected cost-bearing product versions.';
  end if;
  if exists (select 1 from public.pos_shifts) then
    raise exception 'Cashier could read protected shift reconciliation.';
  end if;
end;
$$;

reset role;

select 'PASS: POS Phase 1 behavior checks' as result;

rollback;
