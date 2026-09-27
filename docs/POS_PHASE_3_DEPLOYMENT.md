# POS Phase 3 live deployment record

Phase 3 was applied to the live Scoopies Supabase project on 2026-09-28.

## Target

- Project: `Scoopies`
- Project reference: `zdhybtctoxosjddzbfzp`
- Region: Sydney (`ap-southeast-2`)
- Migration: `202609270003_pos_phase_3_checkout_reporting.sql`

## Pre-migration protection

A private snapshot of the costing tables and all 16 Phase 1 POS tables was
created in schema `scoopies_internal_backup`. Its table names use the suffix
`before_pos_phase3_20260927`, matching the date on which the snapshot began.
Access is revoked from `public`, `anon`, and `authenticated`.

- Costing state: 1 row
- Costing activity: 1,968 rows
- Costing JSON checksum: `eb07d3a0efc74f34c676e85b6893af9d`
- POS businesses: 1
- Products and immutable product versions: 0
- Sales and payments: 0

The checksum differs from earlier deployment records because the owners edited
the costing document between phases. The Phase 3 comparison uses this current
snapshot as its baseline.

## Verified results

- `PASS: POS Phase 3 schema checks` on the live project
- `PASS: POS Phase 3 live access checks` in a transaction that rolled back
- `PASS 85 tests` in the final browser regression suite
- Clean Phase 1 -> Phase 2 -> Phase 3 local migration and behavior sequence
- True two-connection checkout concurrency test passed on PostgreSQL 17
- Rollback to schema version 2 and clean reapplication to version 3 passed
- Local and remote migration ledgers both contain versions 1, 2, and 3
- Anonymous REST calls to checkout, today's summary, and recent sales return
  HTTP 401
- Cash, GCash, and GoTyme paths passed, including server-calculated cash change
- Exact request retries converge on one sale and receipt
- Different concurrent sales receive unique sequential receipts
- Stale catalog versions are rejected before checkout and require review
- Cashiers receive sales totals but no ingredient cost or profit fields
- The live costing checksum still equals the private Phase 3 backup
- The live costing row has zero differences from its backup
- The rolled-back live fixtures left the real counts unchanged: zero products,
  product versions, sales, and payments

## Operator handoff

POS is now the first page after login. The live menu is intentionally empty
until an owner opens **4. Pricing** and uses **Publish to POS** for at least one
finished product. A published item then appears on the POS screen after Refresh.

Checkout records Cash, GCash, or GoTyme, creates an immutable receipt and sale
snapshot, and updates today's sales/payment totals. Estimated gross profit is
sales minus the published ingredient and packaging costs; it is not net profit
and excludes rent, labor, utilities, delivery fees, and payment fees.

The Phase 3 MVP automatically opens the first live shift with zero opening cash.
Explicit drawer opening, closing, cash counting, voids, refunds, and expense/net
profit workflows remain later phases.
