# Inventory period spreadsheet

This document is the operating contract for Matcha Luna's inventory
spreadsheet. It explains what each column means, which values an operator may
change, and how Live POS sales affect stock.

The Stocks page is an inventory record, not a second costing calculator. The
Ingredients, Recipes, Packaging, and Pricing pages remain the source of truth
for what a drink contains and for its recipe costing. The Stocks page answers
a different question: **how much physical stock should be left during this
popup or counting period?** Its Purchase Quantity and Purchase Price are the
latest inventory-purchase facts used only to value remaining stock; editing
them does not rewrite recipe costing.

## The 14 columns

The spreadsheet always uses these columns in this order.

| # | Column | Editable? | Meaning |
|---:|---|---|---|
| 1 | Category | Yes | A free-text operational label owned by Stocks. It does not rewrite or follow the category on the Ingredients page. |
| 2 | Item | No | The ingredient, prepared mixture, or packaging name from costing. Renaming the source updates the current inventory label without rewriting old ledger history. |
| 3 | Unit | Yes, compatible units only | The unit used to enter and display this row. Weight may switch between `g` and `kg`; volume may switch between `ml` and `L`; pieces remain `piece`. Changing this does not change the physical amount. |
| 4 | Opening Stock | Yes, while a period is open | The physical amount available at the beginning of the period. Enter `0` when the item was counted and none was available; blank means it has not been counted. |
| 5 | Stock Added | Yes, while a period is open | The total stock received or made during this period. Editing the cell replaces the period total; the database records only the difference as an audited movement. |
| 6 | Stock Used | No | Net automatic usage from completed Live POS sales, less any exact before-preparation void reversals. Do not type sales usage here. |
| 7 | Wasted/Damaged | Yes, while a period is open | The total stock lost, spilled, expired, or damaged during the period. Enter a positive amount; it is subtracted from stock. |
| 8 | Remaining Stock | No | The calculated amount that should still be available. It may be negative when sales used more than the counted amount. |
| 9 | Reorder Level | Yes | The amount at or below which the item is shown as low stock. Leave it blank to disable the low-stock alert for that row. |
| 10 | Purchase Quantity | Yes | The amount covered by the Purchase Price, entered in the selected Unit. For example, enter `1` with unit `L` for one litre, or `1000` with unit `ml` for the same quantity. |
| 11 | Purchase Price (₱) | Yes | The total price paid for the Purchase Quantity, not the selling price and not the price for one gram or millilitre. |
| 12 | Cost per Unit | No | Purchase Price divided by Purchase Quantity, shown for the row's selected Unit. |
| 13 | Remaining Value (₱) | No | Remaining Stock multiplied by Cost per Unit. It is an inventory estimate, not cash collected or net profit. |
| 14 | Status | No | The calculated stock state: Not counted, Out of stock, Low stock, or In stock. |

Purchase Quantity and Purchase Price are owned by Stocks. A newly synchronized
ingredient, mixture, or packaging row starts with both fields blank even when
Costing has a quantity and price. Enter the latest physical purchase facts in
Stocks; refreshing from Costing never overwrites them. Values already stored on
older inventory rows are preserved by this change.

Direct spreadsheet edits are available to an owner or manager. A cashier can
view stock but cannot change inventory facts. Every accepted edit is recorded
with the user, time, old value, and new value.

### Formulas

The period quantities use one formula:

```text
Remaining Stock
= Opening Stock
  + Stock Added
  - Stock Used
  - Wasted/Damaged
```

Purchase valuation uses:

```text
Cost per Unit = Purchase Price / Purchase Quantity

Remaining Value = Remaining Stock * Cost per Unit
```

The database normalizes compatible units before doing the calculation. For
example, `1 L` and `1000 ml` represent the same physical quantity. Values are
kept at higher precision internally than the rounded values shown in the UI.

If Purchase Quantity or Purchase Price is blank, Cost per Unit and Remaining
Value are unavailable rather than being treated as zero.

### Status rules

- **Not counted** means an opening amount has not been confirmed for this
  period. It is different from a confirmed opening amount of zero.
- **Out of stock** means the calculated remaining amount is zero or negative.
- **Low stock** means the remaining amount is positive but is at or below the
  Reorder Level.
- **In stock** means the remaining amount is above the Reorder Level, or no
  Reorder Level is enabled.

