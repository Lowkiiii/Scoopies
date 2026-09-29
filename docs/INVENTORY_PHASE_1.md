# Inventory Phase 1 — Manual Stock Ledger

Inventory Phase 1 adds a manual, auditable stock workflow without changing
checkout. It tracks physical quantities in canonical units and keeps those
facts separate from ingredient prices in the costing document.

## Scope

Phase 1 provides:

- a stock item owned by one business for each purchased ingredient or prepared
  mixture selected from the shared costing document; each stable costing
  source ID has at most one global inventory binding;
- manual stock-in, waste, correction, and physical-count transactions;
- low-stock thresholds and durable inactive source tombstones;
- an append-only movement history with before/after balances;
- stable links to costing ingredient IDs so a rename does not create a new
  inventory identity; and
- owner/manager write access, with current quantities visible to every active
  POS member.

Phase 1 deliberately does **not** deduct inventory when a POS sale completes.
That integration requires immutable recipe-quantity snapshots and its own
failure/reversal policy. Pricing changes never alter stock quantities.

## Quantity model

Every item has one canonical base unit:

| Kind | Canonical unit | Accepted input units |
|---|---|---|
| Weight | g | g, kg |
| Volume | ml | ml, l |
| Count | piece | piece |

The database converts kilograms to grams and litres to millilitres. It never
converts between dimensions and never infers stock from a purchase price,
cost-per-unit value, recipe cost, or costing “quantity bought” field.
The UI may compact large display values from g to kg or ml to L, but the stored
and audited canonical values remain g, ml, or piece.

Current stock is derived from the immutable ledger:

```text
quantity on hand = sum of all quantity_delta_base movements
```

There is no editable balance column. Manual Phase 1 operations must leave a
nonnegative balance. A future automatic POS-deduction phase must define and
test its negative-stock policy explicitly rather than inheriting one by
accident.

## Transaction meanings

- **Stock in** adds a positive purchased quantity. Prepared mixtures cannot use
  stock-in in Phase 1 because that would conceal consumption of their
  components.
- **Waste** subtracts a positive quantity and requires a reason.
- **Correction** applies a signed delta and requires a reason.
- **Stock count** sets the item to a nonnegative physical quantity; the ledger
  stores the calculated difference from the previous balance.

Every item, including a prepared mixture and an item whose real opening stock
is zero, must begin with **Stock count**. Stock-in, waste, and correction are
available only after that explicit opening count. If any line in a multi-item
request is still uninitialized, the entire request is rejected.

One transaction may contain up to 200 distinct items. It is atomic: if any
line is invalid, stale, incompatible, inactive, or would make stock negative,
none of its lines is recorded.

## Prepared mixtures

A combined-cost mixture is a stock item with kind `mixture`. Phase 1 allows
an opening physical count, correction, waste, and later physical counts for
that finished mixture. It does not yet automate a production batch.

Until a later production workflow exists:

1. initialize the finished mixture with **Stock count** (enter zero when it is
   physically empty), then use later **Correction** or **Waste** movements;
2. separately record any raw-ingredient changes that really occurred; and
3. do not also treat the same mixture as a purchased stock-in.

This keeps Phase 1 honest about what was entered manually and avoids claiming
that component usage was calculated when it was not.

## Costing-source lifecycle

Inventory identity uses `source_costing_ingredient_id`, not the editable
ingredient name.

- `scoopies_state/main` is one shared costing document, so a source ID is
  globally unique and may belong to only one business inventory. A second
  business must use a different costing source ID.
- Renaming an ingredient preserves its inventory item and history.
- Kind and canonical unit become immutable as soon as the inventory identity
  is created, even before its opening count. Create a new costing ingredient
  when the physical meaning truly changed.
- The five-argument deletion RPC is the only source-removal write. Under one
  transaction it locks the latest `scoopies_state/main` row, validates the
  caller's source identity, rejects recipe/combined-cost/draft dependencies,
  requires zero stock, creates or deactivates the tombstone, and removes only
  that source from the JSON document.
