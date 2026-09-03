-- ============================================================================
-- SOLITAIRE — Quotation & Invoice Suite
-- Creates public.invoices + RLS restricted to admin/owner accounts.
-- Run once in the Supabase SQL editor for project nbpvamrwzqrgoiwpadwc.
--
-- RLS model: matches the real auth setup already in use elsewhere in your
-- schema — public.users.auth_user_id links a row to auth.uid(), and
-- public.users.role / .status gate access (not a `profiles` table).
-- ============================================================================

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_no     text not null unique,
  financial_year text not null,
  lead_id        bigint references public.leads(id),
  applicant_name text,
  loan_type      text,
  banker         text,
  processing_fee numeric not null,
  gst_rate       numeric not null default 18,
  gst_amount     numeric not null default 0,
  total_amount   numeric not null,
  status         text not null default 'unpaid'
                   check (status in ('unpaid', 'paid', 'cancelled')),
  payment_mode   text,
  payment_ref    text,
  paid_at        timestamptz,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists invoices_financial_year_idx on public.invoices (financial_year);
create index if not exists invoices_lead_id_idx on public.invoices (lead_id);

alter table public.invoices enable row level security;

drop policy if exists "invoices_select_admin_owner" on public.invoices;
create policy "invoices_select_admin_owner"
  on public.invoices for select
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and lower(u.role) in ('admin', 'owner')
        and u.status = 'active'
    )
  );

drop policy if exists "invoices_insert_admin_owner" on public.invoices;
create policy "invoices_insert_admin_owner"
  on public.invoices for insert
  with check (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and lower(u.role) in ('admin', 'owner')
        and u.status = 'active'
    )
  );

drop policy if exists "invoices_update_admin_owner" on public.invoices;
create policy "invoices_update_admin_owner"
  on public.invoices for update
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and lower(u.role) in ('admin', 'owner')
        and u.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and lower(u.role) in ('admin', 'owner')
        and u.status = 'active'
    )
  );

-- No delete policy on purpose — invoices should not be deletable, only
-- (optionally) marked 'cancelled' via update, to preserve sequential numbering.

-- ⚠️ If your RBAC has since moved fully behind a has_permission() function,
-- swap the `lower(u.role) in ('admin','owner')` checks above for a call to
-- that function instead, so this table follows the same RBAC path as
-- everything else.
