# Inventory Phase 2A — Compact item details

Inventory Phase 2A makes the existing manual stock ledger practical to use as
a compact spreadsheet. It adds descriptive item details and a compatible
display/input unit without changing the canonical physical balance.

## Scope

Phase 2A provides:

- a compact semantic Stocks table with the columns Item name, Brand,
  Purchased from, Date purchased, On hand, Unit, Low-stock alert, Status,
  Notes, Last updated, and Actions;
- item-level Brand, Purchased from, Last stocked on, and Notes fields;
- a persisted preferred unit selected from `g`, `kg`, `ml`, `l`, or `piece`;
- inline physical counts and low-stock thresholds entered in the preferred
  unit and converted to the existing canonical ledger unit;
- owner/manager optimistic item-detail edits; and
- a PostgreSQL 17 CI gate that applies and verifies every database phase in
  order before a Pages artifact may deploy.

Phase 2A deliberately does **not** deduct stock at checkout, record prepared
mixture production, track packages, calculate purchasing quantities, or track
expiry dates. Those are separate inventory phases.

## Quantity model

The authoritative ledger remains canonical:

| Dimension | Canonical unit | Allowed input/display units |
|---|---|---|
| Weight | `g` | `g`, `kg` |
| Volume | `ml` | `ml`, `l` |
| Count | `piece` | `piece` |

For example, entering `6 l` records a `6000 ml` physical count. Switching the
display unit back to `ml` changes only presentation and future input; it does
not create a stock movement or change the physical balance.

Changing between dimensions remains prohibited. A liquid cannot become a
weight or piece item because its historical ledger would no longer be
meaningful.

## Item details

Migration `202611050010_inventory_phase_2a_item_details.sql` adds nullable
Brand, Purchased from, Last stocked on, and Notes fields plus the compatible
preferred unit. `last_stocked_on` is intentionally generic: the UI presents it
as a purchase date for purchased ingredients and as the last batch-made date
for prepared mixtures.

Additive migration
`202611050011_inventory_phase_2a_timezone_safe_dates.sql` validates that date
against the business's local calendar day. A Manila purchase entered shortly
after midnight is therefore not rejected just because the database session is
still on the previous UTC date.

The owner/manager details RPC uses the same per-business inventory lock and
item revision contract as stock changes. A stale details form cannot overwrite
a physical count, threshold change, or another details edit from a different
device. Updating descriptive details creates no ledger line.

Cashiers retain read-only stock access. Browser roles still receive no direct
inventory-table privileges.

## Manual stock behavior

- **On hand** is an exact physical count. Saving it appends a `stock_count`
  ledger movement.
- **Low-stock alert** is optional. Saving or clearing it updates the existing
  threshold with revision protection.
- **Unit** changes the compatible display/input unit through the details RPC;
  it never rewrites ledger quantities.
- Brand, supplier, date, and notes are edited from the row action and are
  escaped when rendered.

The status remains derived from the ledger and threshold: In stock, Low
stock, Out of stock, or Not counted.

## Verification

Required checks are:

1. Apply all migrations from schema 1 through schema 10 to a fresh PostgreSQL
   17 database, running each phase's schema and behavior checks immediately
   after its migration.
2. Run `inventory_phase_2a_schema_checks.sql`,
   `inventory_phase_2a_behavior_checks.sql`, and the matching Phase 2A
   timezone schema/behavior checks after migration 011.
3. Run TypeScript type-check, production build, focused Stocks tests, and the
   full desktop/mobile browser matrix.
4. Apply migration 010 to production before deploying the Phase 2A frontend.
5. Run the read-only signed-in production smoke after Pages deploys.

## Rollback

Roll migration 011 back first with
`supabase/rollback/202611050011_inventory_phase_2a_timezone_safe_dates.rollback.sql`.
It changes no stored item data and restores the schema-10 function contract.
The schema-10 rollback is
`supabase/rollback/202611050010_inventory_phase_2a_item_details.rollback.sql`;
it is loss-averse and refuses before changing anything when an item contains
descriptive data or a non-base preferred unit that would be discarded.

Once Phase 2A details are used in production, keep the additive schema and
roll the frontend forward. Do not erase item metadata or ledger history to
force a rollback.

## Next phase

Phase 2B will compile validated physical recipe quantities into immutable
published-product consumption profiles. Automatic checkout deduction remains
off until product requirements, prepared-mixture behavior, opening counts,
shadow validation, and reversal rules are complete.