- Deleting a source that has not synchronized yet creates an inactive
  revision-1 tombstone in the same transaction. An exact retry (source already
  absent and tombstone inactive) succeeds without another revision. Because
  deletion is global, the same mutation-free success is returned to another
  authorized business retry once the source is absent and the sole global
  tombstone is inactive; an active cross-business identity still rejects.
- A database trigger rejects ordinary full-document saves that omit a source
  without its tombstone, revive an inactive source ID, or change an active
  identity's kind/base unit. It also protects the `main` row ID/deletion and
  rejects duplicate source IDs or dangling saved recipe, combined-cost, and
  draft references. Name, category, quantity, and price edits remain normal
  costing changes.
- Ordinary synchronization never reactivates a deactivated item. It returns
  the same inactive identity, unchanged, when a stale browser sends the exact
  deleted source ID for the same business. An absent source with no tombstone,
  an active orphan, or another business's binding is rejected. There is no
  reactivation RPC; create a new costing ingredient with a new source ID when
  stock tracking must begin again.
- A legacy never-synchronized blank-name source can still be deleted by its
  exact cloud identity; its tombstone is stored as `Unnamed ingredient` so the
  inventory identity remains valid.
- Historical line snapshots retain the name and unit used when the movement
  was recorded.

## Roles

| Action | Owner | Manager | Cashier |
|---|---:|---:|---:|
| View active quantities and low-stock state | Yes | Yes | Yes |
| Include inactive items for admin/API diagnostics | Yes | Yes | No |
| Synchronize costing items | Yes | Yes | No |
| Record stock movements | Yes | Yes | No |
| Set low-stock thresholds | Yes | Yes | No |
| View movement history/current staff display name | Yes | Yes | No |
| Prepare a costing source change or deletion | Yes | Yes | No |

Browser roles have no direct table privileges, including SELECT. Reads and
writes go through narrowly scoped security-definer RPCs, which repeat
membership and role checks. RLS policies remain enabled as defense in depth.
The separate legacy `scoopies_state` cloud document grants authenticated
clients only SELECT/INSERT/UPDATE for its existing upsert/realtime flow;
DELETE, TRUNCATE, TRIGGER, and REFERENCES are revoked, and anon has no access.
When the legacy `scoopies_activity` table exists, authenticated clients retain
only SELECT/INSERT for history logging/realtime; mutation and structural grants
are revoked and anon has no access.

## Browser RPC contract

- `pos_inventory_sync_items(p_business_id, p_items)` creates inventory
  identities or updates their names only after each exact source already
  exists in the locked latest cloud document. It never revives inactive items
  and enforces the one-global-binding rule. Each JSON object contains
  `sourceCostingIngredientId`, `kind`, `name`, and `baseUnit`.
- `pos_inventory_get_items(p_business_id, p_include_inactive)` returns
  current derived balance, threshold, low-stock state, revision, and last
  movement time. Phase 1 UI calls it with `false` and hides tombstones. Passing
  `true` is limited to owners/managers for admin or API diagnostics; it is not
  an inactive-items UI filter.
- `pos_inventory_get_transactions(p_business_id, p_inventory_item_id,
  p_limit)` returns owner/manager movement history, including immutable item
  name/unit/balance snapshots. `recorded_by_name` is the member's current
  display name, not a historical snapshot. Sequence 1 is the first recorded
  movement and lets the UI identify an opening count without rewriting history.
- `pos_inventory_record_transaction(p_business_id,
  p_client_transaction_id, p_transaction_type, p_lines, p_reason, p_note)`
  records one atomic operation. Each line contains `inventoryItemId`,
  numeric `quantity`, input `unit`, and `expectedRevision`.
- `pos_inventory_set_threshold(p_business_id, p_inventory_item_id,
  p_threshold_base, p_expected_revision)` sets or clears a canonical-unit
  low-stock threshold.
- `pos_inventory_validate_source_delete(p_business_id,
  p_source_costing_ingredient_id)` is the non-mutating owner/manager preflight.
  It permits a missing, already inactive, or active zero-balance source and
  rejects an active nonzero source. It is optional early feedback; it is not
  the deletion commit.
