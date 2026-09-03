-- =============================================================================
-- SOLITAIRE — invoice discount + due date + part-payment ledger
-- Run AFTER sql/001_invoices_table.sql, once, against the shared Supabase
-- project (nbpvamrwzqrgoiwpadwc). Backs the updated invoice.html.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. New columns on invoices: discount + case-wise due date / time frame
-- -----------------------------------------------------------------------------
alter table public.invoices
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists due_date date;

-- Status now needs a middle state for part-paid invoices
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices
  add constraint invoices_status_check
  check (status in ('unpaid', 'partially_paid', 'paid'));

-- -----------------------------------------------------------------------------
-- 2. Part-payment ledger — one row per payment received against an invoice
-- -----------------------------------------------------------------------------
create table if not exists public.invoice_payments (
  id            bigint generated always as identity primary key,
  invoice_id    bigint not null references public.invoices(id) on delete cascade,
  amount        numeric(12,2) not null check (amount > 0),
  payment_date  date not null default current_date,
  mode          text,                 -- Bank Transfer / UPI / Cheque / Cash
  reference     text,                 -- UTR / Cheque No. / UPI ref
  notes         text,
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists invoice_payments_invoice_id_idx on public.invoice_payments (invoice_id);
create index if not exists invoice_payments_date_idx on public.invoice_payments (payment_date desc);

alter table public.invoice_payments enable row level security;

drop policy if exists "invoice_payments_select_admin_owner" on public.invoice_payments;
create policy "invoice_payments_select_admin_owner"
  on public.invoice_payments for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) in ('admin','owner'))
  );

drop policy if exists "invoice_payments_insert_admin_owner" on public.invoice_payments;
create policy "invoice_payments_insert_admin_owner"
  on public.invoice_payments for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) in ('admin','owner'))
  );

drop policy if exists "invoice_payments_update_admin_owner" on public.invoice_payments;
create policy "invoice_payments_update_admin_owner"
  on public.invoice_payments for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) in ('admin','owner'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) in ('admin','owner'))
  );

drop policy if exists "invoice_payments_delete_admin_owner" on public.invoice_payments;
create policy "invoice_payments_delete_admin_owner"
  on public.invoice_payments for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) in ('admin','owner'))
  );

-- -----------------------------------------------------------------------------
-- 3. Convenience view: invoices + running paid/balance, for the ledger list.
-- security_invoker means the view runs with the querying user's own RLS
-- (not the view owner's), so the policies above are still enforced.
-- -----------------------------------------------------------------------------
create or replace view public.invoice_summary
  with (security_invoker = true) as
select
  i.*,
  coalesce(p.paid_amount, 0)                         as paid_amount,
  i.total_amount - coalesce(p.paid_amount, 0)         as balance_due
from public.invoices i
left join (
  select invoice_id, sum(amount) as paid_amount
  from public.invoice_payments
  group by invoice_id
) p on p.invoice_id = i.id;
