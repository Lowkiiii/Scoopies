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
- **4C — typed support utilities (released):** the exact backup export/import
  and example-data boundary merged at
  `c576aca099a72a9ebae5814b4b223088107bdaaa`. Every applicable gate passed
  and the release evidence is recorded below.
- **4D — typed costing presentation (released):** the exact shared helpers and
  Ingredients, Packaging, Recipes, and Pricing render boundary merged at
  `659b9b9e6de5e05927571867dd7de4f202314c29`. Every applicable gate passed
  and the release evidence is recorded below.
- **4E — typed POS presentation (released):** the exact catalog, cart,
  payment, receipt, register-status, and interaction-preservation boundary
  merged at `b6d8f217a606adcce814b0ddba65730a150fae5c`. Every applicable gate
  passed and the release evidence is recorded below.
- **4F — typed POS publication (released):** the exact publication status,
  modal, RPC, safe product deletion, and ingredient-dependency contract merged
  at `4b88c5b34113180e7d32d81c3fd90e9f30b3cddd`; its bounded implementation
  merged at `02e7465c2ac91bbe8d8fd3c6e2fc0016a774438c`. Every applicable gate
  passed and the release evidence is recorded below.
- **4G — typed modal workflows (released):** the exact shared modal, category,
  purchased-input, mixture-session, draft, editor, validation, and mixture-
  commit contract merged at `de93f927a3764c04ba35b5a9479e4cd8f3df4e3f`;
  its bounded implementation merged at
  `06260c0a80c75e614e92998791725beed192a835`. Every applicable gate passed and
  the release evidence is recorded below.
- **4H — typed POS catalog workflows (released):** the exact catalog, cart,
  cache, pending-sale recovery, catalog-drift, drink-media, image-editor, and
  media-recovery contract merged at
  `6ff7ac937f9e024e18b21c7c5639d4f2305c3ffb`; its bounded implementation merged
  at `20fe020d14476434d0815f74f1ef7cee0a55d5fe`. Every applicable gate passed
  and the release evidence is recorded below.
- **4I — typed workspace sync (implementation candidate):** the exact workspace
  request, context, checkout loading, refresh coordination, validation,
  pending-sale, submission, and recovery contract merged at
  `eab6a3768381ded845827db51f9b63b4766283ea`. This bounded candidate
  implements that contract without a UI, backend, schema, RPC, auth, storage,
  business-rule, or production-data change.
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

## Phase 4D contract — typed costing presentation

`render-costing.js` is the next executable slice. It has no direct network,
Supabase, storage, authentication, persistence, or event-listener authority,
but its boundary is wider than the four visible costing pages: later classic
and typed code also consumes its shared escaping and option helpers. The whole
file therefore moves atomically as this exact ordered 13-binding API:

| Binding | Exact return/effect | Responsibility |
| --- | --- | --- |
| `unitOptions` | mutable `['g','kg','ml','l','piece']` | Shared costing unit choices |
| `optionList(arr, selected, useObj)` | HTML string | Primitive or object `<option>` list |
| `escapeHtml(value)` | escaped string | Escape exactly `&`, `<`, `>`, and `"` |
| `categoryOptions(selected)` | HTML string | Category choices with Uncategorized first |
| `ingredientOptions(selected, list)` | HTML string | Purchased and prepared-mixture groups |
| `selectedRealCategory()` | category or `null` | Resolve the selected non-special category |
| `ingredientMatchesView(ingredient)` | boolean | Apply folder and search filters |
| `renderCategoryBar()` | `undefined` | Normalize the filter and replace category chips |
| `renderIngredients()` | `undefined` | Replace search status and Ingredients table |
| `renderPackaging()` | `undefined` | Replace the Packaging table |
| `renderRecipes()` | `undefined` | Replace the Recipes cards and line tables |
| `recipeBreakdownHtml(recipe)` | HTML string | Per-serving ingredient breakdown |
| `renderProducts()` | `undefined` | Replace Pricing cards, metrics, and publication status |

Phase 4D must:

1. Add responsibility-focused typed helper and renderer modules and append the
   exact ordered 13-name API above to the existing Costing namespace. The
   Costing domain grows from exactly 24 to exactly 37 names; existing names
   and their order stay unchanged.
2. Register the added Costing descriptors at the original runtime position:
   after classic `publication.js` and before classic `render-modals.js` and
   `render-pos.js`. Costing-domain values remain writable; every matching
   browser-root property remains accessor-backed, with bidirectional live
   reassignment.
3. Keep the compatibility contract at version 1 with exactly 175 protected
   names. `renderIngredients` and `renderProducts` remain its only protected
   names from this slice; the other 11 bindings do not join that list.
4. Remove only `render-costing.js` from the active classic manifest, reducing
   the exact active runtime from 10 scripts to 9. Retain the classic file
   unchanged in `assets/js` and in the exact 18-script cached/pre-module
   transition. Its frozen fallback Git blob is
   `2ac06eb5e370e4026393ff3623b0dd59ed39117d`; the SHA-256 of those exact
   Git-blob bytes is
   `FA9B4020D890BCD0AE5D9C4249213A182C2B3563D23C40BCD0B33440DBE2E04E`.
5. Preserve every dependency lookup and expression order at call time. Live
   root dependencies include `state`, `ingredientUi`, `document`, `String`,
   `isFinite`, `UNIT_TYPE`, `TYPE_UNITS`, `getById`, `num`, `peso`, `pct`,
   `ceilTo`, all relevant Costing functions, every sibling in the 13-name API,
   and the later-defined `posPublicationHtml`.

The helper contract must preserve the current coercion and selection rules:

- `escapeHtml` converts only nullish values to an empty string, calls the live
  `String`, escapes only `&`, `<`, `>`, and `"`, and leaves apostrophes alone.
- `optionList` uses string equality for selection, while category and
  ingredient branches retain their current strict-identity comparisons.
  Object-mode labels retain the exact `label || '(unnamed)'` fallback.
- `ingredientOptions` retains `list || state.ingredients`, purchased-before-
  mixture grouping, exact optgroup labels, and the direct live `isMixture`
  callback behavior.
- Category and search matching retains its exact special-folder rules,
  trimming and lower-casing, category-name search, component-name search, and
  missing-source behavior.

The renderer contract must preserve exact HTML, text, attributes, classes,
inline styles, ARIA labels, Unicode, row order, calculations, and exceptions:

- `renderCategoryBar` resets a missing selected category to `all` before its
  optional `#categoryBar` early return. No other application-state mutation is
  authorized.
- `renderIngredients` treats search and status nodes as optional but still
  requires `#ingTable`; its unfiltered count retains the current leading
  space. Purchased fallbacks retain `!= null`, preserving zero before legacy
  `qty` fallback.
- Packaging, Recipes, and Pricing roots remain required and keep their current
  natural missing-node errors. Empty and populated wording and all
  `data-entity`, `data-id`, `data-idx`, `data-line-id`, `data-field`, and
  `data-act` surfaces remain exact.
- Mixture validity, missing ingredients/recipes/packaging, blank and non-finite
  values, negative profit, percentage and suggested-price branches, repeated
  helper evaluation, and publication-status rendering remain unchanged.
- Some inherited recipe, product, and packaging IDs currently enter HTML
  without additional escaping. This parity migration must not silently change
  identifier semantics; any hardening requires a separately reviewed slice.
- Rendering must not call save, history, storage, fetch, Supabase, RPC, auth,
  cloud synchronization, or any business-data mutation. Apart from the invalid
  category reset above, state and persistence snapshots remain unchanged.

Phase 4D adds exactly three desktop-only parity tests plus one costing-view
mobile test that runs in all three projects. The complete matrix becomes
exactly 51 runs: 41 desktop Chromium, 5 Pixel Chrome, and 5 iPhone WebKit.
They must prove:

1. Exact API order/descriptors, 24-to-37 Costing-domain growth, root/domain
   reassignment, original registration slot, exact 9-script active path,
   exact 18-script cached path, unchanged fallback, and HTTP 200 delivery.
2. Typed-versus-classic helper fingerprints for primitive, object, nullish,
   unnamed, escaped, grouped, selected, filtered, coercive, and mutable-unit
   cases, including exact dependency lookup and failure order.
3. Typed-versus-classic DOM fingerprints for empty, populated, filtered, and
   invalid-category fixtures across category controls, search status,
   Ingredients, Packaging, Recipes, recipe breakdown, Pricing metrics, and
   publication HTML, including exact return and missing-node behavior.
4. At desktop and 390-pixel-class widths, all four costing tabs remain
   reachable without document overflow; wide tables remain contained in their
   scroll regions, key controls retain nonzero reachable rectangles, and the
   browser reports no page errors, console errors, or failed requests.

The exact 182-test legacy and 175-name compatibility baselines remain
unchanged. The guarded signed-in production smoke may open and inspect all
four costing tabs, but must not submit a field, invoke an action, or permit any
business-data write.

## Phase 4E contract — typed POS presentation

`render-pos.js` is the next executable slice. It contains presentation helpers
and four narrowly bounded browser interactions, but it does not submit a sale,
open or close a shift, void a receipt, refresh a workspace, authenticate, or
directly access network, Supabase, RPC, storage, or persistence surfaces. The
already-typed `renderPos()` remains in the Stocks view boundary. This file moves
atomically as the exact ordered 19-binding API below:

| Binding | Exact return/effect | Responsibility |
| --- | --- | --- |
| `posPaymentLabel(method)` | label string | Map GCash, GoTyme, and default Cash labels |
| `posSummaryHtml()` | HTML string | Current report-mode sales metrics |
| `posReceiptHtml()` | HTML string | Last recorded receipt card |
| `posProductCardHtml(item, locked)` | HTML string | Catalog drink card and cart-version state |
| `posCatalogHtml()` | HTML string; may normalize category | Catalog groups, filters, empty/error states |
| `posCashSuggestions(total)` | fresh candidate array | Exact and rounded tender choices |
| `updatePosPaymentPreview()` | `undefined`; DOM-only update | Change, error, and review-button preview |
| `posCartHtml()` | HTML string | Cart, payment, confirmation, and recovery panel |
| `posSalesRowsHtml(sales, allowVoid)` | HTML string | Receipt/history rows and optional void control |
| `posRecentHtml()` | HTML string | Recent-sales loading, empty, or row state |
| `posShiftBarHtml()` | HTML string | Open-shift or pending-recovery status |
| `posNoShiftGateHtml()` | HTML string | Register verification and start-selling gate |
| `managePosMenu()` | boolean | Permission-gated Pricing navigation and focus |
| `posWorkspaceHtml()` | HTML string | Catalog and current-order workspace |
| `posMobileOrderBarHtml()` | HTML string | Mobile cart shortcut and total |
| `focusPosCart()` | boolean | Scroll and focus the current-order panel |
| `posSyncStatusHtml()` | HTML string | Register synchronization status |
| `posCriticalRefreshNoticeHtml()` | HTML string | Preserved-order refresh warning |
| `renderPosPreservingInteraction()` | `undefined` | Rerender and restore focus/caret identity |

Phase 4E must:

1. Add responsibility-focused POS view bindings, renderer, interaction, and
   API modules and register the exact ordered 19-name API above as a new `pos`
   namespace. The existing typed Stocks-domain `renderPos` and `renderAll`
   remain outside this slice.
2. Register the new POS descriptors at the original runtime position: after
   classic `render-modals.js` and before the existing typed Stocks-view
   registration. POS-domain values are configurable, enumerable, and writable;
   every matching browser-root property remains an accessor-backed live
   binding with bidirectional reassignment.
3. Preserve domain order Core, Runtime, Costing, Stocks, POS, Support, Events,
   Legacy, with exact typed domain sizes `15 / 4 / 37 / 63 / 19 / 3 / 1`.
   Compatibility remains version 1 with exactly 175 names. None of the 19 POS
   presentation names joins the protected compatibility-name list.
4. Remove only `render-pos.js` from the active classic manifest, reducing the
   exact active runtime from 9 scripts to 8. Retain the classic file unchanged
   in `assets/js` and in the exact 18-script cached/pre-module transition. Its
   frozen fallback Git blob is
   `4b40f2e9d57d1f5b11debe8bab95883d30e5df3c`; its canonical LF SHA-256 is
   `AF0676AD15E53099F1F9B526FE9340A63C9A88671191E793AA56CE4EA34FDE12`.
5. Preserve every dependency lookup and expression order at call time. Live
   root dependencies include `posCheckout`, `posOpsModal`, `document`, `Array`,
   `Date`, `Math`, `Number`, `String`, the later-defined typed `renderPos`,
   escaping/money/mode helpers, cart and catalog helpers, permission and image
   helpers, modal/navigation/focus helpers, and every relevant sibling in this
   19-name API.

The HTML/value contract must preserve current text, Unicode, markup, classes,
attributes, inline styles, ARIA, ordering, truthiness, coercion, and errors:

- Unknown or missing payment methods still fall through to `Cash`; GCash and
  GoTyme retain their exact casing. All native `Number`, `String`, `Math`, and
  `Date` calls remain live and retain current thrown/coercive behavior.
- Cash suggestions preserve the original `total` value and type as the first
  eligible candidate, plus the next ₱50 and fixed ₱100, ₱200, ₱500, and ₱1,000
  candidates in centavos. Current coercive eligibility, filtering,
  deduplication, ordering, and the exact first-four slice remain unchanged.
- Catalog loading and error branches return before category normalization.
  The current fixed Matcha/Hojicha grouping, conditional category chips,
  category normalization, empty/setup permissions, stale-version review badge,
  selected quantity, disabled state, drink image, price, and accessible labels
  remain exact.
- Summary, receipt, cart, recent-sales, shift, gate, workspace, mobile shortcut,
  sync, and refresh-warning branches retain exact empty/loading/error/recovery,
  Live/Training, cash/GCash/GoTyme, stale/locked/pending/confirming, profit/void,
  permission, locale-date, centavo, repeated-helper, and missing-value behavior.
- Some inherited values currently enter classes or markup through existing
  helpers and branches. This parity migration must not silently change escaping
  or identifier semantics; any hardening requires a separately reviewed slice.

The four interaction paths must retain their exact side effects and failure
boundaries:

