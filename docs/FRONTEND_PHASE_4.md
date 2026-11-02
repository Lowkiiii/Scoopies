# Frontend Phase 4 — remaining runtime modernization

Frontend Phase 4 continues the incremental typed-runtime migration after the
fully released Phase 3 baseline. It is separate from the historical POS
database Phase 4, which already delivered shifts, close reconciliation,
voids, and reporting on 2026-09-28. Frontend Phase 4 does not reopen or alter
that schema, its RPCs, or production data; see
[`POS_PHASE_4_DEPLOYMENT.md`](POS_PHASE_4_DEPLOYMENT.md).

## Status and authority

- Frontend Phase 3 is released at merge
  `e46cd30fa769b88165548ef9ffc791c10779d34e`, after the Phase 3D
  implementation merge `ddb96e26747736a7aae15d3095380e56ac085b8b`, with
  its evidence recorded
  in [`FRONTEND_PHASE_3.md`](FRONTEND_PHASE_3.md).
- **4A — architecture contract and inventory (released):** merged at
  `0546a5d97fe7e01a465cbc01c2838b7ebd4ba636`; documentation only, with no
  executable source or business behavior changes. Release evidence is below.
- **4B — typed runtime factories (released):** the first executable slice,
  merged at `e353f0078e86029b19f6b02d8e0701b5a7b96f53`. Every applicable gate
  passed and the release evidence is recorded below.
- **4C — typed support utilities (contract defined; implementation pending):**
  the exact backup export/import and example-data boundary is frozen below.
  No executable Phase 4C release is claimed yet.
- Later slices remain bounded by the migration waves below. Each requires its
  own exact API/parity contract before implementation.

## Frozen starting baseline

Every Phase 4 slice must preserve the released Phase 3 baseline unless its
own contract explicitly and safely narrows an active-runtime count:

- Node `24.22.2`, clean dependency installation, and zero high-severity audit
  findings.
- GitHub Pages base path `/Scoopies/`.
- Exact 182-test legacy browser baseline.
- Exact 175-name compatibility contract with
  `window.MatchaLunaApp.contractVersion === 1`.
- Typed domain sizes: Core 15, Costing 24, Stocks 63, and Events 1.
- Exact 12-script active classic runtime and exact 18-script cached/pre-module
  transition.
- Six retained typed-replacement fallbacks: `core.js`, `costing.js`,
  `stocks.js`, `render-stocks.js`, `events.js`, and `compatibility.js`.
- Exact 38-run Playwright matrix across desktop Chromium, Pixel Chrome, and
  iPhone WebKit.
- Explicit dependency audit, type-check, production build, and complete
  browser matrix on both Ubuntu and Windows.
- Pages deployment only from the Ubuntu-tested `dist/`, after both operating
  systems pass.
- Main-only, read-only signed-in production smoke for POS, Stocks,
  Ingredients, Recipes, and Pricing, with business writes blocked at both the
  client RPC and browser-network boundaries.

The exact active classic runtime is:

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

The exact cached/pre-module transition is:

1. `core.js`
2. `runtime-factories.js`
3. `state.js`
4. `costing.js`
5. `pos-catalog.js`
6. `stocks.js`
7. `workspace-sync.js`
8. `pos-operations.js`
9. `publication.js`
10. `render-costing.js`
11. `render-modals.js`
12. `render-pos.js`
13. `render-stocks.js`
14. `support.js`
15. `events.js`
16. `boot.js`
17. `compatibility.js`
18. `start.js`

Bundle hashes and Vite module counts are release evidence, not permanent
invariants: a valid typed migration changes the module graph.

## Goals

- Move the remaining active classic runtime into typed responsibility-focused
  modules through small, independently reversible slices.
- Preserve established browser-root globals and the compatibility facade while
  consumers remain late-bound.
- Keep every replaced classic source file unchanged in the built artifact for
  cached module entries and pre-module HTML.
- Reduce the late-bound global dependency surface without changing observable
  UI, persistence, checkout, costing, inventory, or reporting behavior.
- Keep release, rollback, cross-platform, cached-client, mobile, and signed-in
  production evidence inspectable for every executable slice.

## Non-goals

