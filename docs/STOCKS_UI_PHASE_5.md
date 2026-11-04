# Stocks UI Phase 5

## Status

Phase 5A is the released, documentation-only contract for the Matcha Luna
Stocks redesign. It was merged separately at
`dbddd613b6db14ad71da3dac4f96c04f3a9a5e3c`. Phase 5B is the independently
reviewed implementation candidate; it remains off production until its pull
request and post-merge release gates pass.

Phase 5 is intentionally split into three independently reviewable steps:

1. **Phase 5A — contract:** freeze the information architecture, responsive
   behavior, compatibility boundary, test updates, release gates, and rollback.
2. **Phase 5B — implementation:** change only the typed Stocks renderer,
   isolated Stocks styles, and the tests named by this contract.
3. **Phase 5C — release:** verify both operating systems, the full browser
   matrix, cached fallback, automatic tested-artifact Pages deployment, live
   mobile layout, and guarded signed-in production reads before recording the
   release.

This numbering is separate from the historical inventory database phases.

## User outcome

The Stocks page must become a clean, Shopify-inspired inventory workspace:

- an ingredient or prepared mixture is identified in the left-most field;
- its status, current amount, alert threshold, and last update read from left
  to right in one predictable row;
- search and filters remain immediately available above the inventory;
- an authorized operator can open the existing stock-update modal from the
  same row; and
- a phone shows the same information as compact labeled row cards without
  hiding controls or creating page-level horizontal scrolling.

The redesign is presentational. It must not change what a stock amount means,
how a movement is calculated, who may update it, or how it is saved.

## Baseline verified before Phase 5A

The entry gate was rerun before this contract branch was created:

- the working tree and public `main` were synchronized at `62ec615`;
- strict type-check and the 127-module production build passed;
- all 168 Playwright runs passed: 130 desktop Chromium, 19 Pixel Chrome, and
  19 iPhone WebKit;
- the focused Stocks slice passed all 12 runs;
- final Phase 4M CI, Pages deployment, and signed-in read-only smoke passed on
  the same commit; and
- a fresh 390-pixel production probe exposed the version-1, 175-name facade,
  the exact typed-domain order, a 390/390 contained page, no classic State,
  Bootstrap, or Start request, and zero page, console, request, or server
  errors.

The four functions in the typed Runtime namespace are the required runtime
factories. The Phase 4M "empty runtime" invariant refers to zero fresh classic
runtime script nodes, not an empty typed Runtime API.

## Existing ownership boundary

Phase 5 must respect the current ownership split:

| Responsibility | Existing owner |
| --- | --- |
| Stocks page, inventory rows, summaries, loading/error states, movement history | `src/stocks/rendering.ts` |
| Status, quantities, filtering, sorting, and summary counts | `src/stocks/formatting.ts` |
| Item normalization and inventory business rules | `src/stocks/domain.ts` |
| Update modal, validation, preview, and submission | `src/stocks/modal.ts` |
| Delegated actions and form events | `src/events/` |
| Stocks presentation styles | the isolated Stocks block in `assets/styles.css` |
| Cached/pre-module presentation fallback | `assets/js/render-stocks.js` |

The normalized item model already supplies every Phase 5B display field. No
database, RPC, or persisted-data change is required.

## Frozen desktop and tablet design

The inventory content remains inside the existing Stocks workspace and uses
the existing Matcha Luna brand tokens. Phase 5B must render these regions in
this order:

1. **Page heading:** `Stocks`, the physical-inventory description, last-sync
   text, role badge, and existing Refresh action.
2. **Safety and recovery notices:** existing connection, source-conflict,
   pending-recovery, notice, and manual-inventory messages. Their conditions
   and wording meaning remain intact; presentation may be made more compact.
3. **Summary metrics:** Tracked, Low stock, Out of stock, and Not counted.
   These remain buttons that select the corresponding status filter.
