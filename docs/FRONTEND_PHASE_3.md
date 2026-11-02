# Frontend Phase 3 — typed runtime migration

Frontend Phase 3 moves selected application domains from ordered classic
scripts into typed modules without changing Matcha Luna's business behavior,
data, or user interface. It is separate from the historical POS database
phases.

## Frozen scope

- **3A — build and release foundation:** released at merge `c3f24d6`.
- **3B0 — module bootstrap:** released at merge `be5f671`; one Vite module
  entry installs the compatibility facade and loads the remaining classic
  runtime in its protected order.
- **3B1 — typed Core:** released at merge `82f6b0d`; units, money, identity,
  and serialization helpers now run from the typed module entry.
- **3B2 — typed Costing:** released at merge `824a30a`; ingredients, mixtures,
  recipes, packaging, product costing, publication snapshots, and validation
  now run from typed modules.
- **3C — typed Stocks and interaction island:** Phase 3C1 released at merge
  `af389a2`; stock domain logic, persistence, recovery, source lifecycle, and
  loading now run from typed modules. Phase 3C2 released at merge `aa23b5e`;
  the Stocks view/controller boundary now runs from typed modules. Phase 3C3
  released at merge `34bd6d3`; the shared event and interaction boundary now
  runs from typed modules.
- **3D — closure (in progress):** clean Windows and CI test exits, signed-in
  production smoke, release evidence, and the final Phase 3 baseline.

Phase 4 does not begin until every slice above is complete.

## Phase 3D contract (in progress)

Phase 3D closes and freezes the frontend modernization. It introduces no new
runtime migration and changes no UI, pricing or inventory arithmetic, POS
behavior, authentication flow, Supabase schema, RLS policy, stored data, or
cloud format.

The final protected Phase 3 baseline is:

- Node `24.22.2` with a clean dependency install and zero high-severity audit
  findings.
- Exact 182-test legacy baseline and 175-name browser compatibility contract.
- Typed domains with exact API sizes: Core 15, Costing 24, Stocks 63, and
  Events 1.
- Exact 12-script active classic runtime.
- Exact 18-script cached transition with six unchanged fallback assets:
  `core.js`, `costing.js`, `stocks.js`, `render-stocks.js`, `events.js`, and
  `compatibility.js`.
- Default Playwright matrix of 38 runs across desktop Chromium, Pixel Chrome,
  and iPhone WebKit.
- GitHub Pages deployment from only the tested `dist/` artifact.

Phase 3D hardens the durable release gates with an explicit dependency audit
and the complete browser matrix on both Ubuntu and Windows. Pages still
packages the Ubuntu-produced artifact, but only after both operating-system
jobs pass.

The signed-in production smoke is separate from the default regression suite.
It uses a dedicated existing account supplied only through protected GitHub
environment secrets, runs against the real Pages URL, creates a fresh browser
context, and performs read-only checks of cloud readiness, POS catalog and
payment controls, Stocks, Ingredients, Recipes, and Pricing. It must not open
or close a shift, submit or void a sale, mutate inventory or costing data, or
retain screenshots, traces, videos, credentials, or business-data artifacts.

### Signed-in smoke operation

1. Create the GitHub environment `production-smoke` and restrict it to the
   `main` branch.
2. Add `MATCHA_LUNA_SMOKE_EMAIL` and `MATCHA_LUNA_SMOKE_PASSWORD` as environment
   secrets. Use an existing dedicated test account that belongs to the real
   Matcha Luna workspace; never commit or paste either value into an issue,
   pull request, log, or documentation.
3. After the tested `main` artifact is live, manually run the **Signed-in
   production smoke** workflow on `main`.
4. Record the successful workflow URL in the Phase 3D release evidence. A
   missing secret, missing production data, blocked write attempt, browser
   error, failed request, or server error must fail the smoke without changing
   production business data.

## Phase 3D exit gates (pending)

- Clean Windows `npm ci`, explicit `npm audit --audit-level=high`, type-check,
  production build, and full 38-run browser suite exit successfully without a
  leftover preview process.