- No React, Vue, or one-shot framework rewrite.
- No UI redesign or brand change.
- No costing, pricing, checkout, inventory, shift, void, report, backup, or
  synchronization behavior change.
- No Supabase migration, RLS, authentication, storage, RPC, or stored-data
  change.
- No change to the `/Scoopies/` Pages base path, public Supabase client model,
  or compatibility contract version.
- No service-role key, database password, smoke-account credential, or other
  secret in source, build artifacts, logs, screenshots, traces, or reports.

## Dependency model

The remaining runtime is not a clean dependency DAG. It uses late-bound
browser globals after the state hub, so physical script order alone does not
describe every call edge. The durable high-level direction is:

`runtime factories → state hub → POS/catalog/cloud domains → renderers/events → boot → start`

Moving a function earlier or into a module must preserve its live root/domain
binding. Mutation-bearing consumers must not receive captured stale copies.

## Architecture rules

- `src/main.ts` remains orchestration only, and
  `src/legacy/runtime-manifest.ts` remains the authority for active classic
  script order.
- Typed implementation belongs in a responsibility-focused `src/<domain>/`
  directory. Browser exposure belongs in `src/compatibility/register-*.ts`.
- Register typed APIs through `window.MatchaLunaApp.registerModule` at the
  original runtime position.
- Resolve dependencies at call time where classic consumers rely on
  later-defined globals. Browser-root globals must remain accessor-backed live
  bindings, not copied snapshots.
- Preserve classic return values, mutation order, errors, async sequencing,
  DOM behavior, storage keys, RPC payloads, and notices.
- A migration removes only its active-manifest entry. Its classic source stays
  unchanged in `assets/js` and in the built artifact for cached clients.
- Migrate one classic file per implementation pull request by default. A
  larger boundary requires a documented dependency reason and independent
  review before implementation.

## Phase 4A runtime inventory

The 12 active classic scripts contain 3,335 physical lines and 308 top-level
named function declarations at the Phase 4A baseline:

| Order | Script | Lines | Top-level named functions | Responsibility | Risk |
| ---: | --- | ---: | ---: | --- | --- |
| 1 | `runtime-factories.js` | 18 | 4 | Fresh POS and Stocks state-object factories | Low |
| 2 | `state.js` | 543 | 54 | State, normalization, persistence, merge, cloud/realtime, history, auth | Critical |
| 3 | `pos-catalog.js` | 614 | 81 | Checkout/cart, cache/recovery, drift, and product media | High |
| 4 | `workspace-sync.js` | 305 | 18 | Workspace reads, refresh, validation, checkout submission/recovery | Critical |
| 5 | `pos-operations.js` | 774 | 60 | Permissions, operations, history/tally, reports, shifts, voids | Critical |
| 6 | `publication.js` | 253 | 10 | Publication state/RPC and safe product dependency handling | High |
| 7 | `render-costing.js` | 173 | 12 | Ingredients, packaging, recipes, and pricing rendering | Medium |
| 8 | `render-modals.js` | 386 | 46 | Categories, purchased inputs, mixtures, drafts, remote commits | High |
| 9 | `render-pos.js` | 207 | 19 | Catalog cards, cart/payment, receipts, and register gates | Medium–high |
| 10 | `support.js` | 37 | 3 | Backup export/import and example data | Medium |
| 11 | `boot.js` | 24 | 1 | Test/offline/cloud/session startup and initial rendering | Critical |
| 12 | `start.js` | 1 | 0 | Final `boot()` invocation | High blast radius |

Risk reflects mutation authority and dependency blast radius, not code size.
`support.js`, for example, is small but its import/example paths can replace
application state. `start.js` is one line but controls whether the app starts.

## Migration waves

Each item below is a separate contract and release slice unless a later design
review proves a smaller boundary is required:

1. **Pure foundation:** `runtime-factories.js`, then `support.js` with its
   destructive import/example paths separately guarded.
2. **Presentation and publication:** `render-costing.js`, `render-pos.js`, and
   `publication.js` as independent slices.
3. **Modal and catalog islands:** split `render-modals.js` into category/input,
   draft, and mixture-save responsibilities; split `pos-catalog.js` into cart,
   cache/recovery, and media responsibilities.