4. **Toolbar:** labeled search, labeled item-type selector, status filters, and
   the visible-result count.
5. **Inventory surface:** one semantic table, visually styled as a clean
   Shopify-like inventory list.
6. **Movement history:** the existing append-only history below inventory,
   unchanged in behavior.

The summary metrics and status chips intentionally provide two paths to the
same status filter. Both remain for compatibility and fast operation; Phase 5B
must not consolidate or remove either control set.

The inventory table has this exact visual column order:

| Column | Required content |
| --- | --- |
| Item | Name, category, Purchased or Prepared mixture badge, and an inline Removed from costing warning when applicable |
| Status | In stock, Low stock, Out of stock, or Not counted, expressed with text and semantic color |
| On hand | Existing formatted balance, or `Not counted` when no physical count exists |
| Low-stock alert | Existing formatted threshold, or `Disabled` |
| Last updated | Existing localized movement time, or `No count yet` |
| Action | Existing `Update stock` action for authorized users; muted `Read only` text and no mutation button for read-only users |

The table uses a real `<table>`, `<thead>`, column headers with `scope="col"`,
and a row header for the item identity. It is not a visual grid made from
unrelated `<div>` elements. Long names and categories wrap without expanding
the document. A row may highlight on hover or keyboard focus, but status may
never be communicated by color alone.

Desktop and tablet requirements:

- the table uses the available card width and stays within its own container;
- headings and values align consistently from row to row;
- the item identity and on-hand amount have the strongest visual hierarchy;
- table rows remain comfortable for touch as well as mouse input;
- the update action has a minimum 44-pixel target; and
- any necessary horizontal containment belongs to the inventory surface,
  never to the page body.

## Frozen mobile design

At 700 pixels and below, the same semantic table and the same row data become
compact labeled row cards through CSS. Phase 5B must not maintain a second
mobile markup tree.

Each mobile row shows, in order:

1. item name, category, kind, and source warning;
2. textual stock status;
3. On hand;
4. Low-stock alert;
5. Last updated; and
6. the authorized Update stock action.

Every non-identity value has a visible mobile label derived from its table
column. The page must fit a 390-pixel viewport exactly, the toolbar stacks
without clipped fields, every control remains keyboard reachable, and all
interactive targets are at least 44 pixels high or wide. Opening and closing
the existing stock modal must preserve its current focus, Escape, backdrop,
validation, and submission behavior.

On mobile, the table header is visually hidden with an accessible hiding
technique; it is not removed with `display:none`. Native table, row, row-header,
cell, and column-header semantics must remain discoverable in both Chromium
and WebKit after responsive card styling.

## Brand and visual rules

The redesign reuses the application's existing design system rather than
introducing one-off colors:

- brand navy `#00387f` for headings, active controls, focus treatment, and
  primary quantities;
- blush `#ffd0db` / `--pink-soft` for selected and hover surfaces;
- existing card, cream, line, text, and muted tokens for surfaces and borders;
- existing green, amber, and red semantic colors for inventory status; and
- visible focus treatment with adequate contrast on every control.

The result should feel lighter and denser than the current two-column card
grid, but not spreadsheet-small. Readability and fast touch operation take
priority over fitting more columns on screen.

## Stable compatibility contract

Phase 5B must preserve all existing data and action hooks:

- `#stockSearch`, `#stockKindFilter`, `#stockVisibleCount`, `#stockResults`;
- `data-act="setStockStatus"`, `data-act="refreshStocks"`, and
  `data-act="openStockModal"`;
- each item's `data-id` action value and `data-stock-item` identity;
- current search, status filter, kind filter, sorting, permission, disabled,
  conflict, warning, refresh, recovery, and read-only behavior;
- the exact 36-function Stocks domain and ordered 27-function Stocks view API;
- the combined 63-function typed Stocks namespace and the version-1,
  175-name browser compatibility facade; and
- the public compatibility function name `stockItemCardsHtml`, even though its
  typed implementation will return the new inventory-table markup.

