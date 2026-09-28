# POS Phase 4 — Popup Operations

Phase 4 turns the Phase 3 checkout into an operational register: the team must
open a shift, every sale is bound to that exact shift and mode, a manager can
void an incorrect unprepared order, and the register is reconciled at close.

## Operating flow

1. Open the register in **LIVE** or **TRAINING** mode.
2. Ring sales. The server verifies the shift ID and mode on every checkout.
3. If an incorrect order has not been prepared, an owner or manager may void
   the whole receipt with a required reason.
4. Close the shift.
   - LIVE records counted cash and verified GCash/GoTyme receipt totals.
   - TRAINING automatically sets its fake actuals equal to expected amounts.
5. Review the business-timezone end-of-day report. LIVE and TRAINING are always
   queried separately.

One physical register has at most one open shift. Its mode cannot be changed
until it is closed. Existing Phase 3 auto-opened live shifts remain visible and
closable, but no Phase 4 checkout silently opens another shift.

## Roles

| Action | Owner | Manager | Cashier |
|---|---:|---:|---:|
| Open/close LIVE | Yes | Yes | Yes |
| Open/close TRAINING | Yes | Yes | No |
| Sell inside the currently open mode | Yes | Yes | Yes |
| Void before preparation | Yes | Yes | No |
| See ingredient/packaging cost and estimated gross profit | Yes | Yes | No |

Cashiers can see revenue and payment totals required to operate the popup, but
cost and profit fields are returned as `NULL` by the database.

## Reconciliation definitions

All values are integer Philippine centavos and all expected values are derived
on the server.

```text
expected cash
  = opening cash
  + net cash sale receipts
  + cash pay-ins
  - cash pay-outs
  - cash expenses recorded against the shift

expected GCash  = net GCash sale receipts
expected GoTyme = net GoTyme sale receipts

variance = operator actual - server expected
```

GCash and GoTyme reconciliation is intentionally a **receipt reconciliation**,
not a wallet/bank balance. A shift has no opening online-account balance, so
digital expenses are not subtracted from these expected receipt totals.

The estimated gross profit shown by POS is:

```text
net sales - retained published ingredient/packaging cost
```

It is not take-home profit. Rent, labor, utilities, delivery/payment fees,
general expenses, tax, and owner time are outside this metric. A
before-preparation void removes its sales, units, and estimated cost. The
foundation's future `refund_after_preparation` event keeps cost because the
ingredients were consumed.

## Void and history model

Completed sales, item snapshots, and payments remain immutable. A Phase 4 void
appends one `void_before_preparation` event with the original amount/payment
method, actor, timestamp, and normalized reason. It does not edit or delete the
receipt. The database permits at most one financial reversal per sale.

Phase 4 only exposes a whole-sale **before preparation** void. Partial refunds,
after-preparation refunds, payment corrections, and inventory waste are later
workflows and must not be simulated by editing base rows.

## Browser RPC contract

- `pos_get_shift_status(p_business_id)` — current register/shift, safe running
  totals, role capabilities, and last close result.
- `pos_open_shift(p_business_id, p_is_training, p_opening_cash_centavos)` —
  retry-safe open. Training requires owner/manager and exactly zero cash.
- `pos_close_shift(p_business_id, p_shift_id, p_counted_cash_centavos,
  p_verified_gcash_centavos, p_verified_gotyme_centavos, p_close_notes)` —
  atomic authoritative close. Training sends the three actuals as `NULL`.
- `pos_complete_shift_sale(p_business_id, p_shift_id, p_is_training,
  p_client_sale_id, p_items, p_payment_method, p_cash_tendered_centavos,
  p_reference_number, p_note)` — shift-bound atomic checkout. This signature
  deliberately has no default parameters.
- `pos_void_sale(p_business_id, p_sale_id, p_reason)` — owner/manager audited
  whole-sale void while its shift is open.
- `pos_get_recent_sales_v2(p_business_id, p_is_training, p_limit)` — mode-aware
  ledger with `completed`/`voided`, audit details, and `can_void`.
