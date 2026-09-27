# POS Phase 1 — database foundation

Phase 1 is deliberately invisible in the current web app. It adds the safe
relational foundation for the future POS without modifying the existing costing
document, login screen, navigation, or default page.

## What this phase establishes

- Business membership with `owner`, `manager`, and `cashier` roles
- Pop-up events, registers, and real/training shifts
- Stable POS products linked to existing string costing-product IDs
- Immutable published price and estimated-cost versions
- Integer-centavo sale, item, and payment records
- Separate Cash, GCash, and GoTyme payment facts
- Append-only void/refund/waste/correction events
- Event expenses and cash drawer movements
- Concurrency-safe real and training receipt sequences
- Database-enforced open-to-completed checkout finalization
- Protection against demoting the last active owner
- Row Level Security on every POS table
- No direct browser writes to financial or published-version tables

The existing `public.scoopies_state` and `public.scoopies_activity` objects are
not altered by the migration.

## Before applying it to Supabase

1. In the current app, open **Backup** and export the costing JSON.
2. In Supabase SQL Editor, record the existing costing-row fingerprint:

```sql
select
  id,
  updated_at,
  pg_column_size(data) as data_bytes,
  md5(data::text) as data_checksum
from public.scoopies_state
where id = 'main';
```

3. Keep that JSON file and query result outside the browser/device being used
   for the migration.
4. Apply `supabase/migrations/202609270001_pos_phase_1_foundation.sql`.
5. Run `supabase/tests/pos_phase_1_schema_checks.sql`.
6. Rerun the fingerprint query. Its checksum and byte count must be unchanged.

The browser publishable key cannot apply this migration. It must be run by a
Supabase project owner through SQL Editor or by an authenticated Supabase CLI.
Never place a database password or service-role key in this repository.

## Local disposable validation

The migration can be tested against an empty local PostgreSQL database:

```powershell
psql $env:SCOOPIES_TEST_DATABASE_URL --set ON_ERROR_STOP=1 `
  -f supabase/tests/local_supabase_auth_stub.sql
psql $env:SCOOPIES_TEST_DATABASE_URL --set ON_ERROR_STOP=1 `
  -f supabase/migrations/202609270001_pos_phase_1_foundation.sql
psql $env:SCOOPIES_TEST_DATABASE_URL --set ON_ERROR_STOP=1 `
  -f supabase/tests/pos_phase_1_schema_checks.sql
psql $env:SCOOPIES_TEST_DATABASE_URL --set ON_ERROR_STOP=1 `
  -f supabase/tests/pos_phase_1_behavior_checks.sql
```

The auth stub is only for plain PostgreSQL and must never be run in Supabase.
The behavior test creates fixtures inside a transaction and rolls them back.
It covers owner succession, role denial, exact centavo math, payment equality,
database-derived sale totals, rejection of late items/payments, and receipt
sequence 10,000 without truncation.

After applying the migration, run
`supabase/tests/pos_phase_1_live_access_checks.sql` through an authenticated
project-owner connection. It uses two existing auth accounts, performs its
role checks inside a transaction, and rolls back all temporary business data.

These local checks validate PostgreSQL behavior, not Supabase's full HTTP/JWT
stack. Before any POS screen is used for real orders, repeat the access matrix
against the live project with real anonymous, non-member, cashier, manager, and
owner sessions. Confirm that:

- anonymous users cannot read POS tables or execute POS functions;
- a signed-in non-member sees no business records;
- cashiers see only the catalog/register information intended for checkout;
- cashiers cannot see costs, sales ledgers, payment records, or shift
  reconciliation;
- only owners can manage membership;
- `pos_allocate_receipt` is not remotely executable; and
- public sign-ups are disabled in Supabase Authentication.

The current legacy `scoopies_state` policy permits every authenticated account
to read and update the shared costing document. Do not invite additional staff
accounts until that legacy policy is replaced with a membership-scoped policy
in a later, separately tested migration.

## Security boundary

Authenticated users are not automatically members of Scoopie's. The first
owner creates one isolated business by calling `pos_bootstrap_business`; an
owner can then add an already-existing Supabase Auth account by exact email with
`pos_add_member_by_email`.

Cashiers can read basic product identities, events, and register names. They
cannot read shift reconciliation, the cost-bearing publication table, or the
base financial tables. Later POS phases will expose narrow cashier-safe RPCs
that return only the fields needed to sell and look up recent orders.

All financial mutations will happen through purpose-built database functions.
The browser never supplies trusted prices, costs, totals, receipt numbers,
actor IDs, or training status.

## Money, time, and training conventions

- PHP amounts are `bigint` centavos: `₱170.00` is stored as `17000`.
- Timestamps are `timestamptz`; reporting dates use the business timezone,
  initially `Asia/Manila`.
- Training mode belongs to a shift and is inherited by its sales.
- Real receipts use the business prefix, such as `SCP-20261004-0001`.
- Training receipts use a separate sequence, such as `TRN-20261004-0001`.
- `TRN` is reserved and cannot be used as the real receipt prefix.
- Receipt sequence padding has a minimum width of four and does not truncate
  sequence 10,000 or higher.
- Starting cash is not revenue.
- Cash tendered and change are audit fields; revenue is the amount applied.
- A prepared-drink refund normally retains its snapshotted cost. A pre-prep
  void can explicitly mark that cost as not consumed.

## Rollback boundary

`supabase/rollback/202609270001_pos_phase_1_foundation.rollback.sql` exists only
for validation before real sales. Once genuine POS records exist, do not remove
these tables; use a new forward migration.

## Phase 1 completion gate

- Existing costing JSON exported and fingerprinted
- Migration succeeds in a disposable database
- Schema and behavior checks pass
- Anonymous and non-member access fails safely
- Direct browser financial writes are denied
- Sales start open, complete only with exact item/payment totals, and then
  reject all header, item, and payment mutation
- Published versions and completed financial records resist mutation
- At least one active owner remains after every membership role change
- Centavo calculations and Manila date boundaries are exact
- Real and training receipt sequences stay separate
- Existing costing browser tests still report `PASS 58 tests`
- Existing costing fingerprint is unchanged after live application
- Live Supabase HTTP/JWT access matrix passes before real POS use