Phase 5B adds these stable typed-view selectors for focused tests and future
maintenance:

- `.stock-inventory` for the contained inventory surface;
- `.stock-table` for the semantic table;
- `.stock-row[data-stock-item]` for each item row; and
- `[data-stock-field]` for responsive mobile labels and value cells, using the
  exact values `item`, `status`, `on-hand`, `threshold`, `updated`, and
  `action`.

Every responsive value cell also carries a human-readable `data-label` that
matches its visible column label. The Item field is the row header. These
identifiers are presentation hooks only and must not become persisted data.

Fresh typed presentation is intentionally allowed to differ from the retained
classic card presentation. `assets/js/render-stocks.js` must remain byte
unchanged for cached/pre-module clients. At this contract baseline its Git blob
is `d734b8c5b0ebb4d60916e42561083db80b2f0ec8` and its LF-normalized SHA-256 is
`1bb2a3c272b8473b63a6ff41c88500ec370a130960cd087882a8de65e32fb754`.

## State and accessibility behavior

All current branches remain explicit and usable:

- signed out;
- workspace opening;
- workspace unavailable with Retry;
- initial stock loading;
- initial stock error with Retry Stocks;
- tracked items;
- no tracked ingredients;
- no search/filter matches;
- incomplete refresh while last confirmed amounts remain visible;
- pending exact-retry recovery;
- costing/stock source conflict;
- removed costing source; and
- read-only access.

The result count becomes a polite live region. Active summary and status filter
buttons expose `aria-pressed`. The inventory table has a descriptive accessible
caption. Disabled update actions retain their existing explanatory title, and
read-only rendering exposes muted `Read only` text but no stock-mutation
button.

## Explicit exclusions

Phase 5 does not authorize any of the following:

- automatic POS sale-to-stock deduction;
- recipe or packaging consumption;
- prepared-batch production or mixture deductions;
- Supabase schema, migration, RPC, RLS, storage, or authentication changes;
- inventory calculation, unit conversion, threshold, or sorting changes;
- price, costing, or stock-value columns;
- inline quantity editing;
- bulk selection or bulk actions;
- new pagination, exports, or movement-history behavior;
- changes to the stock modal's actions or persistence; or
- edits to the classic cached fallback.

Those are separate business/data phases and require their own contracts.

## Phase 5B implementation boundary

Allowed implementation files are:

- `src/stocks/rendering.ts`;
- `src/stocks/formatting.ts`, limited to adding `aria-pressed` to the existing
  summary-filter markup without changing counts, calculations, labels, keys,
  or filter behavior;
- the isolated Stocks rules in `assets/styles.css`;
- `tests/e2e/stocks-view.spec.ts`;
- `tests/e2e/stocks-mobile.spec.ts`;
- `tests/e2e/stocks-release.spec.ts`; and
- this document and `README.md` for implementation evidence.

Any required edit outside that set stops Phase 5B for a contract review. In
particular, no domain, formatting, modal, Events, POS, database, workflow, or
classic JavaScript file changes are implicit in this contract beyond the one
presentation-only `formatting.ts` allowance above.

## Frozen test changes

The Phase 5B suite keeps the exact 168-run matrix and changes assertions rather
than adding browser runs:

- `stocks-view.spec.ts` keeps the exact 27-function API, submission, and live-
  binding tests. The existing typed-versus-classic fingerprint continues to
  compare every unchanged formatting, filtering, modal, POS-rendering,
  render-order, and state-branch field. Only intentionally changed typed
  presentation fields (`summaryHtml` and `filterBarHtml` when ARIA changes,
  `cardsHtml`, the table-derived `resultsSnapshot.text`, and
  `renderedStocksHtml`) are excluded from direct classic-markup equality.
  `renderBranches`, filtered row identities/counts, and active filters remain
  exact typed-versus-classic comparisons. Deterministic typed assertions for semantic
  header order, populated rows, status and warning text, thresholds,
  timestamps, authorized and read-only actions, filtering, and empty/loading/
  error branches are added inside that same test run.