- `updatePosPaymentPreview` updates only the existing change element,
  conditionally clears `.pos-error.textContent` when both that node and
  `posCheckout.error` are truthy, and updates the review-button disabled state.
  It does not clear `posCheckout.error`; validation remains after the preceding
  DOM work.
- `managePosMenu` short-circuits on permission failure, conditionally closes an
  open operations modal, activates Pricing, then schedules publication-control
  focus. Its exact boolean returns and call order remain unchanged.
- `focusPosCart` returns `false` when the panel is absent. Otherwise it scrolls
  with the current options, attempts focus with `preventScroll`, falls back to
  plain focus only for the first failure, and returns `true`; a second focus
  failure may still propagate.
- `renderPosPreservingInteraction` captures only a control inside `#posRoot`,
  including the current `tagName` read stored as the otherwise-unused `tag`,
  calls the live later-defined `renderPos` exactly once, and restores by ID or
  the exact action/ID/method/centavos/mode signature. Missing or disabled
  replacements, nested focus fallbacks, swallowed focus/selection errors,
  selection indices, and return values remain exact.

No Phase 4E renderer or interaction may call checkout, shift, void, refresh,
save, history, fetch, Supabase, RPC, auth, cloud synchronization, storage, or
business-data mutation. The only allowed application-state effect is the
existing indirect category normalization inside `posCatalogHtml`; other
allowed effects are the exact DOM, modal, tab, scroll, focus, and selection
operations documented above.

Phase 4E adds exactly three desktop-only parity tests plus one POS-view mobile
test that runs in all three projects. The complete matrix becomes exactly 57
runs: 45 desktop Chromium, 6 Pixel Chrome, and 6 iPhone WebKit. They must prove:

1. Exact API order/descriptors, new 19-name POS domain, root/domain
   reassignment, original registration slot, exact 8-script active path, exact
   18-script cached path, unchanged fallback/hash, and HTTP 200 delivery.
2. Typed-versus-classic exact value and HTML fingerprints for payment,
   summary, receipt, catalog, cash suggestions, cart, sales, shift, workspace,
   mobile bar, sync, and warning branches, including live dependency access,
   explicit call-time/no-eager-capture traces for `document`, `Array`, `Date`,
   `Math`, `Number`, and `String`, category normalization, coercion, locale,
   repeated calls, failure order, and unchanged state/persistence snapshots
   apart from that allowed normalization.
3. Typed-versus-classic return, trace, DOM, call-order, error, focus, scroll,
   rerender lookup, disabled-control, and caret behavior for all four
   interaction functions and their missing-node/fallback cases. Downstream
   integration and live reassignment must reach typed Stocks `renderPos`, typed
   Events consumers, classic `workspace-sync.js`, and classic
   `pos-operations.js` through both root and POS-domain surfaces.
4. At desktop, Pixel, and iPhone widths, a realistic Matcha/Hojicha catalog,
   cart, payment, confirmation/recovery, receipt, category, mobile-order, and
   recent-sales view remains contained and reachable with no document overflow,
   page/console error, failed request, server error, storage mutation, fetch,
   RPC/query, cloud-storage access, or business action. The test must seed and
   assert installed guards for fetch, Storage `setItem`/`removeItem`/`clear`,
   client `rpc`/`from`, and `storage.from`; zero-call assertions may not pass
   through an absent client or uninstalled guard.

The exact 182-test legacy and 175-name compatibility baselines remain
unchanged. The guarded signed-in production smoke may inspect the real POS and
its payment controls, but must not add an item, edit payment input, submit a
sale, open/close a shift, void a receipt, refresh, or permit any business-data
write.

### Phase 4E implementation status (released)

- The exact ordered 19-name POS presentation API is implemented in typed,
  responsibility-focused modules and registered after classic
  `render-modals.js` and before the existing typed Stocks-view registration.
- The active manifest omits only `render-pos.js`, leaving exactly eight classic
  scripts. The unchanged file remains in `assets/js` and in the exact
  18-script cached/pre-module transition.
- The POS namespace is separate from the existing Stocks-domain `renderPos`
  and `renderAll` functions, and all root, sibling, state, helper, browser
  native, and later-defined dependencies remain call-time live bindings.
- The clean-install, audit, type-check, build, 57-run browser matrix,
  production artifact, 390-pixel browser, signed-in smoke, and independent
  review gates passed; the exact release evidence is recorded below.

## Phase 4F contract — typed POS publication

`publication.js` is the next executable slice. It is a high-risk authority
boundary: it renders publication state, coordinates the publish modal and its
transaction state, calls the existing versioned publish RPC, protects deletion
of published costing products, and supplies the recursive dependency check used
by the later classic mixture modal. It has no eager top-level business effect.
The file moves atomically as the exact ordered 10-binding API below:

| Binding | Exact return/effect | Responsibility |
| --- | --- | --- |
| `publicationStatusFor(product)` | publication status object | Compare live costing with the active frozen POS version |
| `posPublicationHtml(product)` | HTML string | Pricing-page publication status, permission, and action row |
| `openPublishProductModal(id)` | boolean | Validate readiness and open a frozen publish review |
| `closePublishProductModal()` | boolean | Close, restore focus, and apply a pending remote update |
| `renderPublishProductModal()` | `undefined` | Render the exact snapshot, validation, progress, and actions |
| `waitForCostingSync(timeoutMs)` | promise | Wait for a saved costing state or reject deterministically |
| `publishProductToPos()` | promise of boolean | Guard and submit one versioned publication request |
| `explainPublishedProductDelete(product)` | `undefined` | Explain why an active published product cannot be deleted |
| `deleteCostingProduct(id)` | promise of boolean | Reverify publication authority before local costing deletion |
| `ingredientDependsOn(startId, targetId, seen, lookup)` | boolean | Detect direct, nested, and cyclic mixture dependencies |

Phase 4F must:

1. Add responsibility-focused Publication bindings, status, modal, operation,
   dependency, and API modules. Register the exact ordered 10-name API above as
   a new `publication` namespace. `ingredientDependsOn` stays in this atomic
   compatibility boundary even though it is Costing-adjacent; extracting it is
   not authorized while the classic file remains a fallback.
2. Register Publication at the original runtime position: after classic
   `workspace-sync.js` and `pos-operations.js`, and before the existing typed
   Costing-view registration. Publication-domain values are configurable,
   enumerable, and writable; every matching browser-root property remains an
   accessor-backed live binding with bidirectional reassignment.
3. Preserve domain order Core, Runtime, Costing, Stocks, Publication, POS,
   Support, Events, Legacy, with exact typed domain sizes
   `15 / 4 / 37 / 63 / 10 / 19 / 3 / 1`. Compatibility remains version 1 with
   exactly 175 names. Exactly `closePublishProductModal`,
   `deleteCostingProduct`, `openPublishProductModal`, and
   `publishProductToPos` are already protected compatibility names; Phase 4F
   neither adds nor removes a protected name.
4. Remove only `publication.js` from the active classic manifest, reducing the
   exact active runtime from 8 scripts to 7. Retain the classic file unchanged
   in `assets/js` and in the exact 18-script cached/pre-module transition. Its
   frozen fallback Git blob is
   `49d4ec24d9fecf986ce7d4f373acd339ac483ca7`; its canonical LF SHA-256 is
   `78BD373602F683259C1E5CF166B21084F21D2E19E83687CAF7C4C0307AFFE1B5`.
5. Preserve every sibling, state, native, DOM, cloud, and later-defined helper
   lookup at call time. Publication siblings resolve through the live
   Publication namespace; external dependencies resolve through the live
   browser root. No dependency may be captured eagerly during registration.

The publication status and modal contract must preserve the current text,
Unicode, markup, classes, attributes, ARIA, ordering, native coercion, thrown
errors, and side effects:

- Status comparison retains the exact archived, invalid, unpublished,
  unavailable, published, and changed results, including the observable record
  lookup and validation call before the archived return. It compares the
  current name, recipe, price, ingredient cost, packaging cost, and stable
  serialized costing snapshot exactly as today. Locale timestamp formatting and
  the existing non-owner/non-manager privacy branch remain unchanged.
- The publication row retains the exact loading, error-or-missing-business,
  costing-cloud-unready, `!posCanPublish()`, archived, publish, and update button
  precedence together with its signed-out and read-only labels/details. It must
  not perform a network or persistence action while rendering.
- Opening first passes the `posCanPublish` readiness gate, then applies any
  pending remote costing state and validates the current product before it
  captures the exact source fingerprint and expected active version,
  initializes modal state, renders, and schedules category focus in the
  existing order. Closing remains blocked while submitting; otherwise it clears
  the same fields and hides the modal. Its first zero-delay callback restores
  focus when still attached and invokes `applyPendingAfterModal`, which retains
  its own nested zero-delay application and failure order.
- Modal rendering retains the exact price/cost/profit calculation, field
  limits, disabled/progress behavior, notices, escaping, and frozen-version
  explanation. It still looks up the content node and then the current product
  before its combined missing-value return; the lookup and exception order must
  not be shortened to an early content-only return.
- `waitForCostingSync` checks the partner-update guard before pending-save
  completion, rejects an unsaved local state only after pending work drains,
  retains literal `timeoutMs || 8000` behavior (including zero and `NaN`
  falling back to 8,000 ms), performs the same immediate first check, uses the
  same 80 ms polling interval, and retains the current deterministic messages.

The publish operation is a single guarded state machine and must remain exact:

- It short-circuits an absent modal/snapshot or duplicate submission, then
  preserves validation, trimmed category/size limits, source-fingerprint and
  permission checks before entering the submitting state.
- It captures the POS load generation, user, business, and costing generation
  before waiting. The same stale-account, stale-workspace, disconnected-costing,
  and changed-fingerprint checks run in the same order before the RPC. After the
  wait, it re-fetches the current product, revalidates it, and repeats the blank
  size source fingerprint check before building the sized snapshot.
- It calls `pos_publish_costing_product` exactly once with the same business,
  source product/recipe, trimmed name, centavo price/cost values, costing
  snapshot, nullable size/category, and expected-active-version payload. There
  is no client-side retry after an ambiguous or deterministic failure.
- Immediately after the RPC resolves, the same request-generation guard runs
  before `rpcRows` or result validation. It then validates the same result row,
  writes the same local publication shape, and attempts publication-status and
  catalog refresh in the same order.
  Either refresh may fail without relabeling an already-confirmed publication
  as failed. Session-generation checks still prevent stale success UI.
- Success follows the exact sequence notice, `publishSubmitting = false`, close
  modal, render Products, then render POS. Ordinary failure clears submitting,
  maps the same friendly error, refreshes status only for PostgreSQL `40001`,
  and rerenders the modal. Session-change and post-refresh generation exits
  still perform no stale UI work and must not alter a newer or already-closed
  modal.

The deletion and dependency safety contract must remain exact:

- A known active publication blocks deletion before any confirmation or
  network call. Outside test mode, deletion requires a session, connected
  cloud, business, and owner/manager role, then obtains fresh publication
  status. A failed or stale verification deletes nothing. The target and active
  publication are re-read after refresh, and confirmation happens only after
  every guard passes.
- Confirmed deletion performs exactly one `state.products` filter assignment,
  using strict `item.id !== id`, then `logChanges()`, `save()`, and `renderAll()`
  in that order. Cancellation, a missing target, or any failed guard performs
  none of those mutations. The known-active fast path explains and returns
  without rerendering; an active publication discovered by refresh explains,
  calls `renderProducts()`, and then returns.
- Dependency traversal preserves direct equality, the shared `seen` map,
  cycle termination, caller-supplied lookup, default live state lookup, mixture
  detection, component order, short-circuiting, and recursive return behavior.

Phase 4F does not authorize a Supabase migration, RLS/auth/storage change, RPC
change, new RPC, product archive feature, retry policy, UI redesign, message
change, deletion relaxation, or any modification of production data. Tests may
exercise RPC and persistence paths only through installed deterministic stubs.

Phase 4F adds exactly four desktop-only tests plus one publication mobile test
that runs in all three projects. The complete matrix becomes exactly 64 runs:
50 desktop Chromium, 7 Pixel Chrome, and 7 iPhone WebKit. They must prove:

1. Exact API order/descriptors, 10-name Publication domain, root/domain live
   reassignment, original registration slot, exact 7-script active path, exact
   18-script cached path, unchanged fallback/hash, protected-name invariants,
   and HTTP 200 delivery.
2. Typed-versus-classic exact return, value, HTML, DOM, state, trace, timeout,
   native-call, exception, focus, callback, dependency-cycle, and repeated-call
   fingerprints for status, publication row, modal lifecycle/rendering, sync
   wait, explanation, and dependency traversal. It must prove call-time sibling
   and root lookups rather than merely equal final output.
3. Publish success, validation, fingerprint drift, pending-remote/save/local
   dirty, timeout, duplicate-submit, stale user/business/generation, missing
   result, catalog/status-refresh failure, `40001`, friendly-error, and
   session-change parity. The test must assert the exact one-RPC payload,
   no automatic retry, local publication shape, notices, rerender order, and no
   costing-state, business-data, persistence, or local publication-record
   mutation caused by the publish operation before a validated RPC result,
   while preserving the exact pre-RPC submitting, error, modal, DOM, and
   pending-remote traces.
4. Product-delete missing/known-published/signed-out/disconnected/role/refresh/
   recheck/cancel/success parity under an explicit `TEST_MODE = false` fixture,
   with zero business-data/persistence-write assertions for every rejected
   branch and exact mutation order for success. Read-only status refresh and
   ephemeral publication-status refresh remain allowed where they exist, and
   the refreshed-active branch retains its current `renderProducts()` call.
   Downstream typed
   Costing and Events consumers plus classic `state.js` and `render-modals.js`
   must observe root and Publication-domain reassignment.
5. At desktop, Pixel, and iPhone widths, a realistic publication row and modal
   can be opened, edited locally, dismissed, and reached without overflow,
   page/console error, failed request, server error, storage mutation, fetch,
   RPC/query, cloud-storage access, or business action. Installed guards for
   fetch, Storage `setItem`/`removeItem`/`clear`, client `rpc`/`from`, and
   `storage.from` must all be asserted; zero-call checks may not pass through an
   absent client or uninstalled guard.