- Pull-request and post-merge CI pass the explicit audit, type-check, build,
  and full browser suite on both Ubuntu and Windows.
- Exact legacy, compatibility, typed-domain, active-runtime, cached-transition,
  and fallback-asset baselines above remain green.
- A real read-only signed-in production smoke passes through the protected
  production-smoke environment without sharing or recording credentials.
- The historical Phase 3A release record and current README source map are
  complete and accurate.
- The tested `main` artifact deploys through Pages; live HTML, module,
  stylesheet, fallback assets, runtime order, compatibility namespaces,
  errors, failed requests, and 390-pixel overflow are verified.
- Final Phase 3 release evidence is recorded and the repository is clean and
  synchronized on `main`.

No Phase 3D or final Phase 3 release is claimed until every gate above,
including the real signed-in production smoke, has recorded evidence.

## Phase 3C3 contract

Phase 3C3 replaces only `assets/js/events.js` in the active runtime. The
unchanged fallback exposes the public `activateAppTab` function and installs
15 listeners in this exact order:

1. navigation `click`
2. body image `error` with capture enabled
3. body `input`
4. body `change`
5. body delegated action `click`
6. body modal-backdrop `click`
7. window `focus`
8. window `online`
9. body `focusout`
10. body `pointerdown`
11. body `pointermove`
12. body `pointerup`
13. body `pointercancel`
14. body `lostpointercapture`
15. body `keydown`

All listeners, including the 112-case delegated action dispatcher, move
together so their registration order, capture mode, default prevention,
modal priority, asynchronous behavior, and live browser bindings remain
unchanged. Typed Events exposes the exact one-function `events` namespace and
the established `activateAppTab` browser-root proxy.

The active runtime then loads these exact 12 classic scripts in order:

1. `runtime-factories.js`
2. `state.js`
3. `pos-catalog.js`
4. `workspace-sync.js`
5. `pos-operations.js`
6. `publication.js`
7. `render-costing.js`
8. `render-modals.js`
9. `render-pos.js`
10. `support.js`
11. `boot.js`
12. `start.js`

The production entry must not request `core.js`, `costing.js`, `stocks.js`,
`render-stocks.js`, `events.js`, or `compatibility.js`. All six unchanged
files remain in the artifact so cached Phase 3B0 through 3C2 modules and
pre-module HTML keep their original 18-script runtime.

This slice changes no UI, event behavior, inventory or pricing arithmetic,
POS behavior, authentication, Supabase schema, RLS policy, stored data, or
cloud format. Classic `boot.js` remains unchanged.

## Phase 3C3 exit gates (complete)

- Clean dependency install, zero audit vulnerabilities, type-check, and
  production build.
- Exact one-function Events namespace, protected `activateAppTab` overlap,
  175-name compatibility contract, and 182-test legacy baseline.
- Exact 15-listener target, type, order, and capture fingerprint with no
  duplicate installation.
- Typed-versus-classic parity for navigation, image fallback, form changes,
  delegated actions, modal backdrops, focus and online lifecycle, pointer
  routing, and keyboard accessibility.
- Live Events namespace and browser-root replacement checks, including the
  classic online-listener capture behavior.
- Active 12-script order with no request for any transition asset.
- Original 18-script cached transition starts and exercises representative
  interactions with all six retained fallback assets returning HTTP 200.
- Event-driven POS, Costing, and Stocks interactions pass on desktop Chromium,
  Pixel Chrome, and iPhone WebKit without horizontal overflow.
- Pull-request CI, post-merge CI, Pages deployment, and live production checks
  pass before Phase 3C3 is marked released.

Every gate above passed before Phase 3C3 was marked released.

## Phase 3C3 release record

