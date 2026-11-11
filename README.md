# Matcha Luna

Matcha Luna's costing calculator and point-of-sale system.

## Current application

The production costing app is a static GitHub Pages application whose entry
point is [`index.html`](index.html). Its browser regression suite is
[`tests/costing.test.html`](tests/costing.test.html).

## Frontend source layout

The frontend modernization separates the application by responsibility while
preserving its established browser contract:

- [`index.html`](index.html) contains the document structure and UI markup.
- [`assets/styles.css`](assets/styles.css) contains the application styles.
- [`assets/js`](assets/js) contains compatibility fallbacks for cached clients,
  including the retained classic Start script. The former classic Bootstrap
  (`boot.js`), State and persistence (`state.js`), Core, Runtime factories,
  Costing,
  Costing presentation (`render-costing.js`), POS catalog (`pos-catalog.js`),
  POS presentation (`render-pos.js`), POS operations (`pos-operations.js`),
  Publication (`publication.js`), Stocks domain, Stocks view, Support
  (`support.js`), Events (`events.js`), Workspace synchronization
  (`workspace-sync.js`), and compatibility files are retained as unreferenced
  fallbacks for browsers holding an older module entry or pre-3B0 HTML.
- [`src/main.ts`](src/main.ts) is the Vite module entry. It installs the typed
  compatibility facade, registers typed Core, Runtime factories, State,
  Costing, Catalog, Costing presentation, Stocks domain, Workspace
  synchronization, POS operations, Publication, POS presentation, Stocks
  view/controller, Support, Events, and Bootstrap modules at their established
  runtime positions, with State after Runtime and before Costing and Bootstrap
  after Events, then performs the private typed Start invocation after facade
  finalization. Fresh entry loads no classic runtime scripts.
- [`src/core`](src/core) contains the typed unit, money, identity, and stable
  serialization helpers introduced by Phase 3B1.
- [`src/runtime`](src/runtime) contains the typed fresh-state factories
  introduced by Phase 4B.
- [`src/state`](src/state) contains the typed application-state cells,
  normalization, reconciliation, persistence, cloud/realtime, history, and
  authentication responsibilities released in Phase 4K.
- [`src/bootstrap`](src/bootstrap) contains the typed Test, offline, and
  connected startup coordinator released in Phase 4L.
- [`src/start`](src/start) contains the private typed Start invocation
  released in Phase 4M.
- [`src/costing`](src/costing) contains typed ingredient, mixture, recipe,
  packaging, product, publication snapshot, validation, shared view-helper,
  and costing-page rendering logic introduced by Phases 3B2 and 4D.
- [`src/catalog`](src/catalog) contains the typed POS checkout/report lifecycle,
  cart math and actions, scoped catalog cache, pending-sale recovery, catalog
  drift, drink-media workflows, and image editor introduced by Phase 4H.
- [`src/workspace`](src/workspace) contains the typed request-currency,
  POS-workspace loading, checkout refresh, validation, pending-sale, and
  submission/recovery boundary introduced by Phase 4I.
- [`src/stocks`](src/stocks) contains typed inventory source lifecycle,
  persistence, recovery, mutation, loading, rendering, and modal/controller
  logic introduced by Phases 3C1 and 3C2.
- [`src/pos`](src/pos) contains the typed POS presentation boundary for catalog
  cards, cart and receipt rendering, register status, payment preview, and
  interaction preservation introduced by Phase 4E, plus the permissions,
  operations-modal, sales-history, tally, reporting, shift, and void boundary
  introduced by Phase 4J.
- [`src/publication`](src/publication) contains the typed publication status,
  review modal, versioned POS publish operation, safe costing-product deletion,
  and mixture-dependency boundary introduced by Phase 4F.
- [`src/modals`](src/modals) contains the typed category, purchased-input,
  mixture-session, draft, editor, validation, and final mixture-commit
  workflows introduced by Phase 4G.