The exact 182-test legacy and 175-name compatibility baselines remain
unchanged. The guarded signed-in production smoke may inspect publication
status in Pricing, but must not open a publication modal, publish/update a
product, delete a product, invoke a manual or write-capable refresh action,
alter a field, or permit any business-data write. Normal startup/login reads
and read-only status refreshes remain allowed under the existing network guard.

### Phase 4F implementation status (released)

- The exact ordered 10-name API is implemented in responsibility-focused typed
  Publication modules and registered after classic `workspace-sync.js` and
  `pos-operations.js`, before the typed Costing view.
- The active manifest omits only `publication.js`, leaving exactly seven
  classic scripts. The unchanged file remains in `assets/js` and in the exact
  18-script cached/pre-module transition.
- Four desktop parity/data-safety tests and one cross-project write-free mobile
  test implement the frozen 64-run matrix. The complete local, Ubuntu, Windows,
  Pages, production-browser, signed-in smoke, and independent-review gates all
  passed.
- No backend, schema, RLS, auth, storage format, RPC contract, or production-data
  change is part of the implementation.

## Phase 4G contract — typed modal workflows

`render-modals.js` is the next executable boundary. Although its UI is split
across category, purchased-input, draft, and combined-cost dialogs, the file
cannot be activated safely one island at a time: its classic global function
declarations share mutable modal/session state and its root properties already
exist once the script loads. A partial overlay would introduce split classic/
typed ownership or a temporary replacement mechanism. Phase 4G therefore
moves the exact 46-function browser boundary atomically while implementing it
as small responsibility-focused typed modules.

The exact ordered API is:

1. `refreshModalBodyClass`
2. `focusSoon`
3. `focusLastMixtureField`
4. `consumePendingRemoteForCommit`
5. `applyPendingAfterModal`
6. `openCategoryModal`
7. `closeCategoryModal`
8. `purchasedIngredientCategoryOptions`
9. `openPurchasedIngredientModal`
10. `closePurchasedIngredientModal`
11. `savePurchasedIngredient`
12. `categoryNameError`
13. `saveCategory`
14. `deleteCategory`
15. `newMixtureDraft`
16. `draftIngredientLookup`
17. `mixtureCandidates`
18. `draftMixtureInfo`
19. `sanitizeMixtureSessionCategories`
20. `captureMixtureSession`
21. `mixtureSessionChanged`
22. `hasDraftValue`
23. `mixtureSessionHasMeaningfulWork`
24. `setMixtureError`
25. `openMixtureModal`
26. `closeMixtureModal`
27. `currentMixtureDraftConflict`
28. `saveCurrentMixtureDraft`
29. `requestCloseMixtureModal`
30. `discardMixtureChanges`
31. `renderDraftButton`
32. `formatDraftTime`
33. `renderDraftsModal`
34. `openDraftsModal`
35. `closeDraftsModal`
36. `resumeMixtureDraft`
37. `deleteMixtureDraft`
38. `mixtureComponentCost`
39. `beginQuickIngredient`
40. `setMixtureSaving`
41. `renderMixtureModal`
42. `refreshMixtureTotals`
43. `quickIngredientError`
44. `addQuickIngredient`
45. `mixtureValidationError`
46. `saveMixture`

The implementation must keep that public order while splitting ownership into
at least these internal responsibilities:

| Typed responsibility | Exact public bindings |
| --- | --- |
| Shared lifecycle and remote-commit helpers | 1, 2, 4, and 5 |
| Category and purchased-input workflows | 6–14 |
| Mixture session, conflict, and draft-save lifecycle | 15–30 |
| Draft-list rendering and persistence | 31–37 |
| Mixture editor, rendering, and validation | 3 and 38–45 |
| Final mixture commit | 46 |

Phase 4G must:

1. Publish the exact ordered API above as a new `modals` compatibility domain.
   Its bindings and matching browser-root globals remain writable,
   accessor-backed, and bidirectionally live.
2. Register the typed Modals domain at the original runtime position: after
   Publication and the typed Costing view, before the typed POS and Stocks
   views. Domain order becomes Core, Runtime, Costing, Stocks, Publication,
   Modals, POS, Support, Events, Legacy.
3. Keep compatibility contract version 1 with exactly 175 protected names.
   The five protected names owned by this slice remain
   `refreshModalBodyClass`, `draftMixtureInfo`, `openMixtureModal`,
   `closeMixtureModal`, and `saveMixture`.
4. Remove only `render-modals.js` from the active classic manifest, reducing
   the exact active path from seven scripts to six. Retain the unchanged file
   in `assets/js` and in the exact 18-script cached/pre-module transition. Its
   frozen Git blob is `86175e501cbaaaa4136b01f7e9c0ec1483ab9b2d`; its
   canonical LF SHA-256 is
   `881269390352390F1C77F78B3D9230403E2A7E41498C11B0DA3B33914299819C`.
5. Resolve mutable state, sibling functions, later-defined consumers, and
   browser natives at call time. This includes all costing state and modal/
   session globals; `document`, `localStorage`, `String`, `Date`, `JSON`,
   `Object`, `Array`, `parseInt`, `isNaN`, `setTimeout`, `alert`, and
   `confirm`; state normalization/reconciliation; Costing unit, option,
   escaping, lookup, calculation, snapshot, serialization, dependency, and ID-
   remapping helpers; save/history/render/status helpers; and every sibling in
   the 46-name API.
6. Preserve exact return values, Promise behavior, object and property order,
   identity, coercion, validation order, messages, HTML, DOM replacement,
   inert/ARIA behavior, focus scheduling/restoration, native calls, mutation
   order, persistence calls, and async exception boundaries.

The shared lifecycle contract remains exact:

- `refreshModalBodyClass` derives one open flag from category, purchased,
  mixture, drafts, publication, Stocks, and POS-operation modal state. It
  toggles `body.modal-open`, `inert`, and `aria-hidden` on the same optional
  header and wrap nodes in the same order.
- `focusSoon` and `focusLastMixtureField` retain zero-delay scheduling, live
  selector lookup, last-row selection, optional-node behavior, and exact focus
  timing.
- `consumePendingRemoteForCommit` returns `false` without work when no pending
  remote exists. Otherwise it preserves normalize, three-way merge, inventory-
  lifecycle reconciliation, state replacement, pending clear, synced-state and
  snapshot updates, best-effort localStorage write, deferred blocked-source
  alert, optional render, and `true` return in the same order. Only the existing
  localStorage write remains caught.
- `applyPendingAfterModal` retains its zero-delay pending/editing recheck and
  passes the then-current pending object to the live remote-apply helper.

The category and purchased-input contract remains exact:

- Add/edit/missing category modal setup, title/value/error changes, open flags,
  return-focus capture, focus timing, close resets, skip-remote behavior, and
  optional focus calls do not change.
- Category options retain Uncategorized first, current escaping and string
  selection rules, and live category order. Name validation retains trimming,
  reserved-name checks, case-insensitive duplicate checks, ID exclusion, and
  current exceptions.
- Purchased-ingredient save consumes pending remote with `false` before
  validation. Category save consumes it with the default render argument before
  reading and validating the name. Their rejected and successful branches,
  created-object key order, stale-category fallback, UI filters, history/save/
  close/render/focus order, and boolean returns remain exact.
- Category deletion itself does not consume pending remote; delegated Events
  continues to do that first. Missing/cancelled paths, exact confirmation text
  and pluralization, ingredient and every draft-category reassignment,
  changed-draft timestamping, strict-ID category filter, UI selection, and
  history/save/render order remain exact.

The mixture-session and draft contract remains exact:

- New-draft defaults, selected-category behavior, live draft/pending/source
  lookup, dependency-cycle filtering, costing lookup, category sanitization,
  snapshots, equality, meaningful-work detection, error setting, and all
  nullish/string/coercion rules remain unchanged.
- Mixture open/close retains missing-source alerts, read-only behavior, source
  snapshots, every session-global reset, return-focus rules, fallback focus,
  remote application, rendering, and timer order.
- Draft-conflict detection retains deletion, stable-fingerprint, and timestamp
  checks in the current order. Draft save retains all no-op/error gates,
  pending-remote reconciliation, conflict-copy and ID-remapping behavior,
  record property order, timestamps, replace/append behavior, notices, local/
  cloud status text, persistence, rendering, and optional close behavior.
- Close and discard retain automatic draft-save behavior and exact confirmation
  rules. Draft button/count, Philippine locale formatting and fallback, sort
  order, empty and populated HTML, open/close focus, resume/missing/source-
  deleted behavior, and draft deletion mutation/persistence order remain exact.

The editor, validation, and final-commit contract remains exact:

- Component cost preserves lookup, dimension checks, `NaN`, unit conversion,
  and recursive ingredient costing. Quick-ingredient creation, validation,
  duplicate rules, zero-price behavior, append order, default component unit,
  rerender, and focus remain unchanged.
- Saving-state ARIA and disabled-control bookkeeping retain exact dataset keys,
  pre-disabled values, iteration, and restoration. Mixture and drafts HTML,
  classes, attributes, labels, messages, order, missing-source option, allowed
  units, read-only controls, totals, and errors remain byte-for-byte equivalent
  for the same live inputs.
- Mixture validation keeps its current first-error order for name, duplicates,
  yield, empty components, missing sources, repeated sources, incompatible
  units, quantities, invalid component costing, inventory-dimension changes,
  and final draft costing.
- `saveMixture` remains an `async` function with no internal `await`, preserving
  Promise resolution and synchronous work-before-resolution behavior. It keeps
  pending-remote reconciliation first; draft conflict, quick ingredient,
  deleted/changed source, ID collision, validation, referenced pending-
  ingredient materialization, exact saved shape, replace/append, active-draft
  removal, UI filters, history/save/close/render/focus order, and every cancel/
  error branch's exact mutation or no-mutation effects.

Phase 4G does not authorize a UI redesign, wording change, new validation,
schema or storage-format change, Supabase migration, RLS/auth change, new
direct RPC or network surface, retry policy, cloud behavior change, business-
data repair, or production-data mutation. Existing delegated `save()` calls
and their local/cloud behavior remain exact. Tests exercise mutation and
persistence only through deterministic stubs.

Phase 4G adds exactly eight desktop-only parity/safety tests plus two modal
mobile tests that run in all three projects. The complete matrix becomes
exactly 78 runs: 60 desktop Chromium, 9 Pixel Chrome, and 9 iPhone WebKit.
They must prove:

1. Exact API order/descriptors, 46-name Modals domain, registration slot,
   bidirectional live reassignment, five protected-name invariants, exact six-
   script active and 18-script cached paths, unchanged fallback/hash, and HTTP
   200 fallback delivery.
2. Typed-versus-classic shared lifecycle, focus, pending-remote merge,
   reconciliation, localStorage failure, blocked-source alert, render/no-render,
   delayed remote-apply, return, exception, native-call, and repeated-call
   traces with call-time dependencies.
3. Category and purchased-input options, validation, add/edit/open/close,
   skip-remote, missing-node, focus, inert/ARIA, backdrop, Escape, Enter,
   pending-remote, rejected-save, successful-save, and exact mutation-order
   parity.
4. Category deletion missing/cancelled/singular/plural/success branches,
   cascading ingredient and draft reassignment, timestamp and strict-ID
   behavior, zero direct missing/cancel mutation with no pending remote, and
   live typed Events consumers that consume pending remote exactly once before
   delegating to deletion.
5. Mixture creation, lookup, dependency-cycle filtering, costing, category
   sanitization, snapshot/change/meaningful-work, open/read-only/close, missing-
   source, focus, and session-reset parity.
6. Draft conflict, save, conflict copy, owned-ID remapping, automatic close,
   discard, list/button/time rendering, open/close, resume, missing/source-
   deleted, delete, persistence, and mutation-order parity.
7. Mixture component cost, quick ingredient, saving-state restoration, full
   editor rendering, totals refresh, validation first-error order, coercion,
   missing sources, incompatible dimensions, and repeated-call parity.
8. Final mixture commit missing/changed source, cancel/overwrite, ID collision,
   draft conflict, quick-input block, validation, pending ingredient, replace/
   append, active-draft removal, success, exception, exact Promise, and exact
   rejected-path effects. Every rejection and exception snapshot and trace must
   match classic exactly, including pending-remote reconciliation, category
   sanitization, source/ID session changes, and any partial pending-ingredient
   mutation completed before a thrown dependency. Typed code may add no
   history, delegated save, close, render, focus, or state effect beyond that
   exact classic trace.
9. At desktop, Pixel, and iPhone widths, category, purchased-input, and drafts
   dialogs can be opened, edited locally, navigated, and dismissed without
   saving, overflow, focus loss, page/console error, failed request, server
   error, storage mutation, fetch, RPC/query, cloud-storage access, persistence,
   or business-data mutation.
10. At all three widths, realistic create/edit/read-only mixture dialogs,
    component rows, quick-input panel, long copy, totals, actions, and local
    field edits remain reachable and contained. Writable create/edit sessions
    dismiss only through confirmed Discard changes; read-only sessions close
    normally. X, Escape, backdrop, and automatic draft-save behavior remain in
    desktop parity test 6. State and `state.mixtureDrafts` snapshots remain
    unchanged after the mobile dismissal paths.

Both mobile tests must install and assert guards for `window.fetch`, Storage
`setItem`/`removeItem`/`clear`, `cloud.client.rpc`, `cloud.client.from`,
`cloud.client.storage.from`, `save`, `logChanges`, and relevant remote-apply/
persistence hooks. Every guard must prove it was installed and retain a zero
counter; an absent client or missing hook may not satisfy a zero-call check.

The exact 182-test legacy and 175-name compatibility baselines remain
unchanged. The guarded signed-in production smoke may verify the Modals domain
and normal application rendering, but must not invoke category, purchased-
ingredient, draft, mixture-save, delete, or other business-data mutations.

### Phase 4G implementation status (released)

- The exact 46-function atomic boundary, internal module responsibilities,
  runtime transition, safety invariants, and frozen 78-run matrix are defined.
- `src/modals` now separates lifecycle, category/purchased-input, mixture
  session, draft, editor/validation, and final-commit responsibilities while
  publishing the exact ordered API through the `modals` compatibility domain.
