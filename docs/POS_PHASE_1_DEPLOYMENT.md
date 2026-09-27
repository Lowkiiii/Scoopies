# POS Phase 1 live deployment record

Phase 1 was applied to the live Scoopies Supabase project on 2026-09-27.

## Target

- Project: `Scoopies`
- Project reference: `zdhybtctoxosjddzbfzp`
- Region: Sydney (`ap-southeast-2`)
- PostgreSQL: 17.6
- Migration: `202609270001_pos_phase_1_foundation.sql`

## Pre-migration protection

A private database snapshot was created in schema
`scoopies_internal_backup`. Access was revoked from `public`, `anon`, and
`authenticated`.

- `scoopies_state_before_pos_phase1_20260927`: 1 row
- `scoopies_activity_before_pos_phase1_20260927`: 1,968 rows
- Costing JSON checksum: `9758093d11c3b67c6708e094d8ba0dd4`
- Costing JSON size: 6,375 bytes

## Verified results

- `PASS: POS Phase 1 schema checks`
- `PASS: POS Phase 1 live access checks`
- 16 POS tables exist and all 16 have Row Level Security enabled
- Finalized-sale protection triggers exist
- Anonymous REST requests to POS tables return HTTP 401
- Authenticated browser roles cannot insert sales directly
- Authenticated browser roles cannot call the receipt allocator directly
- Owner, cashier, authenticated non-member, and anonymous role checks passed
- Public Supabase signups are disabled
- The pre/post costing checksum is identical
- The migration is recorded as version `202609270001`
- Live test transaction rolled back, leaving zero POS businesses, sales, and
  payments

The existing costing application and its `scoopies_state` row were not changed
by this migration.