- `stocks-mobile.spec.ts` targets stable inventory-row selectors and verifies
  44-pixel actions, search and filters, table semantics, modal focus and
  dismissal, zero writes, and zero document overflow on desktop Chromium,
  Pixel Chrome, and iPhone WebKit. Visible responsive labels are asserted only
  when the project viewport is 700 pixels or narrower; desktop instead asserts
  visible semantic headers and contained table layout.
- `stocks-release.spec.ts` replaces the one-column-card assertion with eight
  responsive inventory rows while retaining long-name, twelve-history-row,
  containment, recovery, and no-overflow coverage.
- `stocks-domain.spec.ts` and Events tests remain unchanged. Existing classic
  fallback delivery and behavior checks remain, and an exact Git-blob and
  LF-normalized SHA-256 assertion for `assets/js/render-stocks.js` is added
  inside an existing Stocks view run so the frozen fallback becomes
  cryptographically enforced without increasing the matrix.

The focused Stocks slice remains exactly 12 runs, and the full matrix remains
130 desktop + 19 Pixel + 19 iPhone = 168 runs. If implementation needs another
test case rather than stronger assertions inside these frozen cases, Phase 5A
must be amended before implementation proceeds.

## Phase 5B exit gates

Phase 5B is complete only when all of the following are true:

1. The diff is inside the allowed implementation boundary.
2. Dependency audit has no high-severity vulnerability.
3. Strict type-check passes.
4. Production build passes, and browser asset/start coverage proves there is
   no unexpected classic runtime request.
5. The focused 12-run Stocks slice passes.
6. The full exact 168-run desktop/Pixel/iPhone matrix passes locally.
7. Independent scope, accessibility/mobile, test-strength, and fallback-parity
   reviews find no blocker.
8. Pull-request CI passes on Ubuntu and Windows.
9. Contract and implementation are merged through separate pull requests.

Phase 5B does not deploy its implementation branch directly.

## Phase 5B candidate evidence

The implementation candidate was checked against the frozen contract before
opening its pull request:

- the diff contains only the seven allowed renderer, narrow formatting,
  isolated Stocks CSS, test, and contract-document files;
- the classic cached Stocks fallback remains byte unchanged at the frozen Git
  blob and LF-normalized SHA-256;
- the dependency audit reports zero vulnerabilities;
- strict type-check and the 127-module production build pass;
- the focused Stocks slice passes all 12 runs;
- the complete matrix passes all 168 runs: 130 desktop Chromium, 19 Pixel
  Chrome, and 19 iPhone WebKit;
- desktop and 390-pixel visual probes show the semantic table and responsive
  labeled rows without page overflow; and
- independent architecture/scope, test-contract, and responsive UI/accessibility
  reviews report no blocker.

## Phase 5C release gates

After Phase 5B merges to `main`, Phase 5C must verify:

1. post-merge Ubuntu and Windows CI are green on the exact merge commit;
2. Pages packages the Ubuntu-tested `dist/` only after both test jobs pass;
3. every deployed file matches the verified artifact byte-for-byte;
4. a fresh production browser shows the semantic inventory table at desktop
   width and labeled responsive rows at 390 pixels;
5. there is no page overflow, page error, console error, failed request, server
   error, or fresh classic State/Bootstrap/Start request;
6. the protected signed-in smoke reads the real Stocks, POS, Ingredients,
   Recipes, and Pricing screens without a business-data write; and
7. a separate release-record pull request records the exact commits, run IDs,
   artifact evidence, browser evidence, and rollback point.

## Rollback

The implementation remains reversible by reverting only the Phase 5B merge.
No data rollback, database migration, or user-data repair is allowed or needed.
The retained classic fallback remains unchanged throughout, and Phase 5C's
release record is never folded into the implementation commit.