- The active manifest removes only `render-modals.js`; its unchanged classic
  asset remains in the exact 18-script cached/pre-module transition.
- Eight desktop modal parity/safety tests and two cross-project mobile modal
  tests implement the frozen 78-run matrix. No backend schema, RLS/auth,
  persistence format, business rule, UI wording, or production-data mutation
  is authorized by this slice.
- Clean local gates, Ubuntu and Windows pull-request and post-merge CI, Pages
  artifact verification, a fresh 390-pixel production audit, and the guarded
  signed-in production smoke all passed. The exact evidence is recorded below.

## Phase 4H contract — typed POS catalog workflows

`pos-catalog.js` is the next executable boundary. Its 81 browser functions
span checkout state, cart calculations, menu caching, pending-sale recovery,
catalog drift, and drink-image management. They cannot be activated safely one
island at a time: the classic file installs all root declarations together,
shares mutable checkout/media state across every island, and is consumed by
later Stocks, Publication, POS-view, workspace-sync, and POS-operations code.
A partial overlay would create split classic/typed ownership or require a new
temporary replacement mechanism. Phase 4H therefore moves the exact complete
file boundary atomically while splitting its implementation into small typed
responsibilities.

The exact ordered API is:

1. `freshPosCheckout`
2. `clearPosReportData`
3. `setPosReportsLoading`
4. `syncOpenPosReportModal`
5. `stockCanManage`
6. `resetStocks`
7. `resetPosCheckout`
8. `posUuid`
9. `posCartLines`
10. `posCatalogMatchaOptions`
11. `posVariantKey`
12. `posProductCartLines`
13. `posProductCartQuantity`
14. `posCartTotalCentavos`
15. `posCartUnits`
16. `strictPesoCentavos`
17. `posLoadRequestStillCurrent`
18. `posCatalogRequestStillCurrent`
19. `posCatalogCacheScope`
20. `posHydrateCatalogCache`
21. `posRememberCatalogCache`
22. `posClearCatalogCache`
23. `posDrinkGroupKey`
24. `normalizePosCategory`
25. `posSubmitRequestStillCurrent`
26. `posPendingScope`
27. `posPendingRecords`
28. `posSavePending`
29. `posClearPending`
30. `posStoredPending`
31. `posRestorePending`
32. `posLatestCatalogProduct`
33. `posLatestMatchaOption`
34. `markPosCartAgainstCatalog`
35. `acceptPosCatalogChanges`
36. `addPosProduct`
37. `addPosProductVariant`
38. `confirmPosProductOption`
39. `changePosQuantity`
40. `removePosLine`
41. `clearPosCart`
42. `confirmPosCartAction`
43. `resetPosContext`
44. `posCanPublish`
45. `posFriendlyError`
46. `rpcRows`
47. `posCanManageMedia`
48. `posPublicImageUrl`
49. `posDrinkImageHtml`
50. `posMediaRequestCurrent`
51. `posMediaRow`
52. `posPatchProductImage`
53. `openManageDrinksModal`
54. `posLoadImageElement`
55. `posValidateDrinkImageFile`
56. `posCloseDrinkImageSource`
57. `posDecodeDrinkImageFile`
58. `posDrinkImageCropGeometry`
59. `posDrawDrinkImageCrop`
60. `posEncodeDrinkImageCanvas`
61. `posPrepareDrinkImage`
62. `disposePosDrinkImageEditor`
63. `openPosDrinkImageEditor`
64. `posCurrentDrinkImageEditor`
65. `posClampDrinkImageEditor`
66. `drawPosDrinkImageEditor`
67. `setPosDrinkImageZoom`
68. `adjustPosDrinkImageZoom`
69. `nudgePosDrinkImageEditor`
70. `resetPosDrinkImageEditor`
71. `cancelPosDrinkImageEditor`
72. `posExportDrinkImage`
73. `savePosDrinkImageEditor`
74. `beginPosDrinkImageDrag`
75. `movePosDrinkImageDrag`
76. `endPosDrinkImageDrag`
77. `posReloadMediaRows`
78. `uploadPosDrinkImage`
79. `requestRemovePosDrinkImage`
80. `cancelRemovePosDrinkImage`
81. `confirmRemovePosDrinkImage`

The implementation must keep that public order while splitting ownership into
at least these internal responsibilities:

| Typed responsibility | Exact public bindings |
| --- | --- |
| Checkout/report/Stocks lifecycle, context, error, and RPC helpers | 1–8 and 43–46 |
| Cart math, category, catalog lookup/drift, and cart actions | 9–16, 23–24, and 32–42 |
| Request currency and scoped catalog cache | 17–22 |
| Pending-sale persistence and restoration | 25–31 |
| Media catalog, permission, RPC, upload/remove, and recovery | 47–53 and 77–81 |
| Image validation, decode/crop/encode, and editor interaction | 54–76 |

None of the 81 names overlaps the existing 19-function typed POS presentation
API. Catalog therefore remains a separate responsibility domain instead of
changing the meaning or registration position of the released `pos` domain.

Phase 4H must:

1. Publish the exact ordered API above as a new `catalog` compatibility domain.
   Its bindings and matching browser-root globals remain writable,
   accessor-backed, and bidirectionally live.
2. Register the typed Catalog domain at the original runtime position: after
   typed Costing and before typed Stocks. Domain order becomes Core, Runtime,
   Costing, Catalog, Stocks, Publication, Modals, POS, Support, Events, Legacy.
3. Keep compatibility contract version 1 with exactly 175 protected names.
   The 32 protected names owned by this slice remain
   `setPosReportsLoading`, `resetPosCheckout`, `posCartLines`,
   `posProductCartQuantity`, `posCartTotalCentavos`, `posCartUnits`,
   `strictPesoCentavos`, `posHydrateCatalogCache`, `posRememberCatalogCache`,
   `posClearCatalogCache`, `posDrinkGroupKey`, `posPendingScope`,
   `posPendingRecords`, `posSavePending`, `posClearPending`,
   `posStoredPending`, `posRestorePending`, `acceptPosCatalogChanges`,
   `addPosProduct`, `addPosProductVariant`, `resetPosContext`, `posCanPublish`,
   `openManageDrinksModal`, `posDecodeDrinkImageFile`,
   `posDrinkImageCropGeometry`, `posEncodeDrinkImageCanvas`,
   `posPrepareDrinkImage`, `openPosDrinkImageEditor`,
   `cancelPosDrinkImageEditor`, `posExportDrinkImage`,
   `savePosDrinkImageEditor`, and `uploadPosDrinkImage`.
4. Remove only `pos-catalog.js` from the active classic manifest, reducing the
   exact active path from six scripts to five: `state.js`,
   `workspace-sync.js`, `pos-operations.js`, `boot.js`, and `start.js`. Retain
   the unchanged file in `assets/js` and in the exact 18-script cached/pre-
   module transition. Its frozen Git blob is
   `34e2b5bfb1fd53637cb65fee9fd07358ff751230`; its canonical LF SHA-256 is
   `35DE3699B50201D64F4F574C45E8D296917C63A8EE70E1C95103D25BE08B8DFC`.
5. Resolve mutable state, sibling functions, later-defined consumers, and
   browser natives at call time. This includes every checkout, context,
   generation, report, modal, history, media-editor, session, cloud, and Stocks
   global; every sibling in the 81-name API; Runtime, Core, Stocks,
   Publication, POS-view, workspace-sync, and POS-operations consumers;
   `window`, `document`, `localStorage`, `sessionStorage`, `URL`, `Image`,
   `createImageBitmap`, `window.crypto`, `Uint8Array`, `Error`, `Date`, `JSON`,
   `Object`, `Array`, `Math`, `Number`, `String`, `Promise`, canvas methods,
   and pointer events. Root or domain reassignment must affect the next call.
6. Preserve exact return values and Promise timing; object/property and option
   order; coercion and validation order; text and HTML; DOM, class, modal, ARIA,
   focus, and pointer behavior; generation increments; storage keys and record
   shapes; RPC and object-storage argument order; mutation order; caught versus
   propagated exceptions; cleanup; retry/recovery; and partial async effects.

The checkout, report, context, and cart contract remains exact:

- `freshPosCheckout` retains every field, field order, primitive default, and
  fresh object/array identity. Report clearing/loading and open-report syncing
  retain exact state, body-class, modal-render, notice/error, and return rules.
- Stocks and checkout reset retain every generation increment, promise/time
  reset, editor disposal, fresh-state replacement, training-class removal,
  modal hide/close, body-class refresh, render, and optional error assignment
  in the same order. Context reset retains its preserve-checkout branch and
  downstream generation behavior.
- UUID generation retains native `randomUUID` preference and the exact random-
  byte fallback, version/variant bit masks, hexadecimal formatting, and native
  error behavior.
- Cart line ordering, upgrade-option parsing/filter/sort, variant keys, product
  filters, quantity/total reductions, and strict peso parsing retain exact
  string, numeric, safety-limit, decimal, and null rules.
- Matcha-versus-Hojicha grouping remains binary and category normalization
  retains the same no-op and reset behavior.

The cache, pending-sale, catalog-drift, and cart-action contract remains exact:

- Request-current helpers keep their exact generation, signed-in session,
  user, business, and modal checks. Catalog cache scope remains cloud URL,
  user, and business specific. Cache hydration retains schema version 2,
  maximum age, malformed/expired/cross-scope rejection, snapshotting, category
  normalization, pending restoration, stale-cart reconciliation, and caught
  sessionStorage failures. Remember and clear retain exact storage records and
  boolean/no-throw behavior.
- Pending-sale persistence remains keyed per user and business. Legacy single-
  record migration, parse-error/null/non-object fallback, save/clear behavior,
  empty-map removal, v2 product-key versus v3 variant-key restoration, cart-
  line shape, payment and training restoration, retry notice, stale-catalog
  marking, and every caught localStorage failure remain unchanged.
- Catalog lookup and stale marking retain exact product, version, base price,
  name, size, option revision, surcharge, `latest`, `stale`, `catalogChanged`,
  and confirming effects. Accepting changes retains removal/update counts,
  line rebuilding and merging, the 10,000-unit cap, exact notice grammar,
  rendering, and blocked/no-op paths.
- Add, upgrade selection, confirm, quantity change, remove, clear, and modal-
  confirmed cart actions retain all pending/submitting/confirming/modal gates,
  state and line property order, notice/error clearing, focus targets, close/
  render sequence, stale-version handling, and boolean returns.
- Publish/media permissions, friendly error extraction, and RPC row coercion
  keep their current role, session, data, array, message, and fallback rules.

The drink-media and image-editor contract remains exact:

- Public image URLs and image HTML retain current storage access, escaping,
  placeholder behavior, classes, and public-URL lookup failure fallback to an
  empty URL/placeholder. Media rows, catalog patches, permissions, modal
  opening, generation checks, read-only media RPC, success/error rendering,
  and focus scheduling retain exact behavior.
- File validation continues to accept only positive-size JPEG, PNG, and WebP
  files no larger than 5 MB.
  Decode retains `createImageBitmap` with image-orientation preference, image-
  element fallback, object-URL revocation, dimension checks, optional downscale
  to a 3,600-pixel maximum dimension, source cleanup, and rejection behavior.
- Crop geometry remains a centered cover crop with caller-supplied target
  dimensions preserved, target width defaulting to 1,200 pixels, and target
  height defaulting to 900 pixels, with zoom clamped from 1 through 4 and pan
  clamped to computed bounds. Canvas transforms, `#fff4f7` fill, smoothing,
  drawing, and returned geometry remain exact. WebP encoding retains up to
  five attempts beginning at quality 0.86,
  decrementing by 0.11, with a 2 MB maximum and current error messages.
- Editor open/decode/stale-result cleanup, token and generation checks, current-
  editor lookup, clamp/draw, zoom, keyboard nudge, reset, cancel, export, save,
  pointer capture/drag/release, rerender, focus, and source disposal retain exact
  ordering, guards, return values, Promise behavior, and resource cleanup.

The mutation and recovery contract remains exact:

- Upload prepares or exports the image, chooses the same immutable object path,
  uploads with the same content type/cache control/upsert options, attaches it
  through the same RPC with expected-old-path compare-and-set semantics, patches
  both media and catalog rows, and then best-effort removes the previous object.
- A lost attach response retains authoritative media re-read and exact recovery
  behavior. A newly uploaded object is removed only after successful
  verification proves that a different authoritative path won. When that
  verification itself fails, the browser must leave the immutable object in
  place rather than risk deleting a committed image.
- Remove request/cancel/confirm retains current modal state and focus. Confirm
  clears the database path before object cleanup, reports cleanup warnings,
  verifies ambiguous failures, recovers an already-cleared authoritative row,
  and preserves exact stale-generation and error effects.
- Tests may exercise every mutation/recovery branch only through deterministic
  RPC and storage stubs. They may not write Supabase, production storage, or
  business data.

Phase 4H does not authorize a UI redesign, wording change, new validation,
schema or storage-format change, Supabase migration, RLS/auth change, new RPC or
network surface, retry policy, cache lifetime, image format/dimensions, cloud
behavior, business-data repair, or production-data mutation.

The Phase 4H implementation must add exactly 12 desktop-only parity/safety
tests plus two catalog mobile tests that run in all three projects. The
complete matrix must become exactly 96 runs: 74 desktop Chromium, 11 Pixel
Chrome, and 11 iPhone WebKit. They must prove:

1. Exact API order/descriptors, 81-name Catalog domain, registration slot,
   bidirectional live reassignment, 32 protected-name invariants, exact five-
   script active and 18-script cached paths, unchanged fallback hashes, and
   HTTP 200 fallback delivery.
2. Checkout/report/Stocks reset, generation, modal, training, request-current,
   context-reset, permission, error, RPC-row, UUID native/fallback, exception,
   and repeated-call parity with call-time dependencies.
3. Cart lines, matcha option parsing/filter/sort, variant keys, per-product
   lines/quantity, totals, units, strict peso parsing, category grouping, and
   normalization parity across boundary and coercion cases.
4. Catalog cache scope, hydration, snapshot identity, expiry, corruption,
   schema, cross-user/business/cloud rejection, category/pending/stale-cart
   effects, remember/clear, quota/storage failures, and no-throw parity.