## Inventory periods

Use one inventory period for one popup, event, or stock-counting cycle. A
business can have only one open inventory period at a time.

### Starting a period

1. Open Stocks and choose **Start period**.
2. Give it a clear name, such as `November 15 popup`.
3. The app carries forward the last closed period's calculated remaining
   amounts when they are available.
4. Physically check the stock and correct Opening Stock where necessary.
5. Explicitly enter `0` for counted items that have no stock.

For the first period there may be nothing to carry forward. Opening Stock is
then entered directly in the spreadsheet.

Starting a period does not open a POS shift, and opening a POS shift does not
start an inventory period. Before selling, check that both the intended Live
shift and the intended inventory period are open. For a clean audit boundary,
close any Live shift, start and count the inventory period, and then open the
Live shift.

### While a period is open

- Enter deliveries and purchases in Stock Added.
- Enter spills, waste, damage, and expiry in Wasted/Damaged.
- Let Live POS sales update Stock Used automatically.
- Review negative, low, and uncounted rows instead of changing Stock Used.
- A second device may edit the same row. Stale edits are rejected and must be
  reviewed against the refreshed value rather than silently overwriting it.

### Closing a period

Closing freezes that period's spreadsheet totals and final calculated
remaining amounts. An optional closing note can identify the popup or explain
a count difference. Closed periods remain available as history and cannot be
edited.

Start a new period for the next event. Its opening amounts carry forward from
the previous closed period, after which they can be reconciled against the
next physical count.

Closing an inventory period does not close a POS shift. Finish voids and close
the Live POS shift before closing the related inventory period so that every
sale and reversal belongs to the intended cycle.

## Row colors

The small color control on a row is an organization aid. An owner or manager
may choose a preset, use the native color picker, enter a full six-digit hex
code such as `#FFD0DB`, or clear the color.

Colors are stored on the inventory item, so they continue into later periods.
They do not change the item's category, stock status, formulas, order, or POS
behavior.

## Automatic POS stock usage

The database uses the immutable product version that was sold. It does not use
whatever recipe happens to be current later.

For a normal recipe ingredient:

```text
Usage per sold drink
= recipe-line quantity / recipe yield
```

The result is converted to the inventory item's physical base unit and then
multiplied by the number of drinks on the sale. Therefore five drinks using
`100 ml` of milk each add `500 ml` to Stock Used.

Only a successfully completed **Live** sale consumes inventory. An uncertain
network retry returns the original sale and does not deduct stock a second
time.

### Void reversal

Voiding a completed sale before preparation restores the exact quantities
deducted by that sale. The reversal uses the original inventory ledger lines;
it does not recalculate from today's recipe. Retrying the same void does not
restore stock twice.

A sale that was prepared and consumed should not be treated as a
before-preparation void. Physical ingredients that were actually used remain
used and should be handled according to the POS refund policy and, when
needed, recorded as waste.

### Training sales

Training-mode sales and their voids are ignored by inventory. Training may be
used to practise POS operation without changing Opening Stock, Stock Used, or
Remaining Stock.

## Prepared mixtures: simple recursive mode

Combined costs are still created and maintained on the Ingredients page. In
the shipped **simple mode**, inventory does not require a separate production
batch transaction before a drink can be sold.

When a recipe uses a mixture, the sale expands the mixture into its component
ingredients using the configured finished batch yield. Nested mixtures are
expanded again until the calculation reaches purchased ingredients.

For example, if a drink uses `30 ml` of a cream mixture, the mixture batch
yield is `300 ml`, and that batch contains `100 ml` of Oatside, the mixture
contributes `10 ml` of Oatside usage to that drink:

```text
30 ml / 300 ml * 100 ml = 10 ml
```

Any direct Oatside recipe line is added to that amount. The prepared-mixture
row is not also consumed as a second stock pool in simple mode; doing both
would double-count usage.

Simple mode assumes the configured batch yield and component quantities are
correct. It does not track individual mixture batches, preparation dates,
actual yield variance, or expiry. Record real-world spill or yield loss in
Wasted/Damaged and correct the next physical opening count.

## Packaging

Packaging referenced by the published product is deducted with the drink.
For example, a product with one cup, one lid, and one straw uses one piece of
each for every drink sold. A cart quantity of five uses five of each.

