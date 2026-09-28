# Scoopies

Scoopie's costing calculator and point-of-sale system.

## Current application

The production costing app is a static GitHub Pages application in
[`index.html`](index.html). Its browser regression suite is
[`tests/costing.test.html`](tests/costing.test.html).

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

Never commit a Supabase service-role key or database password. The web app uses
only the public project URL and publishable key; authorization is enforced by
database roles, functions, constraints, and Row Level Security.