4. **Cloud and operations:** split `workspace-sync.js` into reads/refresh,
   validation/pending sale, and mutation/recovery; split `pos-operations.js`
   into permissions/modals, read-only history/tally, reports, and shift/void
   mutations.
5. **State and bootstrap closure:** split `state.js` into shape/local
   persistence, reconciliation, cloud/realtime, and auth/history. Migrate
   `boot.js` and `start.js` last.

No wave authorizes a bulk rewrite. A mutation-bearing boundary moves only with
its deterministic retry/recovery behavior and exact regression coverage.

## Phase 4B contract — typed runtime factories

`runtime-factories.js` is the first executable slice because it has no
dependencies or direct side effects. It exposes exactly four pure functions:

| Function | Exact result shape | Current consumers |
| --- | ---: | --- |
| `freshPosOpsModal()` | 29 fields | `state.js`, `pos-catalog.js`, `pos-operations.js` |
| `freshPosSalesHistory()` | 26 fields | `state.js`, `pos-catalog.js`, `pos-operations.js` |
| `freshStockState()` | 12 fields | `state.js`, `pos-catalog.js`, tests |
| `freshStockModal()` | 12 fields | state/catalog, classic and typed Stocks, tests |

Phase 4B must:

1. Add typed interfaces and four pure factory implementations under a small
   runtime/factories module.
2. Publish an exact ordered four-name API and register it as the `runtime`
   compatibility domain before `state.js` executes.
3. Preserve root/domain live reassignment. `state.js` must see replacements
   installed through either surface during startup and later calls.
4. Preserve exact key names, key order, primitive defaults, `null` versus empty
   string, and new-object/new-array identity on every call.
5. Keep the protected compatibility contract at exactly 175 names. Only
   `freshStockState` and `freshStockModal` are contract names; the two POS
   factories remain required operational browser globals without expanding
   that contract.
6. Remove only `runtime-factories.js` from the active classic manifest,
   reducing the exact active runtime from 12 scripts to 11.
7. Retain `assets/js/runtime-factories.js` unchanged in the artifact. The new
   entry must not request it, while cached Phase 3 entries and pre-module HTML
   must continue receiving the original exact 18-script transition.

Phase 4B requires typed-versus-classic deep fingerprints for all four results,
exact field/default order, repeated-call and every-array isolation, root/domain
live reassignment, registration-before-`state.js` proof, exact four-name typed
domain, exact 11-script active runtime, and the retained 18-script cached path
with `runtime-factories.js` returning HTTP 200.

Its browser matrix must become exactly 41 runs: the Phase 4A baseline plus
three desktop-only Runtime tests for exact factory shapes and identity,
typed-versus-classic parity, and registration-before-state replacement paths.
The 182-test legacy and 175-name compatibility baselines remain unchanged.

## Phase 4C contract — typed support utilities

`support.js` is the next executable slice. It exposes exactly three functions,
but it is not a pure utility file: import and example-data flows can replace
costing state, and `exampleData()` writes the new state before pricing it.

| Function | Exact return | Responsibility |
| --- | --- | --- |
| `exportData()` | `undefined` | Download the live costing state as formatted JSON |
| `handleFileImport(event)` | `undefined` | Parse one selected backup and delegate safe replacement |
| `exampleData()` | new `CostingState` | Build, assign, price, and return the cookie example graph |

Phase 4C must:

1. Add responsibility-focused typed Support modules and publish the exact
   ordered API `exportData`, `handleFileImport`, `exampleData`.
2. Register that API as `window.MatchaLunaApp.domains.support` after the typed
   Stocks view and before Events registration and installation. All three
   browser-root properties and the Support namespace must remain writable,
   accessor-backed live bindings.
3. Keep the compatibility contract at version 1 with exactly 175 protected
   names. None of the three Support functions joins that protected list.
4. Remove only `support.js` from the active classic manifest, reducing the
   exact active runtime from 11 scripts to 10. Retain the unchanged classic
   file in `assets/js` and the exact 18-script cached/pre-module transition.
   The frozen fallback Git blob is
   `7385c19d6fabcfaea9293379c41755982567fa3b`.
