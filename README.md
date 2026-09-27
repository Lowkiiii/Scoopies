# Scoopies

Scoopie's costing calculator and planned point-of-sale system.

## Current application

The production costing app is a static GitHub Pages application in
[`index.html`](index.html). Its browser regression suite is
[`tests/costing.test.html`](tests/costing.test.html).

## POS implementation

POS work is being delivered in verified phases. Phase 1 adds only an additive
Supabase database foundation; it does not change the current UI or default page.

- [Phase 1 guide](docs/POS_PHASE_1.md)
- [Phase 1 migration](supabase/migrations/202609270001_pos_phase_1_foundation.sql)
- [Phase 1 schema checks](supabase/tests/pos_phase_1_schema_checks.sql)
- [Phase 1 behavior checks](supabase/tests/pos_phase_1_behavior_checks.sql)
- [Phase 1 live access checks](supabase/tests/pos_phase_1_live_access_checks.sql)
- [Phase 1 deployment record](docs/POS_PHASE_1_DEPLOYMENT.md)

Never commit a Supabase service-role key or database password. The web app uses
only the public project URL and publishable key; authorization is enforced by
database roles, functions, constraints, and Row Level Security.
