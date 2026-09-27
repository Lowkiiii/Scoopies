# POS Phase 2 live deployment record

Phase 2 was applied to the live Scoopies Supabase project on 2026-09-27.

## Target

- Project: `Scoopies`
- Project reference: `zdhybtctoxosjddzbfzp`
- Region: Sydney (`ap-southeast-2`)
- Migration: `202609270002_pos_phase_2_catalog_publication.sql`

## Pre-migration protection

A second private database snapshot was created in schema
`scoopies_internal_backup`. Access is revoked from `public`, `anon`, and
`authenticated`.

- `scoopies_state_before_pos_phase2_20260927`: 1 row
- `scoopies_activity_before_pos_phase2_20260927`: 1,968 rows
- Costing JSON checksum: `9758093d11c3b67c6708e094d8ba0dd4`
- Costing JSON storage size: 6,375 bytes
- Costing JSON text size: 22,005 bytes
- Live costing JSON exactly matches the Phase 2 backup

## Shared workspace

- One `Scoopies` business
- Timezone: `Asia/Manila`
- Currency: `PHP`
- Receipt prefix: `SCP`
- Both existing partner accounts are active owners
- One active `Main register`
- Zero products and zero product versions before the first explicit publish

## Verified results

- `PASS: POS Phase 2 schema checks`
- `PASS: POS Phase 2 live access checks`
- `PASS 73 tests` in the browser regression suite
- Phase 1 and Phase 2 migration ledger entries match locally and remotely
- Owner and manager publication paths passed
- Cashier-safe catalog access passed and exposes no costing fields
- Cashier, authenticated outsider, and anonymous authorization boundaries passed
- Anonymous REST workspace and catalog calls return HTTP 401
- Direct browser-role catalog writes remain denied
- The live access fixture transaction rolled back completely
- The pre/post costing checksum is identical
- The live costing row still exactly matches its private Phase 2 backup

The migration and workspace provisioning did not change the existing costing
document. Pricing changes enter the POS catalog only through the explicit
review-and-publish action on the Pricing page.