5. Pending-record migration, scope, save, clear, empty-map removal, malformed
   data, v2/v3 restore, product/variant keys, payment/training restoration,
   retry notice, stale marking, storage failure, and mutation-order parity.
6. Catalog lookup, option lookup, stale drift, mixed changed/removed items,
   accept/rebuild/merge, quantity cap, grammar, blocked paths, render, and exact
   state/line property-order parity.
7. Product add, option modal, variant add/confirm, quantity change, remove,
   clear, confirm cancel/success, stale version, focus, modal, render, and all
   pending/submitting/confirming gates.
8. Media permission, public URL/HTML, row lookup/patch, manage-modal load,
   generation/session drift, RPC success/failure, render, and focus parity.
9. Image validation, object URL, bitmap and image fallback, orientation,
   downscale, cleanup, crop geometry/draw, encode attempts, prepare/export,
   Promise/rejection, and partial-effect parity.
10. Editor open/stale decode, current/clamp/draw, zoom/nudge/reset/cancel/save,
    token checks, pointer capture/drag/release, focus, source disposal, and
    repeated-call parity.
11. Upload success, replace cleanup warning/failure, attach failure before and
    after object upload, authoritative recovery, verified loser cleanup,
    unverifiable ambiguity, stale generation/session, rendering, and exact RPC/
    storage/mutation sequence.
12. Remove request/cancel, missing path, success, cleanup warning, lost-response
    recovery, authoritative still-present failure, refresh failure, stale
    generation/session, focus, render, and partial-effect parity.
13. At desktop, Pixel, and iPhone widths, local catalog filtering, matcha option
    selection, cart quantity/remove/clear confirmation, dismissal, focus, and
    overflow remain exact with zero fetch or RPC/query calls and zero browser/
    object-storage, persistence, or business-data writes.
14. At all three widths, deterministically stubbed manage-drinks rows with null
    image paths and local image-editor open, crop controls, pointer/keyboard
    adjustment, cancel/dismissal, focus, containment, and errors remain usable
    with zero real network, zero mutation RPC/object-storage call, and unchanged
    business state.

Both mobile tests must install and assert guards for `window.fetch`, Storage
`setItem`/`removeItem`/`clear`, `cloud.client.rpc`, `cloud.client.from`,
`cloud.client.storage.from`, checkout submission, save/history hooks, and all
business-data mutation paths. A deterministic read stub may supply media rows
with null image paths only when the `pos_get_product_media` call and arguments
are asserted separately. `cloud.client.storage.from` must retain a zero count;
no absent client or missing hook may satisfy a zero-call check.

The exact 182-test legacy and 175-name compatibility baselines remain
unchanged. The guarded signed-in production smoke may verify the Catalog domain
and normal POS/catalog rendering, but must not alter a cart, submit checkout,
open an image file, upload/remove media, write storage, or invoke another
business-data mutation.

### Phase 4H implementation status (released)

- Six typed responsibility modules under `src/catalog` implement the exact
  81-function `catalog` compatibility domain. It registers after Costing and
  before Stocks while compatibility contract version 1 retains exactly 175
  protected names, including the exact 32 bindings owned by this slice.
- The active classic runtime is reduced from six scripts to exactly five:
  `state.js`, `workspace-sync.js`, `pos-operations.js`, `boot.js`, and
  `start.js`. The cached/pre-module transition remains exactly 18 scripts.
- The retained `pos-catalog.js` fallback is unchanged: Git blob
  `34e2b5bfb1fd53637cb65fee9fd07358ff751230` and canonical LF SHA-256
  `35DE3699B50201D64F4F574C45E8D296917C63A8EE70E1C95103D25BE08B8DFC`.
- Twelve desktop Catalog parity/safety tests and two cross-project mobile
  Catalog tests implement the exact 96-run matrix: 74 desktop Chromium, 11
  Pixel Chrome, and 11 iPhone WebKit. Local dependency audit, type-check,
  production build, focused Catalog tests, and the complete matrix pass.
- Independent source-parity, integration, and strict test-strength reviews
  pass. This release changes no backend schema, RLS/auth, storage format,
  persistence format, UI wording/design, business rule, or production data.
- Pull-request and post-merge Ubuntu/Windows CI, Pages artifact verification,
  fresh 390-pixel production verification, and the guarded signed-in read-only
  production smoke all pass. Exact evidence is recorded below.

## Phase 4I contract — typed workspace sync

`workspace-sync.js` is the next executable boundary. Its 18 browser functions
own request currency, POS workspace and publication reads, cold and background
checkout loading, refresh single-flight coordination, checkout validation,
pending-sale construction, and sale submission/recovery. Earlier classic
`state.js`, later classic `pos-operations.js`, and the typed Publication,
Events, Stocks, and POS presentation domains consume this API through browser-
root bindings. The file also shares load, catalog, and submit generations plus
the pending-sale retry record across every responsibility.

The classic file installs all 18 root declarations together. Activating only
some typed functions would create split classic/typed ownership of generation
and retry state; removing the classic file after a partial implementation
would break later consumers. Phase 4I therefore moves the exact complete file
boundary atomically while splitting its internal implementation by
responsibility.

The exact ordered API is:

1. `posRequestIsCurrent` — synchronous boolean
2. `costingRequestIsCurrent` — synchronous boolean
3. `loadPosPublicationStatus` — asynchronous `Promise<boolean>`
4. `loadPosContext` — asynchronous `Promise<boolean>`
5. `posRpcErrorText` — synchronous string
6. `posHandleAccessDenied` — synchronous boolean
7. `loadPosCheckoutData` — asynchronous `Promise<boolean>`
8. `refreshPosSilently` — synchronous declaration, Promise-returning
9. `refreshPosAfterMutation` — synchronous declaration, Promise-returning
10. `refreshPosCatalogOnly` — asynchronous `Promise<boolean>`
11. `openPosRegister` — asynchronous `Promise<boolean>`
12. `posCheckoutValidation` — synchronous validation object
13. `buildPosPendingSale` — synchronous pending record
14. `posDeterministicError` — synchronous boolean
15. `posCheckoutErrorText` — synchronous string
16. `reviewPosSale` — synchronous declaration; boolean normally and the exact
    `submitPosSale` Promise for a pending retry
17. `cancelPosConfirmation` — synchronous boolean
18. `submitPosSale` — asynchronous `Promise<boolean>`

The implementation must keep that public order while splitting ownership into
at least these internal responsibilities:

| Typed responsibility | Exact public bindings |
| --- | --- |
| Request currency, workspace/publication context, and access errors | 1–6 |
| Cold/background loading, silent refresh, mutation refresh, catalog refresh, and register opening | 7–11 |
| Checkout validation, pending construction, review, and cancel | 12–13 and 16–17 |
| Deterministic classification, checkout errors, submission, and recovery | 14–15 and 18 |

Phase 4I must:

1. Publish the exact ordered API above as a new `workspace` compatibility
   domain. Its bindings and matching browser-root globals remain writable,
   accessor-backed, and bidirectionally live.
2. Register typed Workspace immediately after typed Stocks and before classic
   `pos-operations.js`, typed Publication, and the typed Costing view. Domain
   order becomes Core, Runtime, Costing, Catalog, Stocks, Workspace,
   Publication, Modals, POS, Support, Events, Legacy.
3. Keep compatibility contract version 1 with exactly 175 protected names.
   The exact 11 protected names owned by this slice remain
   `loadPosPublicationStatus`, `loadPosContext`, `loadPosCheckoutData`,
   `refreshPosSilently`, `refreshPosCatalogOnly`, `posCheckoutValidation`,
   `buildPosPendingSale`, `posDeterministicError`, `posCheckoutErrorText`,
   `reviewPosSale`, and `submitPosSale`.
4. Remove only `workspace-sync.js` from the active classic manifest, reducing
   the exact active path from five scripts to four: `state.js`,
   `pos-operations.js`, `boot.js`, and `start.js`. Retain the unchanged file in
   `assets/js` and in the exact 18-script cached/pre-module transition. Its
   frozen Git blob is `714fa588cb0c483414ee236afd2e7f2815f25eee`; its
   canonical LF SHA-256 is
   `7FEA61163419D78F1B3CD1C11B8BC6FE4E3E4FCB97B030566D6CF28BE23FAFA8`.
5. Resolve every mutable state value, sibling function, later-defined
   operation, typed helper, client method, and browser native at call time.
   Root or domain reassignment must affect the next call.
6. Preserve exact declaration kind, return type, Promise identity and timing,
   property and option order, coercion and validation order, RPC concurrency
   and arguments, state and DOM mutation order, render and modal order, body
   classes, storage effects, caught versus propagated exceptions, partial
   effects, stale-result behavior, and retry/recovery behavior.

The required live call-time state and constants include `session`, `cloud`,
`posContext`, `posCheckout`, `posOpsModal`, `posLoadGeneration`,
`costingLoadGeneration`, `posStatusGeneration`,
`posCheckoutLoadGeneration`, `posCatalogGeneration`,
`posCheckoutSubmitGeneration`, `posLastSilentRefreshAttemptAt`,
`posSilentRefreshPromise`, `APP_BRAND_NAME`, and
`POS_SILENT_REFRESH_MIN_AGE_MS`.

The required Catalog and shared helpers include `rpcRows`, `resetPosContext`,
`posFriendlyError`, `setPosReportsLoading`, `syncOpenPosReportModal`,
`posClearCatalogCache`, `posHydrateCatalogCache`,
`posLoadRequestStillCurrent`, `posCatalogRequestStillCurrent`,
`posSubmitRequestStillCurrent`, `normalizePosCategory`,
`markPosCartAgainstCatalog`, `posRestorePending`,
`posRememberCatalogCache`, `clearPosReportData`, `posCartLines`,
`posCartTotalCentavos`, `strictPesoCentavos`, `posUuid`, `posSavePending`, and
`posClearPending`. Later Operations helpers `posModeFromPending` and
`posStatusCanManage`, presentation helpers `renderProducts`, `renderPos`, and
`renderPosPreservingInteraction`, and every sibling in the 18-name Workspace
API also remain live.

Browser/native lookup remains live for `document`, `Promise`, `Date`,
`String`, `Number`, `Error`, the cloud client and its `rpc` method, and body/
class-list behavior. Direct imported sibling calls or captured mutable globals
are not equivalent to this contract.

The request and workspace-context contract remains exact:

- `posRequestIsCurrent` checks strict POS generation, signed-in session/user,
  stringified user ID, then optional stringified business ID in the current
  short-circuit order. A nullish expected business skips only that comparison.
  `costingRequestIsCurrent` performs the matching costing-generation and user
  checks. Generation, logout, user, or business drift invalidates late work.
- `loadPosPublicationStatus` guards client/session/business, chooses the
  supplied POS generation unless nullish, increments status generation with
  JavaScript `++` coercion, and calls `pos_get_publication_status` with
  `{p_business_id}`. RPC/row-coercion failures propagate. A current result
  creates a fresh publication map keyed by truthy source product ID; duplicate
  IDs retain the last row. Status, POS, user, or business drift returns false
  without mutation.
- `loadPosContext` keeps the signed-out reset-and-render path and concurrent-
  loading guard. It increments POS and status generations, sets loading/error,
  and renders before `pos_get_my_businesses`. Zero and multiple workspace rows
  retain their exact current messages. Exactly one row stringifies business,
  brand fallback, and role; owner/manager awaits publication loading while
  other roles receive a fresh empty publication map. Success, caught failure,
  stale partial assignments, and generation-owned `finally` rendering remain
  ordered exactly. Setup/render or `finally` exceptions outside the caught
  load path may still reject.
- `posRpcErrorText` maps only code `42501` to the access-revoked text and every
  other input to the current generic connection text. Access-denied handling
  acts only on `42501` and retains exact order: stop report loading, clear the
  scoped catalog cache, reset context with the mapped error, render Products,
  render POS, return true. Other errors return false without effects.

The checkout-loading contract remains exact:

- `loadPosCheckoutData` keeps the signed-out/missing-business render-and-false
  path and both submission guards. It records the refresh attempt time before
  cache hydration; successful hydration or explicit background mode selects a
  warm/background refresh. Checkout-load and catalog generations use exact
  `++` coercion. Loading/refresh flags, report loading, error clearing, normal
  versus interaction-preserving rendering, and open-report synchronization
  stay in their current order.
- Its local request wrapper converts synchronous RPC throws, asynchronous
  rejections, and `rpcRows` failures into `{rows: [], error}` results. Catalog
  and shift reads start concurrently and in this order:
  `pos_get_catalog_v2({p_business_id})`, then
  `pos_get_shift_status({p_business_id})`.
- A stale result after the initial reads returns false without cleanup. Any
  catalog/shift `42501` invokes the access-denied reset. A current catalog
  success applies rows and then performs category normalization, cache-preview
  clearing, verified-generation assignment, stale-cart marking, pending
  restoration, and cache remembering in the existing order. Foreground
  catalog failure sets its error; background failure preserves warm cards.
- Shift failure or no rows retains the separate warm and cold paths. A warm
  failure preserves the current screen, unlocks refresh, requires verification,
  sets exact refresh/report errors, renders while preserving interaction, and
  syncs the report modal. A cold failure clears shift/status/reports, marks the
  checkout unloaded and refresh-required, removes `body.pos-training`, sets
  exact shift/report errors, renders normally, and syncs the modal.
- A valid shift row remains both authoritative status and, only with an open
  shift ID, the active shift. Receipt clearing, pending-retry exceptions,
  report-mode derivation, cashier permission behavior, training-class toggle,
  and mode/date-triggered report clearing stay exact.
- Summary and recent-sales reads start concurrently with exact arguments:
  `pos_get_end_of_day_summary({p_business_id,p_business_date,p_is_training})`
  and `pos_get_recent_sales_v2({p_business_id,p_is_training,p_limit:20})`.
  A stale post-report result again returns without cleanup. Access denial,
  foreground clearing, background retention, summary/daily-report aliasing,
  loaded mode/date, recent rows, catalog-current calculation, refresh lock,
  refresh errors, timestamp, render choice, modal sync, and final boolean all
  retain their current partial-success behavior. Report-only failure may still
  return true. For the checkout load's own still-current catalog generation,
  catalog currency is `!catalogResult.error`; when a newer catalog generation
  has independently completed, currency instead requires
  `posCheckout.catalogVerifiedGeneration === posCatalogGeneration`. The load
  returns false only while the authoritative current catalog generation remains
  unverified, even when shift/report reads succeed.