- [`src/events`](src/events) contains the typed navigation, delegated form and
  action handling, lifecycle, pointer, modal, and keyboard interactions
  introduced by Phase 3C3.
- [`src/support`](src/support) contains the typed backup export/import and
  example-data utilities introduced by Phase 4C.
- [`src/compatibility`](src/compatibility) defines the stable
  `window.MatchaLunaApp` contract used while internals are modernized.
- [`vite.config.ts`](vite.config.ts) builds the GitHub Pages artifact under the
  `/Scoopies/` base path while preserving the classic runtime.
- [`docs/FRONTEND_PHASE_3A.md`](docs/FRONTEND_PHASE_3A.md) defines the current
  build migration, invariants, release gates, and rollback.
- [`docs/FRONTEND_PHASE_3.md`](docs/FRONTEND_PHASE_3.md) freezes the remaining
  typed-runtime migration and its Phase 4 entry gate.
- [`docs/FRONTEND_PHASE_4.md`](docs/FRONTEND_PHASE_4.md) inventories the
  remaining classic runtime and defines the bounded migration waves, universal
  release gates, rollback, and typed Runtime-factory, Support,
  Costing-presentation, POS-presentation, Publication, and Modal-workflow
  released slices plus the released Phase 4H POS-catalog boundary and the
  released Phase 4I Workspace, Phase 4J POS-operations, and Phase 4K typed
  State-hub, Phase 4L typed Bootstrap, and Phase 4M typed Start boundaries.
- [`docs/STOCKS_UI_PHASE_5.md`](docs/STOCKS_UI_PHASE_5.md) records the released
  Shopify-inspired Stocks presentation: a semantic desktop inventory table,
  responsive labeled mobile rows, unchanged inventory behavior and backend,
  exact compatibility limits, test and production evidence, and rollback.
- [`docs/INVENTORY_PHASE_1.md`](docs/INVENTORY_PHASE_1.md) defines the
  append-only manual physical-stock ledger and canonical quantity rules.
- [`docs/INVENTORY_PHASE_2A.md`](docs/INVENTORY_PHASE_2A.md) defines the
  compact per-item spreadsheet, descriptive details, compatible unit
  selection, database contract, verification gates, and safe rollback.
- [`docs/INVENTORY_PHASE_2B.md`](docs/INVENTORY_PHASE_2B.md) defines canonical
  costing-owned inventory categories, cached-client compatibility, the V2
  details RPC, verification gates, and lossless rollback.
- [`docs/INVENTORY_PERIOD_SPREADSHEET.md`](docs/INVENTORY_PERIOD_SPREADSHEET.md)
  defines the period-aware 14-column inventory sheet, automatic POS usage,
  prepared-mixture expansion, verification gates, and safe release order.
- Schema 14 adds inventory-owned free-text categories and period-independent
  row colors, while the compact Stocks view keeps all 14 columns visible on a
  1536-pixel desktop and collapses movement history by default.

The retained JavaScript fallback files intentionally remain ordered classic
scripts for cached/pre-module clients. Do not independently add `async`,
`defer`, an IIFE, or a strict-mode wrapper to them: the protected legacy suite
still accesses established application functions through `window`. Fresh
entry uses typed modules and requests no classic runtime; typed domains retain
the direct browser contract through the compatibility facade.

This frontend-modernization numbering is separate from the historical POS
database implementation phases documented below.

## Frontend verification