- `pos_get_end_of_day_summary(p_business_id, p_business_date,
  p_is_training)` — gross/void/net orders, units, sales, method totals, and
  role-gated estimated cost/profit. A `NULL` date means the current date in the
  business timezone.

The seven-argument Phase 3 `pos_complete_sale` remains temporarily executable
for a cached static page. It preserves the old request fingerprint for exact
lost-response recovery, but it never auto-opens or uses TRAINING. A new legacy
sale requires exactly one already-open LIVE shift.

## Idempotency and locking

- An exact completed checkout retry returns its original receipt even after its
  shift closes. A reused client ID with changed data is rejected.
- Reopening the same current mode with the same opening cash returns the open
  shift; changed details conflict.
- An exact close retry returns stored reconciliation; changed actuals or notes
  conflict.
- Repeating a void with the same normalized reason returns the event; a
  different second reversal conflicts.
- Checkout, close, and void serialize on the same business shift advisory lock
  and shift row. If checkout/void commits first, close includes it. If close
  commits first, the blocked checkout/void rejects.

Common SQLSTATEs are `42501` authorization, `22023` invalid input, `23505`
idempotency/reversal conflict, `40001` stale catalog, and `55000` invalid
operational state.

## Verification

The migration is `supabase/migrations/202609280004_pos_phase_4_operations.sql`.
Its rollback atomically restores the exact Phase 3 functions and grants only
when that is financially safe. It refuses before dropping anything if any
financial reversal exists, because Phase 3 reports would count that receipt as
revenue again. It also refuses while any shift is open, because Phase 3 has no
explicit close/reconciliation RPC. In either case, close the shift when
possible, keep/reapply Phase 4, or first perform an explicit data/report
migration; never bypass the guard.

For a real rollback, schedule a maintenance window and stop checkout first. A
safe rollback requires zero open shifts and zero financial reversal events.
Stop every POS device/tab, wait for all in-flight modal operations to resolve,
and confirm no browser has a pending Phase 4 checkout-recovery request in
`localStorage`. SQL cannot detect those client-side requests; rollback removes
`pos_complete_shift_sale` and would strand an uncertain schema-v2 checkout.
Coordinate the database rollback with a GitHub Pages rollback to the Phase 3
commit `f413c3e`; do not leave the Phase 4 UI on a Phase 3 database, and do not
expect the Phase 3 UI to auto-open a shift while the Phase 4 database remains
installed. A brief checkout outage is safer than running mismatched UI and
database contracts.

After the rollback SQL transaction succeeds, and only then, repair the linked
Supabase migration ledger:

```text
supabase migration repair 202609280004 --status reverted --linked
supabase migration list --linked
```

Verify that the linked migration list shows Phase 4 reverted and that
`pos_system_metadata` reports schema version `3`. Never mark the migration
reverted if the rollback transaction failed or one of its safety guards fired.

Run, in order, against a disposable PostgreSQL 17 database:

```text
psql -v ON_ERROR_STOP=1 -f supabase/tests/local_supabase_auth_stub.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/202609270001_pos_phase_1_foundation.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/202609270002_pos_phase_2_catalog_publication.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/202609270003_pos_phase_3_checkout_reporting.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/202609280004_pos_phase_4_operations.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/pos_phase_4_schema_checks.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/pos_phase_4_behavior_checks.sql
```

`pos_phase_4_concurrency_checks.sql` commits fixtures and therefore refuses to
run unless the disposable database name begins with `phase4_concurrency`.
`pos_phase_4_live_access_checks.sql` requires two real Auth users and the main
costing row; its fixtures and role changes are wrapped in `BEGIN/ROLLBACK`, and
it checks that the costing document checksum did not change.

## Deliberate Phase 4 boundaries

- No partial refunds or after-preparation refund UI.
- No expense/cash-movement UI yet; the close formula is already prepared for
  those append-only ledger rows.
- No tax, discounts, split tender, service charge, processor-fee, or inventory
  deduction workflow.
- Business-day sales use the immutable receipt business date. Shift counts in
  the daily report use the shift's local opening date.
