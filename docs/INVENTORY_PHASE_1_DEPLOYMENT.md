# Inventory Phase 1 deployment runbook

This file is the deployment and verification checklist for migration
`202609290005_inventory_phase_1_foundation.sql`. Do not mark it complete
until the linked Supabase migration, live RPC checks, application commit, and
GitHub Pages deployment all refer to the same release.

## Before deployment

1. Stop inventory writes in every browser tab.
2. Export the existing costing document and POS tables.
3. Record counts and checksums for `scoopies_state` and all existing
   `pos_*` tables.
4. Confirm the linked migration history contains exactly the expected POS
   migrations through `202609280004`.
5. Run all migrations through inventory Phase 1 on a fresh PostgreSQL 17
   database.
6. Run the inventory schema and behavior suites.
7. Run `inventory_phase_1_concurrency_checks.sql` only in a disposable
   database named `inventory_concurrency*`.

## Apply

Use the normal linked Supabase migration workflow. Do not paste only selected
statements into the SQL editor: the tables, RLS policies, grants, functions,
triggers, and schema metadata are one contract.

After the migration commits, verify:

- `pos_system_metadata.schema_version` is version 5 with name
  `inventory_phase_1_foundation`;
- all three inventory tables have RLS enabled;
- anonymous users cannot execute any inventory RPC;
- authenticated members cannot directly select, insert, update, or delete
  inventory tables; and
- `scoopies_state` grants authenticated only SELECT/INSERT/UPDATE, denies its
  DELETE/TRUNCATE/TRIGGER/REFERENCES privileges, and grants anon nothing;
- when present, `scoopies_activity` grants authenticated only SELECT/INSERT,
  denies mutation/structural privileges, and grants anon nothing;
- authenticated roles can execute only the eight public inventory RPCs, not
  the internal conversion/balance helpers or trigger functions;
- costing source IDs have a global unique inventory binding even though each
  inventory row belongs to one business;
- normal costing upserts cannot rename/delete the protected main row, omit an
  active/untombstoned source, restore an inactive source ID, create duplicate
  IDs or dangling saved dependencies, or change an active source's kind/base
  unit; and
- the atomic deletion RPC removes only its target while preserving unrelated
  costing JSON and creating/deactivating its tombstone.

## Live smoke test

Run `supabase/tests/inventory_phase_1_schema_checks.sql`, then
`supabase/tests/inventory_phase_1_live_access_checks.sql` from an
authenticated owner SQL connection.

The live suite:

- creates a temporary business and rolls it back;
- checks owner/manager operations, cashier-safe reads, outsider isolation, and
  anonymous denial;
- verifies direct browser table reads and writes remain blocked;
- exercises authoritative sync, atomic unsynced-source deletion, deletion preflight,
  stock-in, threshold, count/history, and retry behavior; and
- atomically removes its temporary source fixtures and verifies the main
  costing row has the same row count, checksum, and byte size after the test.

Never remove the final `ROLLBACK` from the live suite.

## Application release

Deploy the UI only after the database checks pass. Verify in both a local and
deployed browser that:

- the Stocks page loads without changing the costing document;
- purchased ingredients and combined-cost mixtures keep stable identities;
- quantities retain canonical g, ml, or piece values and automatically compact
  large display values from g to kg or ml to L;
- stock-in, waste, correction, and physical count confirmation states are
  clear;
- stale edits require a refresh;
- low-stock state is correct and inactive tombstones remain hidden from the
  Phase 1 UI;
- history is owner/manager-only; and
- POS checkout still does not deduct stock in Phase 1.

Record the final values here as part of the release commit:

| Field | Released value |
|---|---|
| Supabase project | `zdhybtctoxosjddzbfzp` (production) |
| Migration status | `202609290005` applied and verified on 2026-09-30 |
| Application commit | `0dc1251` (`Add inventory tracking phase one`) |
| Pages workflow run | `36601512150` (success) |
| Production URL | https://lowkiiii.github.io/Scoopies/ |
| Schema checks | PASS on production |
| Live-access checks | PASS on production; transaction rolled back |
| Browser checks | PASS, 158/158 locally and on deployed GitHub Pages |

## First-use procedure

1. Synchronize the current costing ingredient and mixture list.
2. For each item, physically measure/count what is actually on hand.
3. Record that value with **Stock count**. Do not copy “quantity bought” from
   costing unless it is also the verified amount currently on hand.
4. Set a low-stock threshold in the same canonical base unit.
5. Use stock-in for purchases, waste for discarded stock, corrections for
   explained signed changes, and stock count for later reconciliations.

Prepared mixtures are manually counted/corrected in Phase 1. Automatic batch
production and POS sale deductions are later phases.

For a costing deletion, the UI may call the non-mutating validation RPC for
early feedback, but it must commit through the five-argument deletion RPC
only. That RPC locks and revalidates the latest cloud source/dependencies,
tombstones the zero-balance identity, and removes only the target JSON element
in one transaction. Never send a separate full-document source omission.
Ambiguous network outcomes can retry the same RPC; an absent source plus its
inactive tombstone is the idempotent global success state, including an
authorized losing-business retry after another tab completed deletion. There is no
compensation/reactivation RPC; use a new costing source ID only when stock
tracking genuinely needs to start again.

## Rollback

The rollback script is
`supabase/rollback/202609290005_inventory_phase_1_foundation.rollback.sql`.
It takes access-exclusive locks on the business/member parents first, followed
by writer-compatible costing-state/transaction/item/line order,
and refuses when any inventory item or tombstone exists, even when no movement
was recorded.

For a safe unused-installation rollback:

1. stop the Stocks UI and all in-flight inventory requests;
2. verify that `pos_inventory_items` is empty;
3. run the rollback transaction;
4. verify inventory objects are absent and schema metadata reports version 4,
   `pos_phase_4_operations`;
5. only then run:

```text
supabase migration repair 202609290005 --status reverted --linked
supabase migration list --linked
```

Coordinate a matching application rollback. Never mark the migration reverted
when its SQL rollback failed, and never erase a production inventory ledger to
bypass the guard.
The rollback deliberately keeps the safer `scoopies_state` and
`scoopies_activity` grant sets instead of restoring destructive browser grants.