Frontend Phases 1 through 3D provide an automated browser safety net for both
the user-facing workflows and the compatibility boundary. Phase 3C2 extends
that protection to the typed Stocks view/controller and its cached-client
transition path. Phase 3C3 extends the same boundary to shared browser events
and interactions. Phase 3D adds explicit dependency auditing, the complete
browser matrix on Ubuntu and Windows, and a protected read-only signed-in
production smoke. Phase 4B adds typed Runtime factories, Phase 4C adds the
typed backup export/import and example-data Support boundary, and Phase 4D
adds the typed Costing presentation boundary with exact classic and mobile
parity coverage. Phase 4E adds the typed POS presentation boundary with the
same exact classic, interaction, and mobile parity coverage. Phase 4F adds the
typed Publication authority boundary with exact RPC, stale-session, deletion,
dependency, fallback, and write-free mobile coverage. Phase 4G freezes the
next atomic 46-function modal-workflow boundary and its internally separated
typed responsibilities, and now owns that boundary through the typed `modals`
domain with exact classic parity, Promise/error-path coverage, and write-free
mobile dialog checks. The unchanged classic file remains available for
cached/pre-module fallback, and every Phase 4G release gate passed. Phase 4H
implements the frozen atomic 81-function POS catalog, cart, pending-sale
recovery, drink-media, and image-editor boundary through the typed `catalog`
domain. Its exact classic parity, recovery, mobile-safety, cross-platform,
Pages, and guarded signed-in production gates all passed.
Phase 4I implements the frozen atomic 18-function Workspace read, refresh,
checkout-validation, pending-sale, and sale-recovery boundary as a typed
domain while retaining the unchanged classic fallback for cached clients. Its
exact classic parity, stale-request and recovery behavior, mobile safety,
cross-platform CI, Pages artifact, live-browser, and guarded signed-in
production gates all passed.
Phase 4J implements the frozen atomic 60-function POS permissions, operations-
modal, sales-history, tally, reporting, shift, and void boundary inside the
existing typed POS domain while retaining the unchanged classic fallback for
cached clients. Its exact classic parity, recovery, mobile safety, cross-
platform CI, Pages artifact, live-browser, and guarded signed-in production
gates all passed.

Phase 4K implements the frozen 87-value and 54-function State surface as one
141-binding typed domain while retaining the unchanged classic State fallback
for cached clients. That slice's exact classic parity, recovery, mobile safety,
cross-platform CI, Pages artifact, live-browser, and guarded signed-in
production gates all passed; Bootstrap remains separately reversible from
State.

Phase 4L implements the frozen one-function Bootstrap surface while preserving
the exact Test, offline, and connected startup effects, Promise and failure
boundaries, live State dependencies, and unchanged cached-client fallbacks.
At Phase 4L's release, fresh startup loaded only classic `start.js`, keeping
Start separately reversible for Phase 4M. Its exact startup parity, failure,
concurrency, cache, mobile safety, cross-platform CI, Pages artifact, live-
browser, and guarded signed-in production gates all passed.

Phase 4M implements Start as one private typed invocation after facade
finalization, preserving live root lookup, bare-call receiver and ignored-
result parity, classic-script-equivalent synchronous error reporting, and
unchanged cached-client fallbacks. Fresh startup now requests no classic
runtime. Its exact invocation, error, readiness, cache, mobile safety, cross-
platform CI, Pages artifact, live-browser, and guarded signed-in production
gates all passed. It adds no compatibility domain or browser API and changes no
user interface, data, or business behavior.

Phase 5A froze the Stocks redesign contract without changing production UI.
Phase 5B replaced only the fresh typed two-column stock cards with the
contracted semantic table and responsive mobile rows while keeping the typed
Stocks domain, modal, Events hooks, persistence, permissions, calculations,
and cached fallback unchanged. Phase 5C passed cross-platform CI, exact Pages
artifact parity, desktop and 390-pixel live-browser checks, and the guarded
signed-in production smoke. The Stocks presentation redesign is released.

Use the Node version recorded in
[`.nvmrc`](.nvmrc), then run:

```text
npm ci
npm run typecheck
npx playwright install chromium webkit
npm test
```

