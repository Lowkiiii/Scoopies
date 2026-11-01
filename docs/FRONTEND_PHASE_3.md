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
- **3B2 — typed Costing (in progress):** ingredients, mixtures, recipes,
  packaging, product costing, publication snapshots, and validation.
- **3C — typed Stocks island:** stock domain logic, gateway, pending recovery,
  controller, view, and events.
- **3D — closure:** clean Windows and CI test exits, signed-in production
  smoke, release evidence, and the final Phase 3 baseline.

Phase 4 does not begin until every slice above is complete.

## Phase 3B2 contract (in progress)

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

## Phase 3B2 exit gates (pending)

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

No Phase 3B2 release or deployment is claimed until every gate has recorded
evidence.

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
