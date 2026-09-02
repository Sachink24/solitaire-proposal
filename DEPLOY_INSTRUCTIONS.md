# Solitaire Finz Mart — Quotation & Invoice Suite (standalone)

This makes `solitaire-proposal` a fully working standalone site with its own
login — separate from `SOLITAIRE-Legal-Technical-Credit`, per your last
message. It shares the same Supabase project (`nbpvamrwzqrgoiwpadwc`), so
any existing admin/owner account you already use elsewhere will sign in here
too — no new accounts needed unless you want a separate one for this app.

## 1. Files in this package

```
login.html              NEW — Supabase Auth sign-in page
supabase-config.js       NEW — Supabase client (URL + anon key, already filled in)
auth-guard.js             NEW — session/profile bootstrap, used by every protected page
index.html                 Dashboard (was fees.html) — links to Quotation & Invoice
quotation.html               Sanction Quotation generator
invoice.html                    Tax Invoice generator + running ledger
shared.js                        Data fetch, formatting, PDF export helpers
shared.css                        Diamond Noir theme
001_invoices_table.sql              Run once in Supabase SQL editor — creates `invoices` + RLS
```

## 2. Replace repo contents

In your local clone of `solitaire-proposal`:

```bash
git rm quotation-panel.html quotation-generator.js "README (1).md"
```

These are the old standalone generator with the placeholder anon key and the
wrong field names (`applicant_name`, `lead_number`, etc.) — replaced by
`quotation.html` + `shared.js`, which read the real schema
(`leads.borrower->>'name'`, `sanctions.sanction_amount`, etc.).

Then copy in every file from this package (they overwrite `index.html`,
`invoice.html`, `quotation.html`, `shared.js`, `shared.css`, and add the three
new files), and commit:

```bash
git add -A
git commit -m "Add standalone Supabase Auth login; replace legacy quotation-panel with schema-correct suite"
git push
```

Wait ~1 min for GitHub Pages to redeploy, then visit:
`https://sachink24.github.io/solitaire-proposal/login.html`

## 3. Run the SQL migration

In the Supabase SQL editor for project `nbpvamrwzqrgoiwpadwc`, run
`001_invoices_table.sql` once. It creates `public.invoices` and locks it down
with RLS so only rows readable/writable by an active admin/owner (checked
against `public.users`, matching the auth model your other tables already use
— *not* a `profiles` table).

## 4. How login works here

- `login.html` calls real Supabase Auth (`signInWithPassword`), the same
  mechanism `auth.uid()` relies on elsewhere in your schema — so RLS on
  `leads`, `sanctions`, and the new `invoices` table all work correctly.
- After signing in, it looks up the matching row in `public.users` by
  `auth_user_id = auth.uid()`. If there's no linked row, or `status` isn't
  `'active'`, it signs the session back out and shows an error rather than
  leaving someone half-authenticated.
- `auth-guard.js` (loaded on `index.html`, `quotation.html`, `invoice.html`)
  repeats that same check on every page load and exposes
  `window.SolitaireAuth = { session, user, profile }`, redirecting to
  `login.html` if there's no valid session. Each page's own script then
  gates on `profile.role` being `admin` or `owner` (unchanged from what you
  uploaded).
- A "Signed in as ... / Sign out" control renders automatically into the
  `#topbarActions` slot already present in your topbar markup.

**One thing worth knowing:** `public.users` currently has a `password`
column holding plaintext values. This new login page never reads or writes
that column — it goes through Supabase Auth instead. If nothing else in your
stack still depends on that column, it's worth dropping it later; storing
plaintext passwords is a real exposure if that table (or a backup of it) is
ever read by the wrong party.

## 5. If an account isn't linked yet

If a login succeeds against Supabase Auth but shows "no Solitaire account is
linked to it yet" — that means `public.users` has no row with
`auth_user_id` matching that Supabase Auth user. Fix it with:

```sql
update public.users
set auth_user_id = '<the auth.users.id for that email>'
where email = '<their email>';
```

You can find the Supabase Auth user ID under Authentication → Users in the
dashboard.