- `pos_inventory_prepare_source_delete(p_business_id,
  p_source_costing_ingredient_id, p_item_kind, p_name, p_base_unit)` creates an
  inactive tombstone when needed or deactivates the existing zero-balance
  identity and atomically removes the matching latest cloud source. It rejects
  stale identity arguments and every recipe, combined-cost, or saved-draft
  reference.
- `pos_inventory_prepare_source_change(p_business_id,
  p_source_costing_ingredient_id, p_item_kind, p_name, p_base_unit)` is a
  post-save validator/synchronizer for one source that must already exist with
  that exact identity in the locked latest cloud document. It may create the
  single global binding after the save, but rejects absent/stale sources,
  inactive tombstones, another business's binding, and kind/unit changes. It
  is not a pre-save reservation or rename RPC.

## Retry and concurrency rules

Every manual stock operation carries a client-generated UUID. An exact retry
returns the existing transaction and `is_retry = true`; reusing that UUID
with different details is rejected.

Every item-changing request also carries the item revision last seen by the
browser. A changed revision raises SQLSTATE `40001`, so the UI must refresh
instead of overwriting another device's work. Inventory writes serialize per
business and lock affected item rows in deterministic order. Atomic source
sync/change/deletion additionally locks the global main costing row before the
global source identity. Whichever wins a
deletion-versus-stock race determines the safe result: a committed movement
makes deletion reject, while a committed deletion makes the waiting movement
reject because the item is inactive. The same serialization prevents a second
business from creating an active identity before or after global deletion.

Other common SQLSTATEs are `42501` authorization, `22023` invalid input,
`23505` client-ID conflict, `23514` negative balance, `55000` invalid
item/source state, and `P0002` missing or inactive item.

## Verification

Apply the migrations through
`supabase/migrations/202609290005_inventory_phase_1_foundation.sql`, then run:

```text
psql -v ON_ERROR_STOP=1 -f supabase/tests/inventory_phase_1_schema_checks.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/inventory_phase_1_behavior_checks.sql
```

The behavior suite uses disposable fixtures inside a transaction and rolls
them back. The live-access suite additionally requires two real Auth accounts
and the main costing row, and verifies that the costing document checksum does
not change. The concurrency suite commits fixtures and refuses to run unless
the disposable database name begins with `inventory_concurrency`.

## Rollback boundary

The rollback is validation-only once any inventory identity exists, including
an uninitialized item or inactive deletion tombstone. It first locks the
business/member parents used by inventory authorization and foreign keys, then
locks costing state, transaction, item, and line tables in writer-compatible
order. It refuses before changing anything when
`pos_inventory_items` contains a row. This closes the check-versus-write race.
In an unused or fully disposable installation, it removes only the eight
public inventory RPCs, five inventory helper/trigger functions, three
inventory tables, and restores schema metadata to version 4
(`pos_phase_4_operations`).

Do not delete inventory rows to force a production rollback. Export and
reconcile the ledger, stop inventory activity, coordinate the UI/database
rollback, and repair the linked migration ledger only after the SQL rollback
transaction succeeds.

Rollback intentionally does not restore the legacy destructive grants removed
from `scoopies_state` or `scoopies_activity`; that independent security
hardening remains in place.

The browser may run the read-only preflight for early feedback, but it must not
save a source omission itself. It submits the five-argument atomic deletion
RPC, then accepts the returned cloud document on refresh/realtime. Any RPC
failure rolls back both the source removal and tombstone. Retrying after an
ambiguous network response is safe once the source is absent and tombstone is
inactive. Never compensate by reviving or editing a tombstone; there is no
reactivation RPC. If stock tracking must restart, create a new costing
ingredient with a new source ID.

## Next phase

Automatic sale deductions should be a separate migration. It must consume
validated physical recipe quantities from immutable published product
versions, deduct a prepared mixture only once (rather than also deducting its
components at sale time), restore only the correct movements on eligible
voids, and preserve old sales when recipes or prices later change.