Refresh coordination and register opening remain exact:

- `refreshPosSilently` remains non-`async`. Guard and throttle paths return
  resolved booleans. An existing `posSilentRefreshPromise` is returned verbatim
  before force/throttle logic. Warm state remains loaded, cache-preview, or
  nonempty catalog. The function stores the original checkout-load task but
  returns `task.finally(...)` to the first caller, clears the stored task only
  on identity match, and preserves fulfillment or rejection.
- `refreshPosAfterMutation` captures active refresh plus stringified user and
  business. Missing/stale identity resolves false. Without an active refresh
  it delegates to forced silent refresh. With one, it swallows that refresh's
  rejection, rechecks identity, clears only the same captured promise, and
  delegates to forced refresh; replacement promises retain their current
  single-flight behavior.
- `refreshPosCatalogOnly` has no checkout/operations submission guard. It
  increments catalog generation, conditionally shows loading only for an empty
  catalog, clears error, and renders. Success performs normalize, stale mark,
  pending restore, cache remember, and render in order. Stale success/failure
  returns without cleanup. Its broad catch retains access-denied handling,
  empty-versus-warm error rules, checkout refresh locking, and helper/render
  exception behavior.
- `openPosRegister` blocks only checkout submission. It loads context when no
  business exists, uses forced silent refresh for refresh-plus-warm state,
  uses full loading for refresh/cold/error state, and otherwise renders and
  resolves true.

Checkout validation and pending construction remain exact:

- Validation precedence remains: pending retry bypass; refreshing; refresh
  required; shift loading; missing shift; shift/status mismatch; cart-line and
  total calculation; empty cart; catalog/stale-line drift; positive safe total
  not exceeding `100000000000`; trimmed reference no longer than 120 UTF-16
  code units; cash syntax and sufficient tender; exact lowercase `gcash` or
  `gotyme`; payment-method error. Every current error string remains unchanged.
  Invalid branches retain the exact `{valid,error}` shape; pending-retry and
  valid branches retain the exact `{valid,error,cashCentavos}` shape. Each
  branch's existing property order remains unchanged.
- `buildPosPendingSale` reads cart lines twice, once for RPC items and once for
  the snapshot. It retains schema version 3, RPC name
  `pos_complete_shift_sale_v3`, stringified user/business/shift, training flag,
  one live UUID, one live ISO date, exact item and record property order,
  upgrade nullability, cash-only tender, trimmed/null reference, null note,
  and the exact snapshot fields/order while excluding stale/latest fields.

Review, submission, and recovery remain exact:

- Deterministic codes remain `40001`, `42501`, `22003`, `22023`, `23514`,
  `23505`, `55000`, and case-sensitive `PGRST` prefixes. Every existing mapped
  checkout error and the generic fallback remain byte-for-byte unchanged.
- `reviewPosSale` delegates a pending retry directly to `submitPosSale` before
  checking the submitting flag; that branch returns the exact Promise. Other
  submitting, invalid, and valid branches retain their booleans, confirming/
  error mutations, render behavior, and order. Cancel remains blocked without
  rendering for submitting/pending state; otherwise it clears confirming,
  renders, and returns true even when already clear.
- `submitPosSale` guards submitting/session/user/business but intentionally
  does not preflight `cloud.client`. It validates before mutation. A new record
  is built and persisted before generation capture, submit locking, or RPC;
  a retry reuses the exact captured pending record and payload. Submit
  generation, identity capture, confirming/error clearing, submitting lock,
  and rendering remain ordered before
  `record.rpcName || 'pos_complete_sale'` is invoked.
- Stale success or failure returns false without cleanup. A valid receipt
  requires truthy sale ID and receipt number. Success retains exact order:
  unlock submit, clear pending, replace cart, clear catalog drift, reset
  payment/cash/reference/confirmation/error/notice, assign receipt, render,
  start a non-awaited refresh whose rejection is swallowed, return true.
- Code `40001` clears pending, retains cart, marks catalog changed, applies the
  mapped error, renders, and starts the non-awaited refresh. Other deterministic
  errors clear pending but retain cart/payment and render the mapped error.
  Nondeterministic failures, including rejected transport, missing receipt, or
  absent client, retain the pending retry and exact current uncertainty notice.
  Synchronous exceptions after partial success mutations remain classified by
  the same catch, preserving those partial effects. Existing notice-clearing
  asymmetry remains unchanged.

Storage and mutation surfaces remain bounded. Catalog cache hydration,
remembering, and clearing continue through their existing scoped session-
storage helpers. Pending save/clear continue through existing local-storage
helpers. Body classes remain `pos-training` and `pos-reports-loading`.
Rendering remains normal POS, interaction-preserving POS, Products, and report
modal rendering. The only business mutation is the stored sale-completion RPC,
normally `pos_complete_shift_sale_v3`; no focus call is introduced.

Phase 4I does not authorize a UI redesign, wording change, new validation,
cache or pending-record format change, backend/schema/storage change, new or
changed RPC, RLS/auth change, retry policy, checkout/business-rule change,
production-data mutation, or modification of the retained classic asset.

The Phase 4I implementation must add exactly nine desktop-only parity/safety
tests plus two Workspace mobile tests that run in all three projects. The
complete matrix must become exactly 111 runs: 85 desktop Chromium, 13 Pixel
Chrome, and 13 iPhone WebKit. Nine desktop cases map to nine independently
failing behavior islands; the two mobile cases separate checkout interaction
from asynchronous register/refresh behavior. Tests must prove:

1. Exact API order/declaration timing, 18-name Workspace domain, registration
   slot, descriptors, bidirectional live reassignment, 11 protected-name
   invariants, exact four-script active and 18-script cached paths, unchanged
   fallback hashes, and HTTP 200 fallback delivery.
2. Both request-current helpers across generation, logout, user, business,
   coercion, short-circuit, exception, and repeated-call cases.
3. Publication and business-context loading across guards, duplicate rows,
   owner/manager versus other roles, zero/one/multiple businesses, brand
   fallback, RPC/helper/render errors, stale generations/identity, partial
   assignments, and `finally` ownership; the exact `posRpcErrorText` mapping;
   and direct `posHandleAccessDenied` calls proving non-`42501` inputs have zero
   effects while `42501` preserves the exact report-loading, cache-clear,
   context-reset, Products-render, and POS-render mutation order.
4. Cold checkout loading with exact concurrent RPC order/arguments, catalog
   and shift success/failure, access denial, receipt clearing, report modes,
   date transitions, training class, report results, render/modal order, and
   foreground partial effects, including missing client/session/user/business
   guards and checkout-submitting or operations-submitting no-op gates.
5. Cache/background checkout loading with hydration, warm-screen retention,
   synchronous and asynchronous RPC errors, overlapping catalog generations,
   access denial at all four read surfaces, report retention/clearing, stale
   points before and after reports, helper exceptions, verification locks, and
   interaction-preserving rendering.
6. Silent refresh deduplication, Promise identity, throttle boundaries, force,
   rejection cleanup, concurrent replacement, post-mutation sequencing and
   identity drift, catalog-only success/error/stale/access-denied/helper-error
   paths, proof that successful `refreshPosCatalogOnly` cannot clear an existing
   `checkoutRefreshRequired`/shift-verification lock, and the complete register-
   opening dispatch matrix.
7. Exhaustive validation precedence and numeric/reference/cash/payment
   boundaries plus exact schema-3 pending record/property/item order, two cart
   reads, UUID/Date live bindings, cash/noncash payloads, upgrade fields, and
   snapshot identity.
8. Complete deterministic-code and error-text tables plus review/cancel
   boolean-versus-Promise behavior, confirming/error/render order, thrown
   getters/coercions, and every blocked/no-op path.
9. Submission success, new versus pending retry, persistence-before-RPC,
   duplicate-click locking, exact RPC selection/arguments, synchronous throw,
   rejection/resolved error, missing receipt, stale generation/user/business,
   success mutation order, `40001`, every deterministic family, PGRST,
   uncertain lost response, refresh rejection, synchronous post-receipt
   partial failures, and pending retention/clearing. Tests must distinguish
   pre-`try` failures from `buildPosPendingSale`, `posSavePending`, or the pre-RPC
   render—which reject after their exact partial effects—from failures inside
   the `try` during RPC, success cleanup, or error cleanup, which follow the
   existing catch/recovery classification and partial-state behavior.
10. At desktop, Pixel, and iPhone widths, local review/confirmation/cancel and
    pending-retry UI, automatic focus restoration, keyboard/dismissal,
    containment, and errors remain usable with zero real network or writes.
11. At all three widths, deterministic read-only cold/background/failure
    register and refresh states preserve interaction and containment, assert
    exact allowed RPC names/arguments/counts, and perform zero persistence or
    business mutation.
12. Mobile guards are non-vacuous for `window.fetch`, Storage
    `setItem`/`removeItem`/`clear`, `cloud.client.rpc`, `cloud.client.from`,
    `cloud.client.storage.from`, checkout submission, pending/cache persistence,
    save/history hooks, inventory mutations, and every business-data write
    path. Required hooks and clients must exist; absence may not satisfy a
    zero-call assertion.
13. Desktop mutation/recovery branches use deterministic RPC/storage stubs
    only. No test may call Supabase, production object storage, or business
    data. Read stubs may allow only the exact six Workspace read RPCs and must
    assert their invocation separately.
14. The exact 182-test legacy and 175-name compatibility baselines remain
    unchanged, with all pre-existing Catalog, Publication, Stocks, POS,
    Events, cached-client, recovery, and mobile behavior green.
15. The guarded signed-in production smoke may verify the Workspace domain and
    normal read-only POS, Stocks, Ingredients, Recipes, and Pricing loading,
    but must not mutate a cart, review/submit a sale, save pending state, invoke
    a write RPC, or alter business data.

### Phase 4I implementation status (candidate)

- Four typed responsibility modules under `src/workspace` implement the exact
  ordered 18-function `workspace` compatibility domain. It registers after
  typed Stocks and before classic POS operations while compatibility contract
  version 1 retains exactly 175 protected names, including the exact 11
  bindings owned by this slice.
- The active classic runtime is reduced from five scripts to exactly four:
  `state.js`, `pos-operations.js`, `boot.js`, and `start.js`. The exact
  18-script cached/pre-module transition remains available.
- The retained `workspace-sync.js` fallback is unchanged at Git blob
  `714fa588cb0c483414ee236afd2e7f2815f25eee` and canonical LF SHA-256
  `7FEA61163419D78F1B3CD1C11B8BC6FE4E3E4FCB97B030566D6CF28BE23FAFA8`.
- Nine desktop Workspace parity/safety tests and two cross-project mobile
  Workspace tests define the exact 111-run matrix: 85 desktop Chromium, 13
  Pixel Chrome, and 13 iPhone WebKit. Local clean dependency installation,
  zero-vulnerability audit, strict type-check, 101-module production build,
  focused 15-run Workspace slice, and the complete 111-run matrix pass.
- This candidate changes no UI, backend schema, RPC, RLS/auth, storage or
  persistence format, business rule, or production data. It is not released
  until every universal gate, cross-platform PR and post-merge CI run, tested-
  artifact Pages deployment, live verification, and guarded production smoke
  pass.

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

## Phase 4C exit gates (complete)

- The exact ordered Support API `exportData`, `handleFileImport`,
  `exampleData` is registered after Stocks view and before Events.
- Typed-versus-classic traces preserve export dependency order, separate live
  URL lookups, import callback/error boundaries, exact parsed-object identity,
  the 17-ID example graph, state-before-pricing mutation, raw values, and deep
  repeated-call isolation.
- Root/domain reassignment remains live. The compatibility contract remains
  version 1 with exactly 175 names, and none of the Support names is added to
  the protected list.
- The active classic runtime is exactly 10 scripts and does not request
  `support.js`. The cached/pre-module transition remains exactly 18 scripts;
  the retained fallback is unchanged at Git blob
  `7385c19d6fabcfaea9293379c41755982567fa3b` and returns HTTP 200.
- The exact 182-test legacy baseline, 175-name compatibility baseline, and
  45-run cross-browser matrix pass locally and in Ubuntu/Windows CI.
- The tested `main` artifact is live, matches GitHub Pages, passes 390-pixel
  browser verification, and passes the guarded signed-in production smoke.
- Independent parity, scope/data-safety, test, and final-diff audits found no
  blocker. No UI, classic asset, dependency, workflow, auth, Supabase, RPC,
  storage, schema, cloud, or business-data behavior changed.

Every Phase 4C gate above passed before the phase was marked released.

## Phase 4C release record