5. Preserve all dependency lookup at call time, including inside the deferred
   file-reader callback. Required live dependencies include `state`,
   `APP_BRAND_NAME`, `APP_BRAND_SLUG`, `replaceCostingStateSafely`, `uid`,
   `productCost`, `suggestedPrice`, and `ceilTo`, plus the relevant browser
   constructors and APIs.

`exportData()` must preserve the exact two-space `JSON.stringify` output,
`application/json` Blob type, `<live slug>-backup.json` filename, detached
anchor click, immediate revocation of that exact object URL, and `undefined`
return. It must not save, sync, log, or mutate state.

`handleFileImport(event)` must preserve all current branches and ordering:

- Ignore targets whose ID is not `importFile`, and return when no first file is
  selected.
- Construct a `FileReader`, assign its `load` callback, and call `readAsText`
  with only `files[0]`.
- Parse inside the callback and require only a truthy value whose
  `ingredients` field is an array. No stricter schema, file-type, or file-size
  validation belongs in this parity slice.
- Pass the parsed object unchanged to the live replacement binding with exact
  activity text `Imported a backup file`. Show `Backup imported successfully.`
  only when replacement returns truthy.
- Convert parse, validation, replacement, and success-alert exceptions to
  `Could not read that file: <message>`, then clear the input value.
- Keep reader construction and `readAsText` outside that callback `try/catch`.
  Synchronous read failures still propagate without clearing the input; no new
  reader `error` or `abort` behavior is introduced.

`exampleData()` must preserve the exact graph, property order, and mutation
sequence:

- Call the live `uid()` exactly 17 times in the current order to create one
  category, four purchased ingredients, three packaging items, one recipe,
  four recipe lines, one product, and three packaging lines.
- Create the exact raw top-level order `schemaVersion`,
  `ingredientCategories`, `ingredients`, `mixtureDrafts`, `packaging`,
  `recipes`, `products`, including the current legacy `qty` fields and values.
- Assign the new object to live global `state` before calling
  `productCost(product)`, then call `suggestedPrice(cost, 60)`, test the result
  with live `isFinite`, and call `ceilTo(result, 5)` only for a finite result.
  The current real-costing result is `55`; a non-finite result stores `''`.
- Return the exact same object reference assigned to global `state`. Repeated
  calls must build isolated objects and arrays.

The signed-in example-data block, exact warning, confirmation prompt, and
pending-remote handling stay in Events. Import continues to delegate state
normalization, inventory identity/dimension protection, save, and rendering to
the existing typed Stocks replacement path. Phase 4C does not authorize UI,
auth, Supabase, RPC, storage, schema, cloud, or business-data changes.

Phase 4C adds exactly four desktop-only Playwright tests, taking the full
matrix from 41 to 45 runs: 37 desktop Chromium, 4 Pixel Chrome, and 4 iPhone
WebKit. They must prove:

1. The exact Support API/order/descriptors, registration point, bidirectional
   live reassignment, exact 10-script active path, exact 18-script cached path,
   unchanged fallback, and HTTP 200 fallback delivery.
2. Typed-versus-classic export traces: exact JSON, Blob type, filename,
   click/revoke order, return value, live dependencies, and zero persistence
   mutation.
3. Typed-versus-classic import traces: irrelevant/no-file no-ops, first-file
   selection, success, safe-replacement rejection, malformed/invalid data,
   thrown replacement, exact alerts, input reset, synchronous read failure,
   and dependency reassignment between `readAsText` and `load`.
4. Typed-versus-classic example fingerprints: key/ID/reference order, 17 live
   IDs, state-before-costing timing, price `55`, non-finite pricing, repeated
   isolation, and signed-in/offline Events guards with exact prompt and notice.

The exact 182-test legacy and 175-name compatibility baselines remain
unchanged. The signed-in production smoke may verify the read-only Support
domain, but must not invoke import or example-data actions against production.

## Universal executable-slice gates

Every executable Phase 4 slice must pass all of the following before release:

- Clean `npm ci`, `npm audit --audit-level=high`, type-check, production build,
  and the complete browser matrix.
- Exact 182-test legacy and 175-name compatibility baselines.
- Exact typed-domain APIs, classic-versus-typed parity, live-binding, stale
  response, deterministic retry/recovery, and cached-client checks relevant to
  the slice.
