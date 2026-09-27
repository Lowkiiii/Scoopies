# POS Phase 2 — costing publication and catalog

Phase 2 creates the deliberate boundary between the mutable costing workspace
and the operational POS catalog. Editing a recipe, packaging cost, or selling
price does **not** silently alter the POS. An owner or manager must publish the
product after reviewing its current numbers.

The database migration is additive and does not read or modify
`public.scoopies_state`. The accompanying Pricing-page UI exposes the explicit
publication action after the migration and shared workspace are available.

## Publication model

- `pos_products` is the stable catalog identity linked to the costing product's
  string ID.
- Every approved content change appends an immutable
  `pos_product_versions` row.
- The database computes a canonical SHA-256 fingerprint from the source IDs,
  normalized name and size, integer-centavo amounts, and JSON costing snapshot.
- The browser never chooses the fingerprint or version number.
- An exact retry of the already-active publication is idempotent.
- Reverting to an older price or snapshot creates a new chronological version;
  it never reactivates or rewrites an older row.
- Category changes are catalog metadata. They do not create a price/cost
  version, but they still require an exact optimistic version token.
- Publishing never changes an existing product's availability and refuses to
  publish over an archived product.

The stored costing snapshot is the inspectable audit evidence for how the
ingredient and packaging centavos were calculated. Its top-level
`schemaVersion`, source product ID, source recipe ID, normalized name and size,
and all three centavo values must exactly match the typed RPC arguments. The
database rejects a blank recipe ID or any mismatch before writing a catalog
row. The POS will use only the active immutable version when a sale is created.

## Client RPC contract

All calls require a Supabase Auth session. Use named RPC arguments.

### Discover the caller's workspace

```text
pos_get_my_businesses()
```

Returns active memberships and the business ID needed by subsequent calls. The
live Phase 2 deployment provisions one shared Scoopies business with both
existing partner accounts as owners. Do not automatically bootstrap an account
with no membership; that could create a second accidental workspace.

### Publish a costing product

```text
pos_publish_costing_product(
  p_business_id uuid,
  p_source_costing_product_id text,
  p_source_costing_recipe_id text,
  p_name text,
  p_selling_price_centavos bigint,
  p_ingredient_cost_centavos bigint,
  p_packaging_cost_centavos bigint,
  p_costing_snapshot jsonb,
  p_size text default null,
  p_category_name text default null,
  p_expected_active_version_id uuid default null
)
```

Only owners and managers may publish. For a new product, the expected version
is `null`. After the first publication, every content or category change must
send the exact `active_version_id` returned by publication status. If another
device published first, SQLSTATE `40001` tells the UI to refresh and ask the
user to review again.

The one exception is an exact retry of content already active. It returns
`unchanged` even with a stale token, making a lost HTTP response safe to retry.

`publish_result` is one of:

- `published` — a new chronological immutable version was appended;
- `metadata_updated` — only catalog category metadata changed; or
- `unchanged` — the exact active content and metadata were already present.

The application must convert peso values to integer centavos before calling the
RPC. For the existing calculator this means rounding each displayed component
once: selling price, recipe cost per serving, and packaging cost per product.
Reject missing, non-finite, or non-positive selling prices in the UI as well as
at the database boundary.

### Read publication status

```text
pos_get_publication_status(p_business_id uuid)
```

Owners and managers receive active version IDs, normalized names and sizes,
category, all centavo amounts, the server hash, and the immutable costing JSON.
The Pricing page can compare these returned values with its current local
calculation to show **Up to date** or **Changes not published** before the user
publishes.

### Read the cashier-safe catalog

```text
pos_get_catalog(p_business_id uuid)
```

All active business members may call it. It returns only available,
non-archived products with an active version: product/version IDs, category,
name, size, price, and sorting fields. It deliberately omits ingredient cost,
packaging cost, hashes, and costing snapshots.

### Change availability

```text
pos_set_product_availability(
  p_business_id uuid,
  p_product_id uuid,
  p_available boolean
)
```

Only owners and managers may call it. Enabling a product requires an active
published version. Availability is operational metadata and never mutates a
version.

## Limits and validation

- Source product and recipe IDs: required, 1–200 trimmed characters
- Product name: 1–120 trimmed characters
- Size: at most 40 trimmed characters
- Category name: at most 80 trimmed characters
- Selling price: 1–100,000,000,000 centavos
- Ingredient and packaging cost: non-negative; combined maximum
  100,000,000,000 centavos
- Input snapshot: JSON object, at most 262,144 bytes
- Stored snapshot: at most 524,288 bytes
- Source hash: exactly 64 lowercase hexadecimal characters

Category matching is case-insensitive within one business. Ingredient folders
are not reused as POS categories because those concepts serve different jobs.

## Apply and verify

Do not deploy this migration until the current costing JSON has been exported
and its live checksum recorded as described in Phase 1.

```powershell
psql $env:SCOOPIES_TEST_DATABASE_URL --set ON_ERROR_STOP=1 `
  -f supabase/migrations/202609270002_pos_phase_2_catalog_publication.sql
psql $env:SCOOPIES_TEST_DATABASE_URL --set ON_ERROR_STOP=1 `
  -f supabase/tests/pos_phase_2_schema_checks.sql
psql $env:SCOOPIES_TEST_DATABASE_URL --set ON_ERROR_STOP=1 `
  -f supabase/tests/pos_phase_2_behavior_checks.sql
```

The behavior suite is destructive fixture code for a disposable/local database
only. It runs inside a transaction and rolls everything back. Never run it on
the live project.

The schema check is read-only and safe after deployment. Repeat the live
costing checksum after applying the migration; it must be unchanged.

After the real workspace is provisioned, run
`supabase/tests/pos_phase_2_live_access_checks.sql` through a project-owner SQL
connection. It requires two existing Auth accounts, creates an isolated test
business inside one transaction, checks owner/manager/cashier/outsider/anon
access, verifies the costing checksum, reports `PASS`, and rolls back every
fixture. If a check raises an error in SQL Editor, issue `rollback;` before
continuing; an aborted transaction cannot be committed.

## Rollback boundary

`supabase/rollback/202609270002_pos_phase_2_catalog_publication.rollback.sql`
is for pre-publication validation only. It refuses to run once any immutable
product version exists. After real publication, use a forward migration.

## Phase 2 completion gate

- Phase 1 migration and tests still pass
- Phase 2 migration succeeds on a clean Phase 1 database
- Owner and manager publication succeeds
- Cashier, outsider, and anonymous publication fails
- Direct browser catalog writes remain denied
- Exact retries create no duplicate version
- Changed content requires the exact active-version token
- A historical revert appends the next version number
- Category-only updates require the exact token without adding a version
- Cashier catalog exposes price but no cost-bearing fields
- Unavailable products are absent from the cashier catalog
- Snapshot identity and centavo mismatches are rejected without partial rows
- Immutable versions reject update and delete
- Same costing source ID remains isolated across businesses
- Phase 2 rollback succeeds before any publication, followed by clean reapply
- Existing costing checksum and browser regression suite remain unchanged
