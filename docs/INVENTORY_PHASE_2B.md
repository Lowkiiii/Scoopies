# Inventory Phase 2B — Canonical ingredient categories

Inventory Phase 2B makes the Stocks category come from the same ingredient
category used by Costing. It deliberately does not create a second editable
inventory category.

## Ownership model

The canonical fields remain in the cloud costing document:

- `ingredientCategories[]` owns category IDs and names;
- `ingredients[].categoryId` assigns each purchased ingredient or prepared
  mixture to one of those categories; and
- `pos_inventory_items.source_costing_ingredient_id` links the physical stock
  identity to its costing ingredient.

`pos_inventory_get_items` resolves `category_name` from that relationship each
time it runs. Changing an ingredient's category or renaming a category in
Costing is therefore visible in Stocks without an inventory metadata update.
An ingredient with no valid category returns `Uncategorized`. An inactive
inventory identity whose source no longer exists returns `Removed from
costing` when an owner or manager explicitly includes inactive items.

This avoids two sources of truth. A free-text Stocks category could disagree
with the category used by Ingredients, combined costs, and search.

## Spreadsheet-only daily workflow

The active Stocks table keeps daily operation intentionally simple for a
home-based and pop-up business. Owners and managers edit category, supplier,
date, on-hand amount, unit, low-stock alert, and notes directly in each row.
The separate row movement menu is not shown. Existing append-only movement
history and database functions remain intact for auditability and a future
inventory phase; this UI simplification does not delete or rewrite stock data.

## Legacy brand preservation

Schema 10 introduced a free-text physical `brand` column. Phase 2B renames it
in place to `legacy_brand`; it does not copy, overwrite, reinterpret, or delete
any value. Existing values such as supplier brands remain recoverable.

Cached Phase 2A clients remain compatible:

- the read RPC still returns a `brand` result key whose value comes from
  `legacy_brand`; and
- the deprecated `pos_inventory_update_item_details` RPC retains its exact
  signature and maps `p_brand` only to `legacy_brand`.

New code must not show that alias as the category or send a category through
the deprecated RPC.

## V2 item-details RPC

`pos_inventory_update_item_details_v2` updates only inventory-owned details:

- purchased from;
- last purchased/batch-made date;
- notes; and
- compatible preferred unit.

It accepts no brand or category input and returns neither field. It preserves
the owner/manager authorization, empty `search_path`, per-business advisory
lock, row lock, optimistic item revision, exact-retry behavior, compatible
unit rules, and business-timezone date validation from Phase 2A. Descriptive
changes still create no inventory ledger movement.

## Database artifacts

- Migration:
  `supabase/migrations/202611110012_inventory_phase_2b_category.sql`
- Rollback:
  `supabase/rollback/202611110012_inventory_phase_2b_category.rollback.sql`
- Schema checks:
  `supabase/tests/inventory_phase_2b_category_schema_checks.sql`
- Behavior checks:
  `supabase/tests/inventory_phase_2b_category_behavior_checks.sql`
- Destructive disposable-database rollback round trip:
  `supabase/tests/inventory_phase_2b_rollback_roundtrip_checks.sql`

The migration requires schema
`11:inventory_phase_2a_timezone_safe_dates` and advances metadata to
`12:inventory_phase_2b_category`.

## Compatibility-safe deployment

Apply schema 12 before deploying a frontend that reads `category_name` or
calls the V2 item-details RPC. The migration is safe for an older cached
frontend because the old `brand` result and V1 RPC signature remain available.
The physical rename and every RPC replacement commit in one transaction.

Recommended production sequence:

1. Confirm production metadata is exactly schema 11.
2. Take a database backup or verify the current Supabase recovery point.
3. Apply migration 012 once.
4. Run the read-only schema checks.
5. Verify an authenticated inventory read returns both `category_name` and the
   compatibility `brand` key.
6. Deploy the new frontend and run the signed-in production smoke.
7. Keep V1 and `legacy_brand` until cached-client usage has aged out and a
   separately reviewed cleanup migration is ready.

Do not run the behavior or rollback-round-trip checks against production. They
create disposable identities, and the round-trip check intentionally executes
the real rollback and reapply scripts.

## Verification

CI applies all database phases in order, then verifies that:

- the physical rename and validation constraint are present;
- category is computed from the current costing source;
- changing only `categoryId` or a category name updates inventory reads without
  changing the item revision;
- legacy values survive and cached V1 calls remain functional;
- V2 cannot receive or mutate category/legacy-brand data;
- authentication, locks, revisions, units, dates, and grants remain safe; and
- the real rollback followed by a reapply preserves the legacy value and every
  other item-detail field.

## Rollback

The rollback requires schema 12. It drops V2, restores the schema-11 read RPC,
renames `legacy_brand` back to `brand`, restores the schema-11 V1 body and
grants, and resets metadata to schema 11.

The rollback is lossless because it reverses a column rename; it does not drop
or transform the retained values. Coordinate it with a frontend rollback:
new clients require `category_name` and V2, while schema 11 does not provide
them. The dedicated CI round-trip test runs the actual rollback and reapply
against committed disposable data to verify that guarantee.

## Out of scope

Phase 2B does not deduct ingredients at checkout, compile recipe consumption,
produce combined-cost mixtures into stock, track package inventory, or change
the ledger quantity model. Those require separately reviewed inventory phases.
