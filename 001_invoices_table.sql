-- ============================================================================
-- SOLITAIRE — invoices table
-- Run once in the Supabase SQL editor for project nbpvamrwzqrgoiwpadwc
-- (same project used by associate-app, SOLITAIRE-Admin-Panel and
-- SOLITAIRE-Legal-Technical-Credit).
-- ============================================================================

create table if not exists public.invoices (
  id                bigint generated always as identity primary key,
  invoice_no        text not null unique,
  financial_year    text not null,               -- e.g. '2026-27', used for sequential numbering per FY
  lead_id           bigint not null references public.leads(id),
  applicant_name    text,
  loan_type         text,
  banker            text,
  processing_fee    numeric not null,
  gst_rate          numeric not null default 18,
  gst_amount        numeric not null default 0,
  total_amount      numeric not null,
  status            text not null default 'unpaid' check (status in ('unpaid', 'paid', 'cancelled')),
  payment_mode      text,
  payment_ref       text,
  paid_at           timestamptz,
  created_by        text,
  created_at        timestamptz not null default now()
);

create index if not exists invoices_lead_id_idx on public.invoices (lead_id);
create index if not exists invoices_fy_idx on public.invoices (financial_year);
create index if not exists invoices_created_at_idx on public.invoices (created_at desc);

alter table public.invoices enable row level security;

-- ----------------------------------------------------------------------------
-- RLS: admin/owner only, matching the role check already used client-side in
-- admin.html (auth.profile.role in ('admin','owner')) and the credit_team RLS
-- fixes referenced in project notes. This assumes a `profiles` table keyed by
-- auth.uid() with a `role` column — adjust the subquery below if your actual
-- profiles/role table is named differently (e.g. if you've since centralised
-- this behind a has_permission() function, swap the USING clause to call
-- that function instead for consistency with the rest of the RBAC system).
-- ----------------------------------------------------------------------------

drop policy if exists "Admin/Owner can read invoices" on public.invoices;
create policy "Admin/Owner can read invoices"
  on public.invoices for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) in ('admin', 'owner')
    )
  );

drop policy if exists "Admin/Owner can insert invoices" on public.invoices;
create policy "Admin/Owner can insert invoices"
  on public.invoices for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) in ('admin', 'owner')
    )
  );

drop policy if exists "Admin/Owner can update invoices" on public.invoices;
create policy "Admin/Owner can update invoices"
  on public.invoices for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) in ('admin', 'owner')
    )
  );

-- No delete policy is created intentionally — invoices should be cancelled
-- (status = 'cancelled'), not deleted, to preserve numbering integrity.

-- Optional: add invoices to Realtime publication if you want the ledger to
-- live-update the way sanctions/evaluation_reports already do:
-- alter publication supabase_realtime add table public.invoices;
