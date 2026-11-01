# Frontend Phase 3 — typed runtime migration

Frontend Phase 3 moves selected application domains from ordered classic
scripts into typed modules without changing Matcha Luna's business behavior,
data, or user interface. It is separate from the historical POS database
phases.

## Frozen scope

- **3A — build and release foundation:** released at merge `c3f24d6`.
- **3B0 — module bootstrap:** one Vite module entry installs the compatibility
  facade and loads the remaining classic runtime in its protected order.
- **3B1 — typed Core:** units, money, identity, and serialization helpers.
- **3B2 — typed Costing:** ingredients, mixtures, recipes, packaging, product
  costing, publication snapshots, and validation.
- **3C — typed Stocks island:** stock domain logic, gateway, pending recovery,
  controller, view, and events.
- **3D — closure:** clean Windows and CI test exits, signed-in production
  smoke, release evidence, and the final Phase 3 baseline.

Phase 4 does not begin until every slice above is complete.

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

- Pull request: pending
- Merge commit: pending
- CI and Pages run: pending
- Local verification: Node `24.22.2`; clean `npm ci`; zero audit
  vulnerabilities; type-check and production build passed; 10 Playwright tests
  passed, including the exact 182-test legacy and 175-name compatibility
  baselines, transition fallback, desktop Chromium, Pixel Chrome, and iPhone
  WebKit.
- Production asset verification: pending