- Desktop Chromium, Pixel Chrome, and iPhone WebKit with zero page/console
  errors, failed requests, or horizontal overflow.
- Pull-request and post-merge CI on Ubuntu and Windows.
- Pages deployment from only the tested artifact after both operating systems
  pass.
- Live HTML/module/stylesheet, active order, retained fallback, facade/domain,
  and 390-pixel browser verification against the exact downloaded CI artifact.
- Successful guarded signed-in production smoke through the main-only
  `production-smoke` environment.
- Independent scope, architecture, parity, test, security, cached-client,
  mobile, and final-diff review proportional to the slice risk.
- Release evidence recorded before the next slice begins.

The matrix is exactly 38 runs at the Phase 4A baseline. A later slice may add
documented coverage, but no slice may remove or silently change coverage.

After the tested `main` artifact is live, manually run the protected
`production-smoke` workflow on `main`. It must use only the configured
environment secrets, exercise the signed-in application through normal
read-only flows, block all business-data writes, and retain no credentials,
screenshots, traces, videos, or business-data artifacts. A missing credential,
page error, failed request, server error, or attempted write must fail the run.

## Rollback

Revert only the failed frontend slice and allow the repository Pages workflow
to redeploy the prior tested artifact. Do not change Supabase, RLS, auth,
storage, RPCs, or business data for a frontend migration rollback. Retained
classic files remain the compatibility source; do not edit them during their
typed replacement slice.

## Phase 4A exit gates (complete)

- This architecture contract records the exact Phase 3 baseline, remaining
  runtime inventory, dependency shape, migration waves, universal release
  gates, and rollback.
- The exact Phase 4B factory boundary and parity requirements are frozen before
  implementation.
- README links to this contract and distinguishes frontend modernization from
  the already-released historical POS Phase 4.
- No executable source, UI, Supabase, or business-data behavior changes.
- Pull-request and post-merge Ubuntu/Windows CI, Pages deployment, exact live
  artifact verification, and guarded signed-in production smoke pass.
- Phase 4A release evidence is recorded and the repository is clean and
  synchronized on `main` before Phase 4B begins.

Every Phase 4A gate above passed before the phase was marked released.

## Phase 4A release record

