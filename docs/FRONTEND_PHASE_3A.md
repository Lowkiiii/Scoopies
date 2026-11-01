# Frontend Phase 3A — build and release foundation

Phase 3A introduces Vite and TypeScript as build and release tooling without
changing Matcha Luna's UI, pricing logic, POS behavior, stock behavior,
Supabase schema, or stored data. It is separate from the historical POS and
database Phase 3.

## Protected baseline

- Phase 2 production commit: `d4a00f23e90fa039e6c56dc5e8ec1f51a9d60537`
- Phase 2 CI run: `41294990618`
- Phase 2 Pages run: `41294990138`
- Production URL: <https://lowkiiii.github.io/Scoopies/>
- Legacy browser baseline: exactly 182 passing tests
- Compatibility contract: exactly 175 application globals
- Runtime: 18 ordered synchronous classic scripts

## Goals

- Provide a reproducible `npm run build` that creates `dist/`.
- Type-check build configuration and browser tests.
- Run Playwright against the exact production artifact.
- Deploy the tested `dist/` through a repository-owned Pages workflow.
- Preserve the current source and compatibility facade for incremental module
  migration.

## Non-goals

- No React, Vue, or one-shot framework rewrite.
- No UI redesign.
- No database, RLS, authentication, or stored-data change.
- No costing, checkout, stock, or reporting behavior change.
- No conversion of the classic runtime to ES modules in this slice.

## Runtime invariants

Phase 3A must preserve:

- The GitHub Pages base path `/Scoopies/`.
- The current 18-script order.
- `runtime-factories.js` before `state.js`.
- `support.js` before `events.js`.
- `compatibility.js` before `start.js`.
- `window.MatchaLunaApp.contractVersion === 1`.
- All 175 protected globals and the exact 182-test baseline.
- The public Supabase URL and publishable-key model. A service-role key or
  database password must never be added to frontend source or CI.

## Source and artifact contract

- Root `index.html`, `assets/styles.css`, and `assets/js/**` remain source.
- `vite.config.ts` owns the `/Scoopies/` base path.
- Vite processes the page and stylesheet, while the repository plugin copies
  the ordered classic scripts unchanged to `dist/assets/js/`.
- The legacy harness is built to `dist/tests/costing.test.html`, so browser
  tests exercise the artifact rather than repository source.
- `dist/` is generated and ignored by Git.
- Playwright uses `vite preview` to serve the production artifact.
- No runtime file becomes `type="module"` until its dependencies are migrated
  through `window.MatchaLunaApp.registerModule`.

## Migration order after Phase 3A

1. Convert pure core helpers behind the compatibility facade.
2. Convert costing calculations without changing their public contract.
3. Migrate one UI island, with Stocks preferred before POS.
4. Keep POS operations and checkout on the protected runtime until the smaller
   domains have proved the migration pattern.

Each slice must retain the legacy and compatibility baselines.

## Required exit gates

- Clean `npm ci`.
- `npm run typecheck` passes.
- `npm run build` produces the entry page, stylesheet, test harness, and all 18
  runtime scripts.
- Playwright runs against `dist/`.
- Exact `PASS 182 tests`.
- Exact 175-name facade contract.
- Desktop Chromium, Pixel Chrome, and iPhone WebKit smoke checks pass.
- PR CI and post-merge main CI pass.
- GitHub Pages deploys the tested artifact.
- Public entry and runtime assets return HTTP 200.
- A signed-in production check confirms POS, Stocks, and Costing load. No
  credentials are shared for this check.
- The repository is clean on `main`.

## Release sequence

1. Require green pull-request CI.
2. Immediately before merge, change the repository's Pages source from legacy
   `main:/` publication to GitHub Actions (`build_type: workflow`). The last
   successful Phase 2 deployment remains live during this switch.
3. Merge Phase 3A.
4. Require green post-merge type-check, build, and browser tests.
5. Allow the dependent packaging job to upload the exact tested `dist/` and the
   deployment job to publish it.
6. Verify the merge SHA, public assets, mobile shell, and signed-in workflows.

If the merge is stopped or reverted before the custom deployment succeeds,
restore legacy `main:/` publication and verify its deployment before continuing.

## Rollback

Use a normal revert commit; never hard-reset or force-push.

If the deployment is unhealthy:

1. Stop further merges.
2. Revert the Phase 3A merge.
3. Switch Pages back to legacy `main:/` publication. This is mandatory because
   the revert removes the custom deployment workflow.
4. Trigger and wait for the legacy rollback deployment to succeed.
5. Verify the entry page, all runtime scripts, mobile shell, and authenticated
   POS, Stocks, and Costing.

Do not alter Supabase, migration history, accounts, or business data for this
frontend-only rollback.

## Release record

Record the following when Phase 3A is released:

- Merge commit and pull request
- CI and Pages run URLs
- Type-check and build results
- Browser, legacy, and facade results
- Public asset result
- Signed-in smoke result
- Rollback commit and run, if used