`npm test` first creates a fresh `dist/`, then previews and exercises that
artifact. The released Phase 4M slice runs the protected 182-test legacy browser
suite inside an exact 168-run matrix: 130 desktop Chromium, 19 Pixel Chrome,
and 19 iPhone WebKit runs while preserving the exact 175-name compatibility
contract.
Pull requests and pushes to `main` run the same type-check, build, and browser
checks on both Ubuntu and Windows through
[`.github/workflows/ci.yml`](.github/workflows/ci.yml). A passing `main` run
deploys the exact Ubuntu-tested artifact to GitHub Pages only after both
operating-system jobs pass. The manual
[signed-in production smoke](.github/workflows/production-smoke.yml) verifies
the live cloud-backed screens without permitting business-data writes.

Focused commands are also available:

```text
npm run build
npm run test:legacy
npm run test:assets
npm run test:compatibility
npm run test:smoke
```

Run `npm run build` before a focused test command so it uses the current source.

## POS implementation

POS work is being delivered in verified phases. Phase 1 adds the additive
Supabase database foundation. Phase 2 adds an explicit, reviewed publication
flow from Pricing to an immutable POS catalog; costing edits never silently
change a published POS price. Phase 3 makes POS the default signed-in page and
adds fast checkout for Cash, GCash, and GoTyme. Phase 4 adds explicit Live and
Training shifts, blind close reconciliation, audited before-preparation voids,
and business-timezone end-of-day reporting.

Products must first be reviewed and published from **4. Pricing** before they
appear in the POS menu. Checkout records freeze the product name, version,
selling price, and estimated costs used at the time of sale, so later costing
or price changes cannot rewrite sales history. If a connection fails while a
sale is completing, the app retries the same checkout ID and payload to recover
the original receipt without creating a duplicate sale.

- [Phase 1 guide](docs/POS_PHASE_1.md)
- [Phase 1 migration](supabase/migrations/202609270001_pos_phase_1_foundation.sql)
- [Phase 1 schema checks](supabase/tests/pos_phase_1_schema_checks.sql)
- [Phase 1 behavior checks](supabase/tests/pos_phase_1_behavior_checks.sql)
- [Phase 1 live access checks](supabase/tests/pos_phase_1_live_access_checks.sql)
- [Phase 1 deployment record](docs/POS_PHASE_1_DEPLOYMENT.md)

- [Phase 2 guide](docs/POS_PHASE_2.md)
- [Phase 2 migration](supabase/migrations/202609270002_pos_phase_2_catalog_publication.sql)
- [Phase 2 schema checks](supabase/tests/pos_phase_2_schema_checks.sql)
- [Phase 2 behavior checks](supabase/tests/pos_phase_2_behavior_checks.sql)
- [Phase 2 live access checks](supabase/tests/pos_phase_2_live_access_checks.sql)
- [Phase 2 deployment record](docs/POS_PHASE_2_DEPLOYMENT.md)

- [Phase 3 guide](docs/POS_PHASE_3.md)
- [Phase 3 migration](supabase/migrations/202609270003_pos_phase_3_checkout_reporting.sql)
- [Phase 3 schema checks](supabase/tests/pos_phase_3_schema_checks.sql)
- [Phase 3 behavior checks](supabase/tests/pos_phase_3_behavior_checks.sql)
- [Phase 3 live access checks](supabase/tests/pos_phase_3_live_access_checks.sql)
- [Phase 3 concurrency checks](supabase/tests/pos_phase_3_concurrency_checks.sql)
- [Phase 3 deployment record](docs/POS_PHASE_3_DEPLOYMENT.md)

- [Phase 4 guide](docs/POS_PHASE_4.md)
- [Phase 4 migration](supabase/migrations/202609280004_pos_phase_4_operations.sql)
- [Phase 4 rollback](supabase/rollback/202609280004_pos_phase_4_operations.rollback.sql)
- [Phase 4 schema checks](supabase/tests/pos_phase_4_schema_checks.sql)
- [Phase 4 behavior checks](supabase/tests/pos_phase_4_behavior_checks.sql)
- [Phase 4 live access checks](supabase/tests/pos_phase_4_live_access_checks.sql)
- [Phase 4 concurrency checks](supabase/tests/pos_phase_4_concurrency_checks.sql)
- [Phase 4 deployment record](docs/POS_PHASE_4_DEPLOYMENT.md)