- Pull request: [#19](https://github.com/Lowkiiii/Scoopies/pull/19)
- Documentation commit: `2db8d506d6650a9d0740a6c58e82065adfa6fb69`
- Merge commit: `0546a5d97fe7e01a465cbc01c2838b7ebd4ba636`
- PR CI:
  [41440147588](https://github.com/Lowkiiii/Scoopies/actions/runs/41440147588)
- Main CI and Pages deployment:
  [41440417099](https://github.com/Lowkiiii/Scoopies/actions/runs/41440417099)
- Signed-in production smoke:
  [41440965740](https://github.com/Lowkiiii/Scoopies/actions/runs/41440965740)
- Local verification: Node `24.22.2`; clean `npm ci`; zero audit
  vulnerabilities; type-check and 48-module production build passed; all 38
  Playwright runs passed, including the exact 182-test legacy and 175-name
  compatibility baselines, typed domain sizes Core 15, Costing 24, Stocks 63,
  and Events 1, the active 12-script runtime, and the cached 18-script
  transition.
- Cross-platform evidence: the complete PR and post-merge matrices passed on
  both Ubuntu and Windows. Pages packaged only the verified Ubuntu `dist/`
  after both operating-system jobs passed.
- Review evidence: independent runtime-inventory, architecture-contract, and
  corrected final-diff audits found no blocker. The final Phase 4A diff changed
  only `README.md` and this document.
- Production artifact verification: all 22 files in the downloaded tested CI
  artifact returned HTTP 200 from GitHub Pages and matched live content after
  line-ending normalization. Pages served `index-C5s08f5g.js` and
  `index-B0B7i9SZ.css`; all 12 active scripts, all six retained typed
  fallbacks, and the browser-test asset matched the tested artifact.
- Production browser verification: a fresh 390-pixel Chromium session loaded
  the exact active 12-script order, finalized the 175-name contract, exposed
  typed domain sizes 15/24/63/1, displayed at 390/390 width, and reported zero
  page errors, console errors, or failed requests.
- Signed-in verification: the protected main-only smoke loaded the real POS,
  Stocks, Ingredients, Recipes, and Pricing views. Client and network guards
  allowed no business-data write to escape and retained no credentials,
  screenshots, traces, videos, or business-data artifacts.

## Phase 4B exit gates (complete)

- Typed interfaces and exact implementations for all four runtime factories
  are registered synchronously before `state.js`.
- Exact key order, primitive defaults, `null` values, fresh-object identity,
  and every-array isolation match the retained classic implementation.
- Root/domain reassignment remains live during startup and later POS/Stocks
  calls; the compatibility contract remains version 1 with exactly 175 names.
- The active classic runtime is exactly 11 scripts and does not request
  `runtime-factories.js`. The exact cached/pre-module transition remains 18
  scripts and still serves the unchanged fallback with HTTP 200.
- The exact 182-test legacy baseline, 175-name compatibility baseline, and
  41-run cross-browser matrix pass locally and in Ubuntu/Windows CI.
- The tested `main` artifact is live, matches GitHub Pages, passes 390-pixel
  browser verification, and passes the guarded signed-in production smoke.
- Independent parity, scope, and test audits found no blocker. No UI, auth,
  Supabase, RPC, storage, schema, or business-data behavior changed.

Every Phase 4B gate above passed before the phase was marked released.

## Phase 4B release record

- Pull request: [#21](https://github.com/Lowkiiii/Scoopies/pull/21)
- Implementation commit: `de80a0a86de930b78d7a20417dea9931497cfe96`
- Merge commit: `e353f0078e86029b19f6b02d8e0701b5a7b96f53`
- PR CI:
  [41443094933](https://github.com/Lowkiiii/Scoopies/actions/runs/41443094933)
- Main CI and Pages deployment:
  [41443354676](https://github.com/Lowkiiii/Scoopies/actions/runs/41443354676)
- Signed-in production smoke:
  [41443817387](https://github.com/Lowkiiii/Scoopies/actions/runs/41443817387)
- Local verification: Node `24.22.2`; clean `npm ci`; zero audit
  vulnerabilities; strict type-check and 51-module production build passed;
  all 41 Playwright runs passed (33 desktop Chromium, 4 Pixel Chrome, and 4
  iPhone WebKit), including the exact 182-test legacy and 175-name
  compatibility baselines.
- Runtime verification: the exact ordered Runtime API contains
  `freshPosOpsModal`, `freshPosSalesHistory`, `freshStockState`, and
  `freshStockModal`; typed domain sizes are Core 15, Runtime 4, Costing 24,
  Stocks 63, and Events 1. Exact typed/classic fingerprints, repeated-call and
  every-array isolation, startup replacement, bidirectional live reassignment,
  and real later POS/Stocks callers passed.
- Cross-platform evidence: the complete PR and post-merge matrices passed on
  both Ubuntu and Windows. Pages packaged only the verified Ubuntu `dist/`
  after both operating-system jobs passed.
- Production artifact verification: all 22 files in the downloaded tested CI
  artifact returned HTTP 200 from GitHub Pages and matched live content after
  line-ending normalization. Pages served `index-C-zaYPZI.js` and
  `index-B0B7i9SZ.css`; the exact 11-script active runtime did not request the
  classic factory file, while the exact 18-script cached transition and
  unchanged `runtime-factories.js` fallback matched the tested artifact.
- Production browser verification: a fresh 390-pixel Chromium session loaded
  the exact active order, finalized the version-1 175-name contract, exposed
  typed domain sizes 15/4/24/63/1, displayed at 390/390 width, and reported
  zero page errors, console errors, or failed requests.
- Signed-in verification: the protected main-only smoke loaded the real POS,
  Stocks, Ingredients, Recipes, and Pricing views. Client and network guards
  allowed no business-data write to escape and retained no credentials,
  screenshots, traces, videos, or business-data artifacts.
- Review evidence: independent parity, scope, and test audits found no blocker.
  The implementation changed only the typed runtime boundary, its
  compatibility registration, manifest entry, tests, and documentation; the
  retained classic fallback remained byte-identical.

No later Phase 4 executable slice is released until its exact API and parity
contract is frozen and all applicable gates have recorded evidence.
