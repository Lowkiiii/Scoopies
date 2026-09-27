-- PRE-PRODUCTION ONLY.
--
-- This removes only the additive POS Phase 1 objects. Do not run it after
-- genuine sales exist; use a forward corrective migration instead.
-- It never touches public.scoopies_state, public.scoopies_activity, or auth users.

begin;

drop table if exists public.pos_cash_movements;
drop table if exists public.pos_expenses;
drop table if exists public.pos_sale_events;
drop table if exists public.pos_payments;
drop table if exists public.pos_sale_items;
drop table if exists public.pos_sales;
drop table if exists public.pos_receipt_counters;
drop table if exists public.pos_product_versions, public.pos_products;
drop table if exists public.pos_categories;
drop table if exists public.pos_shifts;
drop table if exists public.pos_registers;
drop table if exists public.pos_events;
drop table if exists public.pos_business_members;
drop table if exists public.pos_businesses;
drop table if exists public.pos_system_metadata;

drop function if exists public.pos_add_member_by_email(uuid, text, text, text);
drop function if exists public.pos_bootstrap_business(text, text, text);
drop function if exists public.pos_allocate_receipt(uuid, boolean, timestamptz);
drop function if exists public.pos_has_role(uuid, text[]);
drop function if exists public.pos_is_member(uuid);
drop function if exists public.pos_protect_sale();
drop function if exists public.pos_require_open_sale();
drop function if exists public.pos_forbid_mutation();
drop function if exists public.pos_set_updated_at();

commit;
