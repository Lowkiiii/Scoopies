# POS Phase 3 - checkout and sales reporting

Phase 3 adds the operational checkout boundary. The browser sends product and
published-version IDs plus quantities; it never sends a trusted price, cost,
total, change amount, receipt number, or profit. PostgreSQL validates the cart
and completes the whole sale atomically.

## Checkout invariants

- Only active `owner`, `manager`, or `cashier` members can check out.
- Cart lines must reference products that are still available, unarchived, and
  on the exact immutable version the cashier selected.
- A newly published price never silently replaces a cart's reviewed price.
  SQLSTATE `40001` means the catalog changed and the UI must refresh the cart.
- Item names, sizes, prices, ingredient costs, and packaging costs are copied
  from the validated immutable product version into immutable sale lines.
- All currency is integer centavos. The server derives subtotal, total,
  estimated cost, collected amount, and cash change.
- Checkout creates the sale, lines, one payment, receipt, and completion audit
  event in one transaction. Any error rolls everything back.
- Receipt allocation uses the Phase 1 atomic daily counter and happens only
  after cart and payment validation, so rejected sales consume no receipt.
- `client_sale_id` is generated once in the browser. An exact retry returns the
  original completed receipt; reusing it with different input is rejected.
- Browser roles have no direct INSERT/UPDATE/DELETE privileges on sales,
  payments, shifts, receipt counters, or events.

## Client RPCs

All calls require a Supabase Auth session and should use named arguments.

### Complete a sale

```text
pos_complete_sale(
  p_business_id uuid,
  p_client_sale_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_cash_tendered_centavos bigint default null,
  p_reference_number text default null,
  p_note text default null
)
```

`p_items` is an array containing 1 to 100 unique product lines:

```json
[
  {
    "product_id": "uuid-from-pos_get_catalog",
    "product_version_id": "active_version_id-from-pos_get_catalog",
    "quantity": 2
  }
]
```

Only these three keys are accepted. A browser-supplied price or cost field is
rejected. Quantities are integers from 1 to 10,000.

Payment rules:

- `cash`: cash received is required and must cover the server total; online
  reference must be null. Change is computed by the server.
- `gcash` / `gotyme`: cash received must be null. A trimmed reference of up to
  120 characters is optional for the popup MVP.
- One payment covers the exact sale total. Split payments are deferred.

The response contains no cost-bearing fields:

```text
sale_id, receipt_number, business_date, completed_at, payment_method,
item_count, units_sold, subtotal_centavos, total_centavos,
cash_tendered_centavos, change_given_centavos, is_retry
```

The canonical request fingerprint normalizes item ordering, payment method,
blank reference/note values, and whitespace. An exact repeated request returns
the original row with `is_retry = true`, even if the product was republished or
made unavailable after the first success. The membership must still be active.

### Today's summary

```text
pos_get_today_summary(p_business_id uuid)
```

The business timezone defines today. The single returned row contains:

```text
business_date, sale_count, items_sold, total_sales_centavos,
cash_sales_centavos, gcash_sales_centavos, gotyme_sales_centavos,
estimated_cost_centavos, estimated_gross_profit_centavos, can_view_costs
```

All active members can see operational sales and payment totals. For cashiers,
cost and profit are `NULL` and `can_view_costs` is false. Owners and managers
receive estimated cost and gross profit.

### Recent sales

```text
pos_get_recent_sales(p_business_id uuid, p_limit integer default 20)
```

`p_limit` is 1 to 100. Rows contain:

```text
sale_id, receipt_number, business_date, completed_at,
cashier_display_name, item_count, units_sold, item_summary,
total_centavos, payment_method, reference_number,
estimated_cost_centavos, estimated_gross_profit_centavos, can_view_costs
```

`item_summary` is built from immutable sale-line names/sizes in line order, for
example `2 x Matcha Latte 12oz (12 oz)`. Cost/profit masking matches the daily
summary.

## Register/shift MVP behavior

There is no shift-opening UI in Phase 3. The first successful checkout reuses
an open non-training shift on an active register, or atomically opens one on the
first active register with opening cash set to zero. This makes sales, payment
breakdowns, and estimated profit reliable for the popup.

Because opening cash is zero and there is not yet a close/count workflow,
cash-drawer expected/variance figures are not operationally meaningful in this
phase. Explicit register opening, closing, and cash reconciliation should be a
later phase.

## Reporting boundary

Phase 3 reports completed, non-training sales. `total_sales_centavos` is the
completed amount collected, and `estimated_gross_profit_centavos` is completed
sales minus the sale-time estimated ingredient and packaging cost. It is not
net profit and does not subtract rent, labor, delivery fees, or expenses.

The Phase 1 audit-event schema can represent voids, refunds, waste, and payment
corrections, but their workflows are intentionally deferred. Phase 3 reports
therefore do not yet net those future events.

## Validation

From a clean disposable PostgreSQL database, apply and test in order:

```powershell
psql $env:SCOOPIES_TEST_DATABASE_URL --set ON_ERROR_STOP=1 `
  -f supabase/tests/local_supabase_auth_stub.sql
psql $env:SCOOPIES_TEST_DATABASE_URL --set ON_ERROR_STOP=1 `
  -f supabase/migrations/202609270001_pos_phase_1_foundation.sql
psql $env:SCOOPIES_TEST_DATABASE_URL --set ON_ERROR_STOP=1 `
  -f supabase/migrations/202609270002_pos_phase_2_catalog_publication.sql
psql $env:SCOOPIES_TEST_DATABASE_URL --set ON_ERROR_STOP=1 `
  -f supabase/migrations/202609270003_pos_phase_3_checkout_reporting.sql
psql $env:SCOOPIES_TEST_DATABASE_URL --set ON_ERROR_STOP=1 `
  -f supabase/tests/pos_phase_3_schema_checks.sql
psql $env:SCOOPIES_TEST_DATABASE_URL --set ON_ERROR_STOP=1 `
  -f supabase/tests/pos_phase_3_behavior_checks.sql
```

The behavior test is destructive fixture code for a disposable database only;
it wraps everything in a transaction and rolls back. After deployment, the
read-only schema check is safe. The live-access script creates isolated
fixtures in one transaction, verifies role behavior and the costing checksum,
and rolls everything back:

```text
supabase/tests/pos_phase_3_live_access_checks.sql
```

The true two-connection race test uses `dblink` and intentionally commits its
fixtures. Its database-name guard permits execution only in a disposable
database beginning with `phase3_concurrency`; drop that database afterward:

```text
supabase/tests/pos_phase_3_concurrency_checks.sql
```

## Completion gate

- Phase 1 and Phase 2 schema/behavior regressions still pass
- Cash, GCash, and GoTyme checkout succeed for allowed roles
- Underpayment, malformed/duplicate lines, stale versions, unavailable items,
  and browser-supplied price fields fail with no partial records or receipt gap
- Exact retry returns one original sale/receipt; changed payload conflicts
- Concurrent exact retries converge on one sale, while different checkouts
  receive distinct sequential receipts
- Republished prices do not change historical sale snapshots
- Daily and recent-sales calculations match immutable sale facts
- Cashiers see no cost/profit; owners and managers do
- Outsiders and anonymous callers cannot execute checkout/reporting
- Direct browser writes remain denied
- The live costing document checksum remains unchanged
