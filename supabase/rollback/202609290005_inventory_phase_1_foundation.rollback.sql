-- Inventory Phase 1 rollback.
--
-- This is safe only before any inventory identity exists. Even a zero-balance
-- item or deletion tombstone is durable operational state, so the rollback
-- refuses atomically rather than deleting it.

begin;

-- Every inventory RPC reads membership before its costing/ledger locks, and
-- dropping the inventory foreign keys also locks the member/business parents.
-- Lock those parents up front, then follow source and ledger writer order.
-- This protects both the emptiness check and every later DROP without a
-- reverse-order lock acquisition.
lock table
  public.pos_business_members,
  public.pos_businesses,
  public.scoopies_state,
  public.pos_inventory_transactions,
  public.pos_inventory_items,
  public.pos_inventory_transaction_lines
in access exclusive mode;

do $$
begin
  if to_regclass('public.pos_inventory_items') is not null
    and exists (select 1 from public.pos_inventory_items) then
    raise exception 'Inventory Phase 1 rollback blocked: inventory identities or tombstones exist. Export/reconcile inventory state and migrate it before removing Inventory Phase 1.'
      using errcode = '55000';
  end if;
end;
$$;

drop function if exists public.pos_inventory_record_transaction(
  uuid, uuid, text, jsonb, text, text
);
drop function if exists public.pos_inventory_validate_source_delete(uuid, text);
drop function if exists public.pos_inventory_prepare_source_delete(
  uuid, text, text, text, text
);
drop function if exists public.pos_inventory_prepare_source_change(
  uuid, text, text, text, text
);
drop function if exists public.pos_inventory_set_threshold(
  uuid, uuid, numeric, bigint
);
drop function if exists public.pos_inventory_get_transactions(
  uuid, uuid, integer
);
drop function if exists public.pos_inventory_get_items(uuid, boolean);
drop function if exists public.pos_inventory_sync_items(uuid, jsonb);

drop trigger if exists pos_inventory_transaction_lines_immutable
  on public.pos_inventory_transaction_lines;
drop trigger if exists pos_inventory_transactions_immutable
  on public.pos_inventory_transactions;
drop trigger if exists pos_inventory_items_protected
  on public.pos_inventory_items;
drop trigger if exists pos_inventory_costing_state_guard
  on public.scoopies_state;

drop function if exists public.pos_inventory_guard_costing_state();
drop function if exists public.pos_inventory_protect_item();
drop function if exists public._pos_inventory_balance(uuid, uuid);
drop function if exists public._pos_inventory_to_base(numeric, text);
drop function if exists public._pos_inventory_base_unit(text);

drop table if exists public.pos_inventory_transaction_lines;
drop table if exists public.pos_inventory_transactions;
drop table if exists public.pos_inventory_items;

insert into public.pos_system_metadata (key, value, updated_at)
values (
  'schema_version',
  jsonb_build_object('version', 4, 'name', 'pos_phase_4_operations'),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