- Pull request: [#15](https://github.com/Lowkiiii/Scoopies/pull/15)
- Implementation commit: `870141e3dc6057de087be363a7b5670c66e22058`
- Merge commit: `34bd6d39d7221328fcac4a932c2f179208eaf2d2`
- PR CI:
  [41340848342](https://github.com/Lowkiiii/Scoopies/actions/runs/41340848342)
- Main CI and Pages deployment:
  [41341014473](https://github.com/Lowkiiii/Scoopies/actions/runs/41341014473)
- Local verification: Node `24.22.2`; clean `npm ci`; zero audit
  vulnerabilities; type-check and 48-module production build passed; all 38
  Playwright tests passed, including the exact 182-test legacy and 175-name
  compatibility baselines, exact one-function Events namespace, exact ordered
  15-listener manifest, exact ordered 112-action dispatcher, focus and online
  capture parity, and event-driven POS, Costing, and Stocks interactions on
  desktop Chromium, Pixel Chrome, and iPhone WebKit.
- Review evidence: independent scope, architecture, semantic parity, test,
  cached-client, diff-integrity, and mobile audits found no release blocker.
  The two missing focus/online and action-surface gates identified during final
  review were added, rerun, and independently re-audited before commit.
- Production asset verification: Pages deployed `index-C5s08f5g.js` and
  `index-B0B7i9SZ.css`; the HTML, active module, stylesheet, and all six
  retained transition assets returned HTTP 200. The active browser loaded the
  exact 12-script runtime without requesting `core.js`, `costing.js`,
  `stocks.js`, `render-stocks.js`, `events.js`, or `compatibility.js`. The live
  Events fallback matched the merge source exactly after line-ending
  normalization.
- Production browser verification: a fresh 390-pixel Chromium session exposed
  the exact one-name Events namespace and root proxy, loaded the expected
  12-script runtime in order, displayed the Matcha Luna application, and
  reported zero page errors, failed requests, or horizontal overflow.

## Phase 3C2 contract

Phase 3C2 replaces only `assets/js/render-stocks.js` in the active runtime.
The unchanged fallback defines 25 Stocks presentation/controller functions
plus its required `renderPos` and `renderAll` integration tail, so all 27 move
together at their original runtime position after `render-pos.js` and before
`support.js`:

`stockNumber`, `stockFormatNumber`, `stockFormatQuantity`,
`stockSourceForItem`, `stockStatus`, `stockFilteredItems`,
`stockSummaryHtml`, `stockFilterBarHtml`, `stockItemCardsHtml`,
`stockTransactionLabel`, `stockHistoryHtml`, `renderStockResults`,
`renderStocks`, `stockItemById`, `stockAllowedActions`, `stockUnitChoices`,
`stockInputToBase`, `stockValidateModal`, `openStockModal`,
`closeStockModal`, `setStockModalAction`, `stockPreviewHtml`,
`renderStockModal`, `updateStockModalPreview`, `submitStockModal`,
`renderPos`, and `renderAll`.

These functions append to the existing typed Stocks namespace in source order,
producing an exact ordered 63-function domain while retaining live sibling and
browser-root bindings.

The active runtime then loads these exact 13 classic scripts in order:

1. `runtime-factories.js`
2. `state.js`
3. `pos-catalog.js`
4. `workspace-sync.js`
5. `pos-operations.js`
6. `publication.js`
7. `render-costing.js`
8. `render-modals.js`
9. `render-pos.js`
10. `support.js`
11. `events.js`
12. `boot.js`
13. `start.js`

The production entry must not request `core.js`, `costing.js`, `stocks.js`,
`render-stocks.js`, or `compatibility.js`. All five unchanged files remain in
the artifact so cached Phase 3B0/3B1/3B2/3C1 modules and pre-module HTML keep
their original runtime.

This slice changes no UI, inventory or pricing arithmetic, POS behavior,
authentication, Supabase schema, RLS policy, stored data, or cloud format.
Classic `events.js` remains the integration consumer and later migration
boundary.

## Phase 3C2 exit gates (complete)

- Clean dependency install, zero audit vulnerabilities, type-check, and
  production build.
- Exact ordered 27-function view/controller API, cumulative 63-function Stocks
  namespace, 27 protected legacy overlaps, 175-name compatibility contract,
  and 182-test legacy baseline.
- Typed-versus-classic fingerprints for formatting, filters, cards, history,
  modal lifecycle, POS/application rendering, and asynchronous stock updates.
- Live sibling, root-state, later-defined renderer, stale-response, exact retry,
  deterministic failure, and uncertain recovery checks.
- Active 13-script order with no request for any transition asset.
- Original 18-script cached transition starts with all five retained fallback
  assets returning HTTP 200.
- Event-driven populated Stocks interactions and modal usability pass on
  desktop Chromium, Pixel Chrome, and iPhone WebKit without horizontal
  overflow.
- Pull-request CI, post-merge CI, Pages deployment, and live production checks
  pass before Phase 3C2 is marked released.

Every gate above passed before Phase 3C2 was marked released.

## Phase 3C2 release record

- Pull request: [#13](https://github.com/Lowkiiii/Scoopies/pull/13)
- Implementation commit: `9f8cdbcfc323c6cca1a9a04ff2e8f380abeac77c`
- Merge commit: `aa23b5ec40a1a9f209bc481da816575269c52d63`
- PR CI:
  [41336444961](https://github.com/Lowkiiii/Scoopies/actions/runs/41336444961)
- Main CI and Pages deployment:
  [41336584826](https://github.com/Lowkiiii/Scoopies/actions/runs/41336584826)
- Local verification: Node `24.22.2`; clean `npm ci`; zero audit
  vulnerabilities; type-check and production build passed; all 32 Playwright
  tests passed, including the exact 182-test legacy and 175-name compatibility
  baselines, exact 63-function Stocks namespace, exact 27-function typed and
  classic view/controller boundary, asynchronous submit parity, live
  bindings, and event-driven Stocks interactions on desktop Chromium, Pixel
  Chrome, and iPhone WebKit.
- Review evidence: independent architecture, semantic parity, cached-client,
  test, and mobile audits found no remaining release blocker.
- Production asset verification: Pages deployed `index-DV7eClTq.js` and
  `index-B0B7i9SZ.css`; the HTML, active module, stylesheet, and all five
  retained transition assets returned HTTP 200. The active browser loaded the
  exact 13-script runtime without requesting `core.js`, `costing.js`,
  `stocks.js`, `render-stocks.js`, or `compatibility.js`. The live Stocks view
  fallback matched the merge source exactly after line-ending normalization.
- Production browser verification: a fresh 390-pixel Chromium session exposed
  the exact ordered 63-name Stocks namespace and 27-name view/controller tail,
  preserved the root compatibility proxies, displayed the Matcha Luna login
  screen, and reported zero page errors, failed requests, or horizontal
  overflow.

## Phase 3C1 contract

Phase 3C1 replaces only `assets/js/stocks.js` in the active runtime. Typed
Stocks registers these 36 existing browser globals at the original Stocks
position, after `pos-catalog.js` and before `workspace-sync.js`:

`stockRequestIsCurrent`, `stockBaseUnitForIngredient`, `stockSourcePayload`,
`costingBulkInventoryIssue`, `reconcileCostingInventoryLifecycle`,
`replaceCostingStateSafely`, `stockNormalizeItem`,
`stockNormalizeTransaction`, `stockPendingScope`, `stockPendingStorageKey`,
`stockPendingRecords`, `stockBuildPending`, `stockSavePending`,
`stockClearPending`, `stockStoredPendings`, `stockStoredPending`,
`stockPendingStillCurrent`, `stockSourceDeleteStorageKey`,
`stockSourceDeleteRecords`, `stockSaveSourceDelete`,
`stockClearSourceDelete`, `stockBuildSourceDelete`,
`stockAdoptRemoteCosting`, `stockScopedSourceDeletes`,
`stockRecoverSourceDeletes`, `stockApplyMutationRows`,
`stockRestorePendingModal`, `stockRecoverStoredPending`, `stockErrorText`,
`stockMutationDeterministic`, `stockSourceGuardMessage`,
`stockEnsureSourceWorkspace`, `deleteIngredientSafely`,
`changeIngredientUnitSafely`, `loadStocks`, and `openStocks`.

The active runtime then loads these exact 14 classic scripts in order:

1. `runtime-factories.js`
2. `state.js`
3. `pos-catalog.js`
4. `workspace-sync.js`
5. `pos-operations.js`
6. `publication.js`
7. `render-costing.js`
8. `render-modals.js`
9. `render-pos.js`
10. `render-stocks.js`
11. `support.js`
12. `events.js`
13. `boot.js`
14. `start.js`

The production entry must not request `core.js`, `costing.js`, `stocks.js`, or
`compatibility.js`. All four unchanged files remain in the artifact so cached
Phase 3B0/3B1/3B2 modules and pre-module HTML continue to start safely.

Stocks must keep resolving current browser state, Core and Costing helpers,
sibling Stocks functions, and later-defined view/controller functions at call
time. Storage keys, frozen retry requests, source-deletion recovery, RPC order,
authoritative balances, stale-workspace cancellation, error mapping, and exact
notice text remain unchanged.

This slice changes no UI, inventory arithmetic, Costing or POS behavior,
authentication, Supabase schema, RLS policy, stored data, or cloud format.

## Phase 3C1 exit gates (complete)

- Clean dependency install, zero audit vulnerabilities, type-check, and
  production build.
- Exact 36-name Stocks domain, 18 protected legacy overlaps, 15-name Core
  domain, 24-name Costing domain, 175-name legacy contract, and 182-test legacy
  baseline.
- Complete Stocks fingerprint against the retained classic implementation,
  plus live sibling, root, state, and later-defined binding checks.
- Active 14-script order with no request for any transition asset.
- Original 18-script cached transition starts with all four retained fallback
  assets returning HTTP 200.
- Existing inventory recovery, retry, atomic deletion, unit-dimension, and
  stale-workspace regression cases remain green.
- Desktop Chromium, Pixel Chrome, and iPhone WebKit pass, including document
  overflow checks after opening the Stocks tab.
- Pull-request CI, post-merge CI, Pages deployment, and live production checks
  pass before Phase 3C1 is marked released.

Every gate above passed before Phase 3C1 was marked released.

## Phase 3C1 release record

- Pull request: [#11](https://github.com/Lowkiiii/Scoopies/pull/11)
- Implementation commit: `87ca99788083fe412aabc7f400d55802a6178051`
- Merge commit: `af389a2e8538b14630e2ddedcc097313f66fc057`
- PR CI:
  [41333189293](https://github.com/Lowkiiii/Scoopies/actions/runs/41333189293)
- Main CI and Pages deployment:
  [41333335023](https://github.com/Lowkiiii/Scoopies/actions/runs/41333335023)
- Local verification: Node `24.22.2`; clean `npm ci`; zero audit
  vulnerabilities; type-check and production build passed; all 25 Playwright
  tests passed, including the exact 182-test legacy and 175-name compatibility
  baselines, exact 36-function Stocks domain, typed-versus-classic fingerprint,
  live bindings, cloud-deletion recovery, populated 390-pixel Stocks layout,
  desktop Chromium, Pixel Chrome, and iPhone WebKit.
- Review evidence: independent architecture, semantic parity, and test audits
  found no remaining release blocker. The one visible status-text encoding
  mismatch they identified was fixed and covered by a real typed-versus-classic
  remote-deletion scenario before the clean final suite.
- Production asset verification: Pages deployed `index-ChGTPXmp.js` and
  `index-B0B7i9SZ.css`; the HTML, active module, stylesheet, and all four
  retained transition assets returned HTTP 200. The active browser loaded the
  exact 14-script runtime without requesting `core.js`, `costing.js`,
  `stocks.js`, or `compatibility.js`. The live Stocks fallback matched the
  merge source exactly after line-ending normalization.
- Production browser verification: a fresh 390-pixel Chromium session exposed
  the exact ordered 36-name Stocks namespace, preserved the root compatibility
  proxy, completed the real cloud bootstrap, displayed the Matcha Luna login
  screen, and reported zero page errors, failed requests, or horizontal
  overflow.

## Phase 3B2 contract

Phase 3B2 replaces only `assets/js/costing.js` in the active runtime. Typed
Costing registers these 24 existing browser globals at the original Costing
position, after `state.js` and before the first Costing consumer:

`isMixture`, `ingredientBaseUnit`, `ingredientTotalBase`,
`stateIngredientLookup`, `ingredientCostInfo`, `mixtureBatchCost`,
`ingCostPerBase`, `pkgCostPerPiece`, `packagingLineCost`, `lineCost`,
`recipeTotal`, `recipePerServing`, `productPackagingCost`, `productCost`,
`suggestedPrice`, `ingredientUsage`, `packagingUsage`, `recipeUsage`,
`moneyToCentavos`, `snapshotNumber`, `publicationIngredientRecord`,
`collectPublicationIngredient`, `buildProductCostingSnapshot`, and
`validateProductForPublish`.

The active runtime then loads these exact 15 classic scripts in order:

1. `runtime-factories.js`
2. `state.js`
3. `pos-catalog.js`
4. `stocks.js`
5. `workspace-sync.js`
6. `pos-operations.js`
7. `publication.js`
8. `render-costing.js`
9. `render-modals.js`
10. `render-pos.js`
11. `render-stocks.js`
12. `support.js`
13. `events.js`
14. `boot.js`
15. `start.js`

The production entry must not request `core.js`, `costing.js`, or
`compatibility.js`. All three unchanged files remain in the artifact so cached
Phase 3B0/3B1 modules and pre-module HTML continue to start safely.

Costing must keep resolving the current mutable `state`, Core globals, and
sibling Costing functions at call time. This preserves legacy rebinding,
coercion, recursive mixture, publication snapshot, and validation behavior.

This slice changes no calculation formula, UI, POS or Stocks behavior,
authentication, Supabase schema, RLS policy, stored data, or cloud format.

## Phase 3B2 exit gates (complete)

- Clean dependency install, zero audit vulnerabilities, type-check, and
  production build.
- Golden coverage for all 24 Costing helpers plus a typed-versus-classic
  behavior fingerprint and live-binding checks.
- Exact 24-name Costing domain, 15-name Core domain, 175-name legacy contract,
  and 182-test legacy baseline.
- Active 15-script order with no request for any transition asset.
- Original 18-script cached transition starts with `core.js`, `costing.js`, and
  `compatibility.js` returning HTTP 200.
- Desktop Chromium, Pixel Chrome, and iPhone WebKit pass without page or
  console errors or horizontal overflow.
- Pull-request CI, post-merge CI, Pages deployment, and live production checks
  pass before Phase 3B2 is marked released.

Every gate above passed before Phase 3B2 was marked released.

## Phase 3B2 release record

- Pull request: [#9](https://github.com/Lowkiiii/Scoopies/pull/9)
- Implementation commit: `c19a970c04b4fe3533b018e6348feed8e69dad90`
- Merge commit: `824a30a89c6ba0f742061451c75c6d6c374719a1`
- PR CI:
  [41329414533](https://github.com/Lowkiiii/Scoopies/actions/runs/41329414533)
- Main CI and Pages deployment:
  [41329563439](https://github.com/Lowkiiii/Scoopies/actions/runs/41329563439)
- Local verification: Node `24.22.2`; clean `npm ci`; zero audit
  vulnerabilities; type-check and production build passed; all 20 Playwright
  tests passed, including the exact 182-test legacy and 175-name compatibility
  baselines, typed-versus-classic Costing parity, exact validation failures,
  live bindings, semantic edge cases, desktop Chromium, Pixel Chrome, and
  iPhone WebKit.
- Review evidence: independent architecture, semantic parity, and test audits
  found no release blockers. Five observable JavaScript parity edges involving
  evaluation order, coercion, primitive boxing, `Boolean`, and `TextEncoder`
  were fixed and covered before the clean final suite.
- Production asset verification: Pages deployed `index-DydpMLAc.js`; the HTML,
  active module, and retained `costing.js` fallback returned HTTP 200. The
  active module contained the exact 15-script runtime and no exact request for
  `core.js`, `costing.js`, or `compatibility.js`. The live Costing fallback
  matched the merge source byte-for-byte after HTTP decoding.
- Production browser verification: a fresh Chromium session loaded with zero
  page errors or failed requests, exposed the exact 24-name Costing namespace
  alongside the Core and legacy domains, preserved the root compatibility
  proxy, and displayed the Matcha Luna login screen.

## Phase 3B1 contract

Phase 3B1 replaces only `assets/js/core.js` in the active runtime. Before any
classic script starts, `src/main.ts` synchronously registers these 15 typed
Core globals through the compatibility facade:

`UNIT_FACTOR`, `UNIT_TYPE`, `TYPE_UNITS`, `TYPE_BASE`, `toBase`,
`convertUnitQuantity`, `peso`, `pct`, `num`, `uid`, `getById`, `ceilTo`,
`canonicalValue`, `stableSerialize`, and `sameDataValue`.

The active runtime then loads these exact 16 classic scripts in order:

1. `runtime-factories.js`
2. `state.js`
3. `costing.js`
4. `pos-catalog.js`
5. `stocks.js`
6. `workspace-sync.js`
7. `pos-operations.js`
8. `publication.js`
9. `render-costing.js`
10. `render-modals.js`
11. `render-pos.js`
12. `render-stocks.js`
13. `support.js`
14. `events.js`
15. `boot.js`
16. `start.js`

The production entry must not request `core.js` or `compatibility.js`.
Nevertheless, both files remain unchanged in the built artifact during this
transition. That lets a browser holding the Phase 3B0 module continue loading
`core.js`, and lets pre-3B0 cached HTML continue loading the original complete
18-script sequence safely.

Core tables remain mutable, and typed helpers retain the classic runtime's
coercion and live-binding behavior. Reassigning a Core table or helper through
`window` or `window.MatchaLunaApp.domains.core` must be visible in both places
and to helpers that dynamically depend on it.

This slice changes no costing formula, POS or Stocks behavior, authentication,
UI, Supabase schema, RLS policy, stored data, or cloud synchronization format.

## Phase 3B1 exit gates (complete)

- Clean dependency install, zero high-severity audit findings, type-check, and
  production build.
- Golden Core behavior tests, including coercion, conversions, formatting,
  lookup, UID, canonical serialization, mutable tables, and live reassignment.
- Exact 15-name Core domain, 175-name legacy contract, and 182-test legacy
  baseline.
- Active 16-script order with no request for either transition asset.
- Cached transition path loads both `core.js` and `compatibility.js` with HTTP
  200 and starts successfully in its original 18-script order.
- Desktop Chromium, Pixel Chrome, and iPhone WebKit pass without page or
  console errors or horizontal overflow.
- Pull-request CI, post-merge CI, Pages deployment, and live production checks
  passed before Phase 3B1 was marked released.

## Phase 3B1 release record

- Pull request: [#7](https://github.com/Lowkiiii/Scoopies/pull/7)
- Implementation commit: `6a0163a4c9d2ba2f618244a12343cc66eb1cc928`
- Merge commit: `82f6b0d3c45f4fbe4d35cb7cf71f9673a509b6ad`
- PR CI:
  [41326666058](https://github.com/Lowkiiii/Scoopies/actions/runs/41326666058)
- Main CI and Pages deployment:
  [41326842709](https://github.com/Lowkiiii/Scoopies/actions/runs/41326842709)
- Local verification: Node `24.22.2`; clean `npm ci`; zero audit
  vulnerabilities; type-check and production build passed; all 15 Playwright
  tests passed, including the exact 182-test legacy and 175-name compatibility
  baselines, typed Core golden and live-binding cases, transition fallback,
  desktop Chromium, Pixel Chrome, and iPhone WebKit.
- Review evidence: independent architecture, semantic parity, code, test, and
  release-readiness audits found no release blockers. The strict-mode UID edge
  they identified was fixed and covered for primitive and read-only bindings
  before the final test run.
- Production asset verification: Pages deployed `index-CVjaEKRp.js`; the HTML,
  module, stylesheet, `core.js` fallback, and `compatibility.js` fallback all
  returned HTTP 200. The active module requested neither fallback and loaded
  the exact 16-script runtime with shared version `def8134ddd221255`.
- Production browser verification: Pixel Chrome and iPhone WebKit exposed the
  exact 15-name Core namespace and finalized compatibility facade with zero
  page or console errors and no horizontal overflow. A fresh normal session
  also completed the real Supabase bootstrap and displayed the Matcha Luna
  login screen without errors.

## Phase 3B0 contract

Phase 3B0 must preserve the current runtime behavior while changing only how
it starts:

1. `src/main.ts` installs the typed compatibility facade.
2. The loader fetches and executes the classic scripts from `core.js` through
   `boot.js` in their established order.
3. The 175-name legacy namespace is bound and finalized at the old
   `compatibility.js` position.
4. `start.js` runs last.

The existing `boot.js` and `start.js` behavior remains unchanged in this
slice. Any startup consolidation requires a separate regression-tested change.
The former classic `compatibility.js` is not requested by the module bootstrap,
but remains in the artifact for one transition release so a browser holding
pre-3B0 cached HTML can still start safely.

Classic runtime URLs include a content version generated from the copied
runtime. A legacy file change therefore also changes the module bundle and the
query string used to fetch every classic script, preventing stale browser or
Pages caches from mixing releases.

## Invariants

- `/Scoopies/` remains the production base path.
- Exact `PASS 182 tests` legacy baseline.
- Exact 175-name compatibility contract and bidirectional legacy proxies.
- No costing formula, POS, Stocks, authentication, UI, Supabase, RLS, or
  stored-data change in Phase 3B0.
- No service-role key or database password in source, builds, or CI.
- The tested `dist/` is the only Pages deployment artifact.

## Phase 3B0 exit gates

- Clean `npm ci` and zero high-severity audit findings.
- `npm run typecheck`, `npm run build`, and `npm test` exit successfully.
- One hashed Vite module entry and all 17 remaining classic runtime scripts
  return HTTP 200.
- Classic runtime order and shared content version are verified.
- Exact 182-test and 175-name baselines pass.
- Desktop Chromium, Pixel Chrome, and iPhone WebKit pass without page or
  console errors.
- Pull-request and post-merge CI pass.
- Production deploy SHA matches `main`, public assets pass, and the repository
  is clean.

## Rollback

Revert only the failed Phase 3 slice and allow the existing Pages workflow to
redeploy the prior tested artifact. Do not change Supabase or business data for
a frontend migration rollback.

## Phase 3B0 release record

- Pull request: [#5](https://github.com/Lowkiiii/Scoopies/pull/5)
- Implementation commit: `284fa9003a1ff704ae140a1d8a8c5af4f3305512`
- Merge commit: `be5f67168f0fd6473a97d519090c5ad76c3ddeb0`
- PR CI: [41315470480](https://github.com/Lowkiiii/Scoopies/actions/runs/41315470480)
- Main CI and Pages deployment:
  [41315621393](https://github.com/Lowkiiii/Scoopies/actions/runs/41315621393)
- Local verification: Node `24.22.2`; clean `npm ci`; zero audit
  vulnerabilities; type-check and production build passed; 10 Playwright tests
  passed, including the exact 182-test legacy and 175-name compatibility
  baselines, transition fallback, desktop Chromium, Pixel Chrome, and iPhone
  WebKit.
- Production asset verification: Pages reported the merge SHA successfully
  deployed; the entry, hashed module, hashed stylesheet, and transition asset
  returned HTTP 200. Pixel Chrome and iPhone WebKit loaded the exact 17-script
  runtime with shared version `def8134ddd221255`, the finalized 175-name
  facade, zero page or console errors, and no horizontal overflow.