- Contract pull request: [#23](https://github.com/Lowkiiii/Scoopies/pull/23)
- Contract commit: `dbb2473d3671dd6019a5bd1a84c313090591a61e`
- Contract merge commit: `43a987045680b5297fa50b0f8096a5654592925f`
- Contract PR CI:
  [41445963481](https://github.com/Lowkiiii/Scoopies/actions/runs/41445963481)
- Contract main CI and Pages deployment:
  [41446272376](https://github.com/Lowkiiii/Scoopies/actions/runs/41446272376)
- Implementation pull request:
  [#24](https://github.com/Lowkiiii/Scoopies/pull/24)
- Implementation commit: `d4e2760101f7f23902e1acef11010cb9ede61caf`
- Implementation merge commit:
  `c576aca099a72a9ebae5814b4b223088107bdaaa`
- Implementation PR CI:
  [41448644764](https://github.com/Lowkiiii/Scoopies/actions/runs/41448644764)
- Main CI and Pages deployment:
  [41448941575](https://github.com/Lowkiiii/Scoopies/actions/runs/41448941575)
- Signed-in production smoke:
  [41455131857](https://github.com/Lowkiiii/Scoopies/actions/runs/41455131857)
- Local verification: Node `24.22.2`; clean `npm ci`; zero audit
  vulnerabilities; strict type-check and 56-module production build passed;
  all 45 Playwright runs passed (37 desktop Chromium, 4 Pixel Chrome, and 4
  iPhone WebKit), including the exact 182-test legacy and 175-name
  compatibility baselines.
- Runtime verification: the exact ordered Support API contains `exportData`,
  `handleFileImport`, and `exampleData`; typed domain sizes are Core 15,
  Runtime 4, Costing 24, Stocks 63, Support 3, and Events 1. Exact
  typed/classic export, import, and example fingerprints, callback-time
  dependencies, bidirectional live reassignment, and Events guards passed.
- Cross-platform evidence: the complete implementation PR and post-merge
  matrices passed on both Ubuntu and Windows. Pages packaged only the verified
  Ubuntu `dist/` after both operating-system jobs passed.
- Production artifact verification: all 22 files in the downloaded tested CI
  artifact returned HTTP 200 from GitHub Pages and matched live content after
  line-ending normalization. Pages served `index-8fu7O1Dd.js` and
  `index-B0B7i9SZ.css`; the exact 10-script active runtime did not request the
  classic Support file, while the exact 18-script cached transition and
  unchanged `support.js` fallback matched the tested artifact.
- Production browser verification: a fresh 390-pixel Chromium session loaded
  the exact active order, finalized the version-1 175-name contract, exposed
  typed domain sizes 15/4/24/63/3/1 in the exact Core/Runtime/Costing/Stocks/
  Support/Events order, displayed at 390/390 width, and reported zero page
  errors, console errors, or failed requests.
- Signed-in verification: the protected main-only smoke loaded the real POS,
  Stocks, Ingredients, Recipes, and Pricing views. Client and network guards
  allowed no business-data write to escape and retained no credentials,
  screenshots, traces, videos, or business-data artifacts. Import and example
  actions were not invoked against production.
- Review evidence: independent parity, scope/data-safety, test, and final-diff
  audits found no blocker. The 13-file implementation changed only the typed
  Support boundary, its registration/manifest, exact tests, and documentation;
  the retained classic fallback remained byte-identical.

## Phase 4D exit gates (complete)

- The exact ordered 13-binding Costing presentation API is registered after
  `publication.js` and before `render-modals.js` and `render-pos.js`, growing
  the Costing domain from 24 to 37 names without changing compatibility
  version 1 or its exact 175-name baseline.
- Typed-versus-classic helper and DOM fingerprints preserve values, coercion,
  escaping, grouping, filtering, failure order, return values, missing-node
  behavior, publication HTML, and exact call-time dependency access, including
  ordered `state` and `ingredientUi` reads and the allowed invalid-category
  reset.
- Root/domain reassignment remains live. Only `renderIngredients` and
  `renderProducts` join the protected Costing contract list.
- The active classic runtime is exactly 9 scripts and does not request
  `render-costing.js`. The cached/pre-module transition remains exactly 18
  scripts; the retained fallback is unchanged at Git blob
  `2ac06eb5e370e4026393ff3623b0dd59ed39117d` and canonical SHA-256
  `FA9B4020D890BCD0AE5D9C4249213A182C2B3563D23C40BCD0B33440DBE2E04E`.
- The exact 182-test legacy baseline, 175-name compatibility baseline, and
  51-run cross-browser matrix pass locally and in Ubuntu/Windows CI.
- The tested `main` artifact is live, matches all 22 GitHub Pages files
  byte-for-byte, passes fresh 390-pixel browser verification, and passes the
  guarded signed-in production smoke.
- Independent contract, parity, scope/data-safety, security, test, mobile, and
  release-readiness audits found no blocker. No auth, Supabase, RPC, storage,
  persistence, schema, cloud, or business-data behavior changed.

Every Phase 4D gate above passed before the phase was marked released.

## Phase 4D release record

- Contract pull request: [#26](https://github.com/Lowkiiii/Scoopies/pull/26)
- Contract commit: `711b1c098cd606fcd271772286ac93eb3409b109`
- Contract merge commit: `471bcf48877476e737bcb5c89c7f9756c1890745`
- Contract PR CI:
  [41460060122](https://github.com/Lowkiiii/Scoopies/actions/runs/41460060122)
- Contract main CI and Pages deployment:
  [41460470177](https://github.com/Lowkiiii/Scoopies/actions/runs/41460470177)
- Implementation pull request:
  [#27](https://github.com/Lowkiiii/Scoopies/pull/27)
- Implementation commit: `a0258d81abaf2643ea4b1d0b3e9db0df53bbd495`
- Implementation merge commit:
  `659b9b9e6de5e05927571867dd7de4f202314c29`
- Implementation PR CI:
  [41488923329](https://github.com/Lowkiiii/Scoopies/actions/runs/41488923329)
- Main CI and Pages deployment:
  [41489311793](https://github.com/Lowkiiii/Scoopies/actions/runs/41489311793)
- Signed-in production smoke:
  [41490087267](https://github.com/Lowkiiii/Scoopies/actions/runs/41490087267)
- Local verification: Node `24.22.2`; zero audit vulnerabilities; strict
  type-check and 60-module production build passed; all 51 Playwright runs
  passed (41 desktop Chromium, 5 Pixel Chrome, and 5 iPhone WebKit), including
  the exact 182-test legacy and 175-name compatibility baselines.
- Runtime verification: the exact ordered Costing presentation API contains
  `unitOptions`, `optionList`, `escapeHtml`, `categoryOptions`,
  `ingredientOptions`, `selectedRealCategory`, `ingredientMatchesView`,
  `renderCategoryBar`, `renderIngredients`, `renderPackaging`, `renderRecipes`,
  `recipeBreakdownHtml`, and `renderProducts`. Typed domain sizes are Core 15,
  Runtime 4, Costing 37, Stocks 63, Support 3, and Events 1.
- Cross-platform evidence: the complete implementation PR and post-merge
  matrices passed on both Ubuntu and Windows. Pages packaged only the verified
  Ubuntu `dist/` after both operating-system jobs passed.
- Production artifact verification: all 22 files in the downloaded tested CI
  artifact returned HTTP 200 from GitHub Pages and matched live bytes exactly.
  Pages served `index-CrIo5T4u.js` and `index-B0B7i9SZ.css`; the exact 9-script
  active runtime did not request the classic Costing renderer, while the exact
  18-script cached transition and unchanged `render-costing.js` fallback
  matched the tested artifact.
- Production browser verification: a fresh 390-pixel Chromium session loaded
  the exact active order, finalized the version-1 175-name contract, exposed
  typed domain sizes 15/4/37/63/3/1 in the exact Core/Runtime/Costing/Stocks/
  Support/Events order, displayed at 390/390 width, and reported zero page
  errors, console errors, failed requests, or server errors.
- Signed-in verification: the protected main-only smoke loaded the real POS,
  Stocks, Ingredients, Recipes, and Pricing views. Client and network guards
  allowed no business-data write to escape and retained no credentials,
  screenshots, traces, videos, or business-data artifacts.
- Review evidence: independent contract, source-parity, test, security/scope,
  mobile, final-diff, and release-readiness audits found no blocker. The
  15-file implementation changed only the typed Costing presentation boundary,
  its compatibility registration and manifest slot, exact tests, matrix
  configuration, and documentation; the retained classic fallback remained
  byte-identical.

## Phase 4E exit gates (complete)

- The exact ordered 19-binding POS presentation API is registered after
  classic `render-modals.js` and before the typed Stocks view. Typed domain
  order is Core, Runtime, Costing, Stocks, POS, Support, Events, Legacy, while
  compatibility remains version 1 with exactly 175 protected names.
- Typed-versus-classic renderer and controller fingerprints preserve exact
  values, HTML, coercion, locale handling, repeated calls, DOM effects,
  failure order, focus, scroll, caret restoration, and call-time access to
  sibling functions and browser natives.
- Root/domain reassignment remains bidirectionally live. The existing typed
  Stocks `renderPos` and `renderAll` functions remain in the Stocks domain,
  and all classic and typed downstream consumers continue to resolve the new
  POS presentation functions live.
- The active classic runtime is exactly eight scripts and no longer requests
  `render-pos.js`. The cached/pre-module transition remains exactly 18
  scripts; the retained fallback is unchanged at Git blob
  `4b40f2e9d57d1f5b11debe8bab95883d30e5df3c` and canonical SHA-256
  `AF0676AD15E53099F1F9B526FE9340A63C9A88671191E793AA56CE4EA34FDE12`.
- The exact 182-test legacy baseline, 175-name compatibility baseline, and
  57-run cross-browser matrix pass locally and in Ubuntu/Windows CI.
- The tested `main` artifact is live, matches all 22 GitHub Pages files
  byte-for-byte, passes fresh 390-pixel browser verification, and passes the
  guarded signed-in production smoke.
- Independent parity, test-strength, scope/data-safety, and final-diff audits
  found no blocker. No auth, Supabase, RPC, storage, persistence, checkout,
  shift, void, stock, schema, cloud, or business-data behavior changed.

Every Phase 4E gate above passed before the phase was marked released.

## Phase 4E release record

- Contract pull request: [#29](https://github.com/Lowkiiii/Scoopies/pull/29)
- Contract commit: `512d8a06b41c27cf3956772a3a84844aa0be8139`
- Contract merge commit: `c97312b15ab2c29de8b56de8a81e80dcb903a57d`
- Contract PR CI:
  [41493938101](https://github.com/Lowkiiii/Scoopies/actions/runs/41493938101)
- Contract main CI and Pages deployment:
  [41494465084](https://github.com/Lowkiiii/Scoopies/actions/runs/41494465084)
- Implementation pull request:
  [#30](https://github.com/Lowkiiii/Scoopies/pull/30)
- Implementation commit: `fafe89578f514fb591a8489c803afe02b3f50c71`
- Implementation merge commit:
  `b6d8f217a606adcce814b0ddba65730a150fae5c`
- Implementation PR CI:
  [41498399877](https://github.com/Lowkiiii/Scoopies/actions/runs/41498399877)
- Main CI and Pages deployment:
  [41498858258](https://github.com/Lowkiiii/Scoopies/actions/runs/41498858258)
- Signed-in production smoke:
  [41499853409](https://github.com/Lowkiiii/Scoopies/actions/runs/41499853409)
- Local verification: Node `24.22.2`; clean `npm ci`; zero audit
  vulnerabilities; strict type-check and 65-module production build passed;
  all 57 Playwright runs passed (45 desktop Chromium, 6 Pixel Chrome, and 6
  iPhone WebKit), including the exact 182-test legacy and 175-name
  compatibility baselines.
- Runtime verification: the exact ordered POS presentation API contains
  `posPaymentLabel`, `posSummaryHtml`, `posReceiptHtml`,
  `posProductCardHtml`, `posCatalogHtml`, `posCashSuggestions`,
  `updatePosPaymentPreview`, `posCartHtml`, `posSalesRowsHtml`,
  `posRecentHtml`, `posShiftBarHtml`, `posNoShiftGateHtml`, `managePosMenu`,
  `posWorkspaceHtml`, `posMobileOrderBarHtml`, `focusPosCart`,
  `posSyncStatusHtml`, `posCriticalRefreshNoticeHtml`, and
  `renderPosPreservingInteraction`. Typed domain sizes are Core 15, Runtime 4,
  Costing 37, Stocks 63, POS 19, Support 3, and Events 1.
- Cross-platform evidence: the complete implementation PR and post-merge
  matrices passed on both Ubuntu and Windows. Pages packaged only the verified
  Ubuntu `dist/` after both operating-system jobs passed.
- Production artifact verification: all 22 files in the downloaded tested CI
  artifact returned HTTP 200 from GitHub Pages and matched live bytes exactly.
  Pages served `index-B5WJ7yAv.js` and `index-B0B7i9SZ.css`; the exact
  eight-script active runtime did not request the classic POS renderer, while
  the exact 18-script cached transition and unchanged `render-pos.js` fallback
  matched the tested artifact.
- Production browser verification: a fresh 390-pixel Chromium session loaded
  the exact active order, finalized the version-1 175-name contract, exposed
  typed domain sizes 15/4/37/63/19/3/1 in the exact Core/Runtime/Costing/
  Stocks/POS/Support/Events order, displayed at 390/390 width, and reported
  zero page errors, console errors, failed requests, or server errors.
- Signed-in verification: the protected main-only smoke loaded the real POS,
  Stocks, Ingredients, Recipes, and Pricing views. Client and network guards
  allowed no business-data write to escape and retained no credentials,
  screenshots, traces, videos, or business-data artifacts.
- Review evidence: independent parity, test-strength, scope/data-safety, and
  final-diff audits found no blocker. The 17-file implementation changed only
  the typed POS presentation boundary, its compatibility registration and
  manifest slot, exact tests, matrix configuration, and documentation; the
  retained classic fallback remained byte-identical.

## Phase 4F exit gates (complete)

- The exact ordered 10-binding Publication API is registered after classic
  `workspace-sync.js` and `pos-operations.js`, before the typed Costing view.
  Typed domain order is Core, Runtime, Costing, Stocks, Publication, POS,
  Support, Events, Legacy, while compatibility remains version 1 with exactly
  175 protected names.
- Typed-versus-classic fingerprints preserve exact values, HTML, modal and
  focus behavior, timeout fallbacks, native-call order, dependency traversal,
  RPC payloads, stale-session and stale-generation exits, error handling, and
  call-time access to sibling functions and browser state.
- Product deletion remains fail-closed. Rejected, cancelled, stale, missing,
  unauthorized, disconnected, and actively published paths perform no product
  or persistence mutation; confirmed deletion retains its exact single strict-
  ID assignment and follow-up order.
- The active classic runtime is exactly seven scripts and no longer requests
  `publication.js`. The cached/pre-module transition remains exactly 18
  scripts; the retained fallback is unchanged at Git blob
  `49d4ec24d9fecf986ce7d4f373acd339ac483ca7` and canonical SHA-256
  `78BD373602F683259C1E5CF166B21084F21D2E19E83687CAF7C4C0307AFFE1B5`.
- The exact 182-test legacy baseline, 175-name compatibility baseline, and
  64-run cross-browser matrix pass locally and in Ubuntu/Windows CI.
- The tested `main` artifact is live, matches all 22 GitHub Pages files
  byte-for-byte, passes fresh 390-pixel browser verification, and passes the
  guarded signed-in production smoke.
- Independent source-parity, test-strength, scope/data-safety, final-diff, and
  release-readiness audits found no blocker. No auth, Supabase, RPC contract,
  storage, persistence, checkout, shift, void, stock, schema, cloud, or
  business-data behavior changed.

Every Phase 4F gate above passed before the phase was marked released.

## Phase 4F release record

- Contract pull request: [#32](https://github.com/Lowkiiii/Scoopies/pull/32)
- Contract commit: `0633f004dcdaca67d4752a51b0da97d4bfed3dc2`
- Contract merge commit: `4b88c5b34113180e7d32d81c3fd90e9f30b3cddd`
- Contract PR CI:
  [41515973930](https://github.com/Lowkiiii/Scoopies/actions/runs/41515973930)
- Contract main CI and Pages deployment:
  [41516412455](https://github.com/Lowkiiii/Scoopies/actions/runs/41516412455)
- Implementation pull request:
  [#33](https://github.com/Lowkiiii/Scoopies/pull/33)
- Implementation commit: `e60b212c6ab64b594a9363f9dc53713333f2175a`
- Implementation merge commit:
  `02e7465c2ac91bbe8d8fd3c6e2fc0016a774438c`
- Implementation PR CI:
  [41521076956](https://github.com/Lowkiiii/Scoopies/actions/runs/41521076956)
- Main CI and Pages deployment:
  [41521530950](https://github.com/Lowkiiii/Scoopies/actions/runs/41521530950)
- Signed-in production smoke:
  [41522515831](https://github.com/Lowkiiii/Scoopies/actions/runs/41522515831)
- Local verification: Node `24.22.2`; clean `npm ci`; zero audit
  vulnerabilities; strict type-check and 73-module production build passed;
  all 64 Playwright runs passed (50 desktop Chromium, 7 Pixel Chrome, and 7
  iPhone WebKit), including the exact 182-test legacy and 175-name
  compatibility baselines.
- Runtime verification: the exact ordered Publication API contains
  `publicationStatusFor`, `posPublicationHtml`, `openPublishProductModal`,
  `closePublishProductModal`, `renderPublishProductModal`,
  `waitForCostingSync`, `publishProductToPos`,
  `explainPublishedProductDelete`, `deleteCostingProduct`, and
  `ingredientDependsOn`. Typed domain sizes are Core 15, Runtime 4, Costing 37,
  Stocks 63, Publication 10, POS 19, Support 3, and Events 1.
- Cross-platform evidence: the complete implementation PR and post-merge
  matrices passed on both Ubuntu and Windows. Pages packaged only the verified
  Ubuntu `dist/` after both operating-system jobs passed.
- Production artifact verification: all 22 files in the downloaded tested CI
  artifact returned HTTP 200 from GitHub Pages and matched live bytes exactly.
  Pages served `index-D4nE7OhW.js` and `index-B0B7i9SZ.css`; the exact seven-
  script active runtime did not request the classic Publication asset, while
  the exact 18-script cached transition and unchanged `publication.js`
  fallback matched the tested artifact.
- Production browser verification: a fresh 390-pixel Chromium session loaded
  the exact active order, finalized the version-1 175-name contract, exposed
  typed domain sizes 15/4/37/63/10/19/3/1 in the exact Core/Runtime/Costing/
  Stocks/Publication/POS/Support/Events order, displayed at 390/390 width, and
  reported zero page errors, console errors, failed requests, or server
  errors.
- Signed-in verification: the protected main-only smoke loaded the real POS,
  Stocks, Ingredients, Recipes, and Pricing views. Client and network guards
  allowed no business-data write to escape and retained no credentials,
  screenshots, traces, videos, or business-data artifacts.
- Review evidence: independent source-parity, test-strength, scope/data-
  safety, final-diff, and release-readiness audits found no blocker. The
  21-file implementation changed only the typed Publication authority
  boundary, its compatibility registration and manifest slot, exact tests,
  matrix configuration, and documentation; the retained classic fallback
  remained byte-identical.

## Phase 4G exit gates (complete)

- The exact ordered 46-binding Modals API is registered after Publication and
  the typed Costing view, before the typed POS and Stocks views. Typed domain
  order is Core, Runtime, Costing, Stocks, Publication, Modals, POS, Support,
  Events, Legacy, while compatibility remains version 1 with exactly 175
  protected names.
- Typed-versus-classic fingerprints preserve exact lifecycle, focus, pending-
  remote reconciliation, category and purchased-input workflows, mixture
  sessions, conflicts, drafts, editor HTML, validation, Promise behavior,
  partial exceptions, mutation order, and live call-time dependencies.
- The active classic runtime is exactly six scripts and no longer requests
  `render-modals.js`. The cached/pre-module transition remains exactly 18
  scripts; the retained fallback is unchanged at Git blob
  `86175e501cbaaaa4136b01f7e9c0ec1483ab9b2d` and canonical SHA-256
  `881269390352390F1C77F78B3D9230403E2A7E41498C11B0DA3B33914299819C`.
- The exact 182-test legacy baseline, 175-name compatibility baseline, and
  78-run cross-browser matrix pass locally and in Ubuntu/Windows CI.
- The tested `main` artifact is live, matches all 22 GitHub Pages files byte-
  for-byte, passes fresh 390-pixel browser verification, and passes the guarded
  signed-in production smoke.
- Independent source-parity, test-strength, focus/accessibility, final-diff,
  and release-readiness audits found no blocker. No auth, Supabase, RPC,
  storage, persistence, checkout, shift, void, stock, schema, cloud, UI copy,
  or business-data behavior changed.

Every Phase 4G gate above passed before the phase was marked released.

## Phase 4G release record

- Contract pull request: [#35](https://github.com/Lowkiiii/Scoopies/pull/35)
- Contract commit: `f6591e93fe327b34cd06b2485f874b1c69e5c754`
- Contract merge commit: `de93f927a3764c04ba35b5a9479e4cd8f3df4e3f`
- Contract PR CI:
  [41525932927](https://github.com/Lowkiiii/Scoopies/actions/runs/41525932927)
- Contract main CI and Pages deployment:
  [41526295935](https://github.com/Lowkiiii/Scoopies/actions/runs/41526295935)
- Implementation pull request:
  [#36](https://github.com/Lowkiiii/Scoopies/pull/36)
- Implementation commit: `07dcc8d707634114c53ee4dfd82c67be5b6fb490`
- Implementation merge commit:
  `06260c0a80c75e614e92998791725beed192a835`
- Implementation PR CI:
  [41597956243](https://github.com/Lowkiiii/Scoopies/actions/runs/41597956243)
- Main CI and Pages deployment:
  [41598233697](https://github.com/Lowkiiii/Scoopies/actions/runs/41598233697)
- Signed-in production smoke:
  [41598945883](https://github.com/Lowkiiii/Scoopies/actions/runs/41598945883)
- Local verification: Node `24.22.2`; clean `npm ci`; zero audit
  vulnerabilities; strict type-check and 83-module production build passed;
  all 78 Playwright runs passed (60 desktop Chromium, 9 Pixel Chrome, and 9
  iPhone WebKit), including the exact 182-test legacy and 175-name
  compatibility baselines.
- Runtime verification: the exact ordered Modals API contains 46 functions,
  its five protected root bindings remain live, and typed domain sizes are
  Core 15, Runtime 4, Costing 37, Stocks 63, Publication 10, Modals 46, POS 19,
  Support 3, and Events 1.
- Cross-platform evidence: the complete implementation PR and post-merge
  matrices passed on both Ubuntu and Windows. Pages packaged only the verified
  Ubuntu `dist/` after both operating-system jobs passed.
- Production artifact verification: all 22 files in the downloaded tested CI
  artifact returned HTTP 200 from GitHub Pages and matched live SHA-256 bytes
  exactly. Pages served `index-DqqI7Hp8.js` and `index-B0B7i9SZ.css`; the exact
  six-script active runtime did not request the classic Modal asset, while the
  exact 18-script cached transition and unchanged `render-modals.js` fallback
  matched the tested artifact.
- Production browser verification: a fresh 390-pixel Chromium session loaded
  the exact active order, finalized the version-1 175-name contract, exposed
  typed domain sizes 15/4/37/63/10/46/19/3/1 in the exact Core/Runtime/
  Costing/Stocks/Publication/Modals/POS/Support/Events order, displayed at
  390/390 width, and reported zero page errors, console errors, failed
  requests, server errors, or classic Modal requests.
- Signed-in verification: the protected main-only smoke loaded the real POS,
  Stocks, Ingredients, Recipes, and Pricing views. Client and network guards
  allowed no business-data write to escape and retained no credentials,
  screenshots, traces, videos, or business-data artifacts.
- Review evidence: independent source-parity, test-strength, focus/
  accessibility, final-diff, and release-readiness audits found no blocker. The
  24-file implementation changed only the typed Modals boundary, compatibility
  registration and manifest slot, exact tests, matrix configuration, and
  documentation; the retained classic fallback remained byte-identical.

## Phase 4H exit gates (complete)

- The exact ordered 81-binding Catalog API is registered after Costing and
  before Stocks. Typed domain order is Core, Runtime, Costing, Catalog, Stocks,
  Publication, Modals, POS, Support, Events, Legacy; compatibility remains
  version 1 with exactly 175 protected names, including the exact 32 bindings
  owned by this slice.
- Typed-versus-classic fingerprints preserve checkout/report and Stocks
  lifecycle, cart math/actions, scoped caching, pending-sale migration and
  recovery, catalog drift, drink media, image decoding/cropping, editor input,
  upload/remove recovery, stale-request safety, mutation order, cleanup,
  Promise/error behavior, and live call-time dependencies.
- The active classic runtime is exactly five scripts and no longer requests
  `pos-catalog.js`. The cached/pre-module transition remains exactly 18
  scripts; the retained fallback is unchanged at Git blob
  `34e2b5bfb1fd53637cb65fee9fd07358ff751230` and canonical SHA-256
  `35DE3699B50201D64F4F574C45E8D296917C63A8EE70E1C95103D25BE08B8DFC`.
- The exact 182-test legacy baseline, 175-name compatibility baseline, and
  96-run cross-browser matrix pass locally and in Ubuntu/Windows CI.
- The tested `main` artifact is live, matches all 22 GitHub Pages files byte-
  for-byte, passes fresh 390-pixel browser verification, and passes the guarded
  signed-in production smoke.
- Independent source-parity, integration, strict test-strength, mobile-safety,
  final-diff, and release-readiness audits found no blocker. No auth, Supabase,
  RPC, schema, storage format, persistence, checkout, shift, void, stock, cloud,
  UI copy/design, business rule, or production-data behavior changed.

Every Phase 4H gate above passed before the phase was marked released.

## Phase 4H release record

- Contract pull request: [#38](https://github.com/Lowkiiii/Scoopies/pull/38)
- Contract commit: `06fe21a8c3c3b9f59d40ac41a22fa288fd93c8ed`
- Contract merge commit: `6ff7ac937f9e024e18b21c7c5639d4f2305c3ffb`
- Contract PR CI:
  [41602014935](https://github.com/Lowkiiii/Scoopies/actions/runs/41602014935)
- Contract main CI and Pages deployment:
  [41602370277](https://github.com/Lowkiiii/Scoopies/actions/runs/41602370277)
- Implementation pull request:
  [#39](https://github.com/Lowkiiii/Scoopies/pull/39)
- Implementation commit: `a70c6963cb5a8882be1c0b9de84067e0b041c5e0`
- Implementation merge commit:
  `20fe020d14476434d0815f74f1ef7cee0a55d5fe`
- Implementation PR CI:
  [41609001012](https://github.com/Lowkiiii/Scoopies/actions/runs/41609001012)
- Main CI and Pages deployment:
  [41609318120](https://github.com/Lowkiiii/Scoopies/actions/runs/41609318120)
- Signed-in production smoke:
  [41610161506](https://github.com/Lowkiiii/Scoopies/actions/runs/41610161506)
- Local verification: Node `24.22.2`; clean `npm ci`; zero audit
  vulnerabilities; strict type-check and 93-module production build passed;
  all 96 Playwright runs passed (74 desktop Chromium, 11 Pixel Chrome, and 11
  iPhone WebKit), including the exact 182-test legacy and 175-name
  compatibility baselines.
- Runtime verification: the exact ordered Catalog API contains 81 functions,
  its 32 protected root bindings remain live, and typed domain sizes are Core
  15, Runtime 4, Costing 37, Catalog 81, Stocks 63, Publication 10, Modals 46,
  POS 19, Support 3, and Events 1.
- Cross-platform evidence: the complete implementation PR and post-merge
  matrices passed on both Ubuntu and Windows. Pages packaged only the verified
  Ubuntu `dist/` after both operating-system jobs passed.
- Production artifact verification: all 22 files in the downloaded tested CI
  artifact returned HTTP 200 from GitHub Pages and matched live SHA-256 bytes
  exactly. Pages served `index-CXMXeHu7.js` and `index-B0B7i9SZ.css`; the exact
  five-script active runtime did not request the classic Catalog asset, while
  the exact 18-script cached transition and unchanged `pos-catalog.js` fallback
  matched the tested artifact.
- Production browser verification: a fresh 390-pixel Chromium session loaded
  the exact active order, finalized the version-1 175-name contract, exposed
  typed domain sizes 15/4/37/81/63/10/46/19/3/1 in the exact Core/Runtime/
  Costing/Catalog/Stocks/Publication/Modals/POS/Support/Events order, displayed
  at 390/390 width, and reported zero page errors, console errors, failed
  requests, server errors, or classic Catalog requests.
- Signed-in verification: the protected main-only smoke loaded the real POS,
  Stocks, Ingredients, Recipes, and Pricing views. Client and network guards
  allowed no business-data write to escape and retained no credentials,
  screenshots, traces, videos, or business-data artifacts.
- Review evidence: independent source-parity, integration, strict test-
  strength, mobile-safety, final-diff, and release-readiness audits found no
  blocker. The 25-file implementation changed only the typed Catalog boundary,
  compatibility registration and manifest slot, exact tests, matrix
  configuration, and candidate documentation; the retained classic fallback
  remained byte-identical.

No later Phase 4 executable slice is released until its exact API and parity
contract is frozen and all applicable gates have recorded evidence.