Packaging inventory is measured in pieces. Packaging that is not attached to
a published POS product is not automatically used. If a published packaging
ID has no inventory row, the customer sale remains successful and the missing
mapping is recorded as an inventory exception for reconciliation.

## Popup-first nonblocking policy

Inventory must never stop Matcha Luna from accepting a valid customer payment.
Automatic inventory processing is therefore **fail-open** for POS checkout.

- An uncounted item does not block a Live sale.
- Insufficient stock does not block a Live sale.
- Automatic usage may make Remaining Stock negative.
- A missing open period, missing inventory mapping, or unusable published
  snapshot does not cancel the sale.
- The database retains an inventory exception describing what could not be
  applied safely.

Negative stock is a reconciliation warning, not permission to invent stock.
Check the physical amount, verify recipe quantities, enter missed deliveries,
and correct the next opening count. Manual spreadsheet inputs themselves must
still be zero or positive.

If no inventory period is open, the sale remains valid but its usage cannot be
treated as a normal row total for an open period. Start the intended period as
soon as possible and review the recorded exception.

## Matcha upgrade limitation

The current Matcha upgrade options store the option name, price surcharge, and
cost adjustment. They do **not** yet identify which regular powder should be
replaced, which premium powder should be consumed, or the premium dose.

Consequently, an upgraded drink cannot yet make an exact automatic powder
substitution. The customer sale still completes, but automatic inventory is
skipped for that entire upgraded sale and an upgrade-related exception is
retained for manual reconciliation. Skipping the whole sale is deliberate: it
avoids silently consuming the regular powder or leaving a partially applied
inventory transaction. Until upgrade inventory mapping is added:

- Do not interpret the powder split for upgraded drinks as exact.
- Do not edit the computed Stock Used cell to compensate.
- Physically count regular and premium powders at period close and reconcile
  the next opening amounts.
- Reconcile every ingredient and packaging item used by upgraded sales during
  the physical count; none of that sale's components are applied automatically.

## Deployment order

The database and UI must be released in this order:

1. Back up production data and confirm the current database migration version.
2. Run the schema, behavior, rollback-roundtrip, and concurrency checks on a
   disposable PostgreSQL database.
3. Apply the inventory-period database migration to Supabase.
4. Verify the new read RPCs and migration metadata without changing production
   stock.
5. Deploy the tested GitHub Pages UI that uses the new RPC contract.
6. Run the signed-in, read-only production smoke test.
7. Open Stocks and verify the 14 columns, source rows, units, and role access.
8. Start the first production inventory period only after those checks pass.

Do not deploy the new UI before its database migration. Once real period,
sale-usage, or reversal data exists, prefer a forward repair over a destructive
database rollback.

## Operator checklist

### Before a popup

- [ ] Check ingredient units, mixture yields, and recipe quantities in Costing.
- [ ] Check cups, lids, straws, and other automatic packaging lines.
- [ ] Publish the intended product versions to POS.
- [ ] Start and clearly name the inventory period.
- [ ] Enter or verify Opening Stock for every item that will be used.
- [ ] Enter `0` for items that were counted and are empty.
- [ ] Enter Stock Added, Purchase Quantity, Purchase Price, and Reorder Level
      where applicable.
- [ ] Apply optional row colors.
- [ ] Open the correct Live POS shift only after the inventory period and
      opening counts are ready.
- [ ] Remember that Matcha powder upgrades require end-of-period manual
      reconciliation.

### During a popup

- [ ] Confirm real orders in Live mode; use Training only for practice.
- [ ] Do not manually copy sales into Stock Used.
- [ ] Record deliveries in Stock Added.
- [ ] Record spills, damaged packaging, and expired stock in Wasted/Damaged.
- [ ] Investigate negative or uncounted rows, but do not delay a valid customer
      checkout solely because of an inventory warning.
- [ ] Use Void only for the intended before-preparation cancellation flow.
- [ ] Review inventory exceptions after the rush.

### After a popup

- [ ] Close the Live POS shift after all valid voids are complete.
- [ ] Compare calculated Remaining Stock with a physical count.
- [ ] Review negative rows, missing mappings, and Matcha upgrade exceptions.
- [ ] Add an explanatory closing note when there is a known variance.
- [ ] Close the inventory period.
- [ ] Back up the data.
- [ ] At the next period start, reconcile carried-forward Opening Stock with
      the new physical count.
