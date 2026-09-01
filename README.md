# SOLITAIRE — Quotation & Invoice Suite

A small companion app to `SOLITAIRE-Legal-Technical-Credit`: pulls a case live
from Supabase by LN number and generates a branded **Sanction Quotation**
(processing-fee letter) or a sequentially-numbered **Tax Invoice** PDF.

## Files

```
index.html            Dashboard — links to Quotation & Invoice, shows quick stats
quotation.html         Sanction Quotation generator
invoice.html            Tax Invoice generator + running ledger
shared.js               Data fetch, formatting, PDF export helpers (both pages use this)
shared.css               Diamond Noir theme, matches admin.html / credit.html
sql/001_invoices_table.sql   Creates the `invoices` table + RLS policies
supabase-config.js       ⚠️ NOT included — copy yours in, see below
auth-guard.js             ⚠️ NOT included — copy yours in, see below
```

## 1. Set up before first use

**Copy two files in from your existing `SOLITAIRE-Legal-Technical-Credit` repo:**

- `supabase-config.js`
- `auth-guard.js`

Every page here (`index.html`, `quotation.html`, `invoice.html`) loads them
exactly the way `admin.html` and `credit.html` do, so the same login session,
`window.SolitaireDB.sb` client and `window.SolitaireAuth.profile.role` gate
are reused — no separate login, no second Supabase key to manage.

**Run the invoices migration once**, in the Supabase SQL editor for project
`nbpvamrwzqrgoiwpadwc`:

```
sql/001_invoices_table.sql
```

This creates `public.invoices` with RLS restricted to admin/owner accounts.
⚠️ The RLS policy assumes a `profiles` table keyed by `auth.uid()` with a
`role` column, matching the check already used client-side in `admin.html`
(`auth.profile.role`). If your role/permission system has since moved fully
behind the `has_permission()` function mentioned in your notes, swap the
`USING`/`WITH CHECK` subqueries in the SQL file to call that function instead
so this table follows the same RBAC path as everything else.

## 2. Verify the field map matches your live schema

This was built against the schema confirmed in `admin.html`:

| Concept | Column |
|---|---|
| LN number | **not a stored column** — always `LN-` + `leads.id` |
| Applicant name/mobile | `leads.borrower->>'name'`, `leads.borrower->>'mobile'` |
| Applicant address | `leads.borrower->>'location'`, `leads.borrower->>'pincode'` |
| Loan type / bank | `leads.loan_type`, `leads.institution_name` |
| Sanction record | `sanctions` where `lead_id = leads.id` (one per lead, unique) |
| Sanction fields | `sanction_amount`, `tenure_months`, `roi`, `emi`, `processing_fee`, `insurance`, `banker`, `final_remarks` |

If any of these have since changed, the single place to fix it is the field
references inside `shared.js` (`fetchLeadBundle`, `borrowerAddress`) and the
two `build...HTML()` functions in `quotation.html` / `invoice.html`.

## 3. Deploy

Same pattern as your other repos — plain static files on GitHub Pages:

```bash
git init
git add .
git commit -m "Quotation & Invoice suite"
git branch -M main
git remote add origin https://github.com/Sachink24/SOLITAIRE-Quotation-Invoice.git
git push -u origin main
```

Then in GitHub → Settings → Pages, deploy from `main` / root — same as your
other SOLITAIRE apps. Because it shares the login session with
`SOLITAIRE-Legal-Technical-Credit`, it works best hosted on the **same
`sachink24.github.io` origin** (e.g. as a subfolder of that repo, or as
`sachink24.github.io/SOLITAIRE-Quotation-Invoice/`) so the Supabase Auth
session carries over without a second login. If you'd rather fold this
straight into the existing repo instead of a new one, just drop these files
into `SOLITAIRE-Legal-Technical-Credit/` directly — `supabase-config.js` and
`auth-guard.js` are then already sitting right next to them.

## 4. How it works

- **Quotation** (`quotation.html`): looks up `leads` + latest `sanctions` row
  by LN number, refuses to generate if there's no sanction on file yet
  (nothing to quote), builds the branded letter, and exports it via
  `html2pdf.js` — same PDF pipeline your other pages already use.
- **Invoice** (`invoice.html`): same lookup, editable fee/GST/payment fields,
  computes GST + total, gets the next sequential number for the current
  financial year (`SFM/INV/2026-27/0001` style) by counting existing rows in
  `invoices` for that FY, **inserts the invoice row first** (so the number is
  never reused even if PDF export fails), then generates the PDF. The ledger
  panel at the bottom reads straight from `invoices`.

## 5. Things still marked `[ ]` you'll want to fill in

Both letter templates leave a few placeholders that aren't in your Supabase
schema anywhere (contact number, email, GST bank details) — search for
`[Contact Number]`, `[Email Address]`, `[Account Number]`, `[IFSC Code]`,
`[UPI ID]` in `shared.js` and `invoice.html` and hard-code your real details
once, rather than typing them per document.
