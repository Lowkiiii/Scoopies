# POS Phase 4 live deployment record

Phase 4 was applied to the live Scoopies Supabase project and GitHub Pages site
on 2026-09-28.

## Released artifacts

- Supabase project: zdhybtctoxosjddzbfzp
- Migration: 202609280004_pos_phase_4_operations.sql
- Application commit: 6ebdcc0ec41e47bde6fef3b47d8d3b75c2dd3ed2
- Pages workflow run: 36387624508
- Production URL: https://lowkiiii.github.io/Scoopies/

The migration history now contains exactly phases 001 through 004, and
pos_system_metadata reports schema version 4.

## Private backup and data integrity

Before migration, all 18 source tables were copied in one repeatable-read
transaction into scoopies_internal_backup. The two costing tables and all 16
POS tables use the suffix before_pos_phase4_20260928. Public, anon, and
authenticated access to the schema and every snapshot table is revoked; Row
Level Security is also enabled on each snapshot.

Pre-deployment facts:

- Costing rows: 1
- Costing JSON text bytes: 22,005
- Costing checksum: eb07d3a0efc74f34c676e85b6893af9d
- POS businesses: 1
- POS members: 2
- Active registers: 1
- Published products/versions: 0 / 0
- Shifts/sales/payments/reversal events: 0 / 0 / 0 / 0

Before migration, every public source row matched its backup in both
directions. After migration and the transaction-rolled-back live smoke test,
the same bidirectional comparison passed again for every table, excluding only
the intended schema_version metadata value changing from 3 to 4. A final
comparison after REST and Pages verification also passed.

## Verification results

- Fresh PostgreSQL 17 migrations from Phase 1 through Phase 4 passed every
  phase's schema and behavior suite.
- True two-connection races passed for checkout versus close and void versus
  close, with both possible lock winners tested.
- Phase 4 schema checks passed on the live project.
- Phase 4 live-access checks passed inside a transaction that rolled back all
  fixtures, sales, shifts, closes, and voids.
- Rollback refused atomically with an open LIVE shift, an open TRAINING shift,
  or a financial reversal. With safe preconditions, rollback to Phase 3,
  Phase 3 schema/behavior checks, Phase 4 reapplication, and Phase 4 checks all
  passed.
- The public project/key probe returned HTTP 200. Apikey-only anonymous calls
  to all Phase 4 RPCs, the compatibility checkout, and both legacy report RPCs
  returned HTTP 401 with PostgreSQL code 42501.
- The local and deployed browser suites both reported PASS 103 tests.
- The deployed index and browser-test page have the exact Git blob hashes from
  commit 6ebdcc0.
- GitHub Pages completed successfully for that exact commit.

## First-use notes

The POS remains intentionally empty until an owner or manager publishes at
least one finished product from 4. Pricing.

For real popup sales:

1. Open a LIVE shift and enter the cash physically present in the drawer.
2. Ring each order and choose Cash, GCash, or GoTyme.
3. Use a before-preparation void only for an unprepared cancelled order, return
   the customer's payment, and enter a clear reason.
4. Finish or clear the current sale, then close the shift.
5. Enter counted drawer cash and only the GCash/GoTyme sales receipts for that
   shift, not the full wallet or bank balance.
6. Review the returned variances and the end-of-day report.

TRAINING is owner/manager controlled, always starts at zero, and remains
separate from LIVE receipts, cash, and reports.

## Rollback warning

Do not roll back only one application layer. Follow the maintenance-window
runbook in POS_PHASE_4.md: stop all devices and pending recovery operations,
require zero open shifts and zero reversals, coordinate the Phase 3 Pages
commit with the database rollback, and repair the Supabase migration ledger
only after the rollback transaction succeeds.
