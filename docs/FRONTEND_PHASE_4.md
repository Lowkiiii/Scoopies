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
- **4F — typed POS publication (implementation candidate):** the exact
  publication status, modal, RPC, safe product deletion, and ingredient-
  dependency contract merged at
  `4b88c5b34113180e7d32d81c3fd90e9f30b3cddd`. Its bounded implementation is
  under verification and is not released until every gate below passes.
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

### Phase 4F implementation status (release candidate)

- The exact ordered 10-name API is implemented in responsibility-focused typed
  Publication modules and registered after classic `workspace-sync.js` and
  `pos-operations.js`, before the typed Costing view.
- The active manifest omits only `publication.js`, leaving exactly seven
  classic scripts. The unchanged file remains in `assets/js` and in the exact
  18-script cached/pre-module transition.
- Four desktop parity/data-safety tests and one cross-project write-free mobile
  test implement the frozen 64-run matrix. Release still requires the complete
  local, Ubuntu, Windows, Pages, production-browser, signed-in smoke, and final
  independent-review gates.
- No backend, schema, RLS, auth, storage format, RPC contract, or production-data
  change is part of the implementation.

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

No later Phase 4 executable slice is released until its exact API and parity
contract is frozen and all applicable gates have recorded evidence.