Inventory artifacts:

- [Inventory Phase 1 guide](docs/INVENTORY_PHASE_1.md)
- [Inventory Phase 1 migration](supabase/migrations/202609290005_inventory_phase_1_foundation.sql)
- [Inventory Phase 2A guide](docs/INVENTORY_PHASE_2A.md)
- [Inventory Phase 2A migration](supabase/migrations/202611050010_inventory_phase_2a_item_details.sql)
- [Inventory Phase 2A rollback](supabase/rollback/202611050010_inventory_phase_2a_item_details.rollback.sql)
- [Inventory Phase 2A schema checks](supabase/tests/inventory_phase_2a_schema_checks.sql)
- [Inventory Phase 2A behavior checks](supabase/tests/inventory_phase_2a_behavior_checks.sql)
- [Inventory Phase 2A timezone migration](supabase/migrations/202611050011_inventory_phase_2a_timezone_safe_dates.sql)
- [Inventory Phase 2A timezone rollback](supabase/rollback/202611050011_inventory_phase_2a_timezone_safe_dates.rollback.sql)
- [Inventory Phase 2A timezone schema checks](supabase/tests/inventory_phase_2a_timezone_schema_checks.sql)
- [Inventory Phase 2A timezone behavior checks](supabase/tests/inventory_phase_2a_timezone_behavior_checks.sql)
- [Inventory Phase 2B guide](docs/INVENTORY_PHASE_2B.md)
- [Inventory Phase 2B migration](supabase/migrations/202611110012_inventory_phase_2b_category.sql)
- [Inventory Phase 2B rollback](supabase/rollback/202611110012_inventory_phase_2b_category.rollback.sql)
- [Inventory Phase 2B schema checks](supabase/tests/inventory_phase_2b_category_schema_checks.sql)
- [Inventory Phase 2B behavior checks](supabase/tests/inventory_phase_2b_category_behavior_checks.sql)
- [Inventory Phase 2B rollback round-trip checks](supabase/tests/inventory_phase_2b_rollback_roundtrip_checks.sql)
- [Inventory period spreadsheet guide](docs/INVENTORY_PERIOD_SPREADSHEET.md)
- [Inventory period spreadsheet migration](supabase/migrations/202611110013_inventory_period_spreadsheet.sql)
- [Inventory period spreadsheet rollback](supabase/rollback/202611110013_inventory_period_spreadsheet.rollback.sql)
- [Inventory period spreadsheet schema checks](supabase/tests/inventory_period_spreadsheet_schema_checks.sql)
- [Inventory period spreadsheet behavior checks](supabase/tests/inventory_period_spreadsheet_behavior_checks.sql)
- [Inventory period spreadsheet rollback round-trip checks](supabase/tests/inventory_period_spreadsheet_rollback_roundtrip_checks.sql)
- [Inventory manual-category migration](supabase/migrations/202611120014_inventory_manual_categories.sql)
- [Inventory manual-category rollback](supabase/rollback/202611120014_inventory_manual_categories.rollback.sql)
- [Inventory manual-category schema checks](supabase/tests/inventory_manual_categories_schema_checks.sql)
- [Inventory manual-category behavior checks](supabase/tests/inventory_manual_categories_behavior_checks.sql)
- [Inventory manual-category rollback round-trip checks](supabase/tests/inventory_manual_categories_rollback_roundtrip_checks.sql)

Never commit a Supabase service-role key or database password. The web app uses
only the public project URL and publishable key; authorization is enforced by
database roles, functions, constraints, and Row Level Security.
