-- =============================================================================
-- SOLITAIRE — invoices table
-- Backs invoice.html (Processing Fee Tax Invoice generator).
-- Run this once against the shared Supabase project (nbpvamrwzqrgoiwpadwc)
-- before using invoice.html for the first time.
-- =============================================================================

create table if not exists public.invoices (
  id               bigint generated always as identity primary key,
  invoice_no       text not null unique,          -- e.g. SFM/INV/2026-27/0001
  financial_year   text not null,                 -- e.g. 2026-27
  lead_id          bigint not null references public.leads(id) on delete restrict,
  applicant_name   text,
  loan_type        text,
  banker           text,
  processing_fee   numeric(12,2) not null default 0,
  gst_rate         numeric(5,2)  not null default 0,
  gst_amount       numeric(12,2) not null default 0,
  total_amount     numeric(12,2) not null default 0,
  status           text not null default 'unpaid' check (status in ('unpaid','paid')),
  payment_mode     text,
  payment_ref      text,
  paid_at          timestamptz,
  created_by       text,
  created_at       timestamptz not null default now()
);

-- Fast lookup for sequential numbering (count-per-FY) and per-lead history
create index if not exists invoices_financial_year_idx on public.invoices (financial_year);
create index if not exists invoices_lead_id_idx on public.invoices (lead_id);
create index if not exists invoices_created_at_idx on public.invoices (created_at desc);

-- -----------------------------------------------------------------------------
-- RLS: admin/owner only, matching the rest of the SOLITAIRE-Legal-Technical-
-- Credit suite (auth-guard.js already gates the page to admin/owner in the
-- UI — this locks it down at the DB level too).
-- Adjust the role-lookup subquery below if your profiles/role table differs
-- from what's used elsewhere in this repo.
-- -----------------------------------------------------------------------------
alter table public.invoices enable row level security;

drop policy if exists "invoices_select_admin_owner" on public.invoices;
create policy "invoices_select_admin_owner"
  on public.invoices for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) in ('admin','owner')
    )
  );

drop policy if exists "invoices_insert_admin_owner" on public.invoices;
create policy "invoices_insert_admin_owner"
  on public.invoices for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) in ('admin','owner')
    )
  );

drop policy if exists "invoices_update_admin_owner" on public.invoices;
create policy "invoices_update_admin_owner"
  on public.invoices for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) in ('admin','owner')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) in ('admin','owner')
    )
  );

-- No delete policy is created intentionally — invoices should not be
-- deletable once issued (financial record integrity). Void/cancel via a
-- status value instead if that's ever needed.
