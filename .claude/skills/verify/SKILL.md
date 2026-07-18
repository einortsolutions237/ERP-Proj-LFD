---
name: verify
description: How to live-verify a change in this repo against real erp-lfd data through the real browser/HTTP surface, not the emulator.
---

# LFD ERP — project verify recipe

This app has no staging environment and no mock-login flow. Live verification
means real `erp-lfd` data, a real running `next dev` server, and real Firebase
session cookies — the same custom-token-exchange pattern this project has used
since Phase 8's live verification.

## Launch

Check for an already-running dev server before starting your own —
`netstat -ano | grep LISTENING | grep :3000` (or PowerShell equivalent). This
repo is often left running across sessions. If none, `npm run dev` (reads
`.env.local`, targets `erp-lfd` directly — there is no emulator mode for
`npm run dev`; `npm test` is the only thing that touches the emulator).

## Firestore index / project CLI gotcha

`firebase firestore:indexes --project erp-lfd` alone 404s ("Project 'erp-lfd'
or database '(default)' does not exist") even though the project is real and
current. This project's Firestore database is explicitly named `default`, not
the SDK's implicit `(default)` — pass `--database=default` explicitly:

```
firebase firestore:indexes --project erp-lfd --database=default
```

Same explicit-database-ID requirement applies to Admin SDK Firestore access —
see `src/lib/firebase/admin.ts`'s own comment on `getFirestore(app, 'default')`.

## Get a handle: mint a real session cookie for any role

`staff` collection docs hold `{email, role, branchId}` per account; UIDs match
Firebase Auth. As of 2026-07-18 there is one real account per role already
provisioned in `erp-lfd` (test.admin@, ikeja.manager@/downtown.manager@,
ikeja.cashier@, test.doctor@, finance.admin@, test.gm@, test.hradmin@,
test.inventorymanager@, test.itadmin.phase19@, test.labstaff@, test.medsec@,
test.nurse@, test.protocol@, plus the real super_admin) — list them fresh with
a short Admin-SDK script rather than trusting this list to still be accurate.

To get a real, browser-usable session cookie for any of them:

1. Load `.env.local` into `process.env` (parse manually — no dotenv dep).
2. `getAuth(app).createCustomToken(uid)` via `firebase-admin/auth`.
3. Exchange it for an ID token: `POST
   https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=<NEXT_PUBLIC_FIREBASE_API_KEY>`
   with `{ token: customToken, returnSecureToken: true }`.
4. In the **real browser** (already-connected `claude-in-chrome`), navigate to
   `http://localhost:3000/login`, then run `fetch('/api/auth/session', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({idToken})})`
   via `javascript_tool`. This must happen as a real page-context fetch, not a
   Node-side request — the session cookie is `httpOnly`, so only a genuine
   `Set-Cookie` response the browser itself receives will stick.
5. Navigate to the page under test. The cookie persists across navigation and
   is overwritten cleanly by repeating step 4 with a different role's idToken
   — no explicit logout needed between role switches in the same tab.

ID tokens expire ~1hr after mint; mint fresh ones per verification session
rather than reusing a saved batch.

Run scripts for steps 1-3 from inside the project directory (not a temp/scratch
dir) so `require('firebase-admin/...')` resolves via the repo's own
`node_modules` — and delete any one-off `_verify_*.js` files you create before
finishing, they're not meant to be committed.

## Known flake

One `/dashboard` navigation redirected to `/login` once (2026-07-18) despite
an immediately-prior successful session-cookie POST, on an otherwise
100%-reliable pattern (~16 other login sequences that same session worked
first try). An immediate retry worked cleanly. Treat a single redirect-to-login
as transient dev-server/HMR noise and retry once before treating it as a real
session bug.

## What's worth driving

- Role-gated visibility: this app's `hasCapability(role, capability)` checks
  are entirely server-computed (React Server Components) — `get_page_text`
  after navigating with a role's cookie is a legitimate, complete surface for
  confirming which sections/widgets render; you don't need pixel screenshots
  for every role, just for the ones worth a visual sanity check (richest
  positive case, key negative case).
- Cross-checking a report/dashboard total against another route's total for
  the identical window: read both routes' exact date-window logic first (this
  app has at least one place — `buildRevenueTrend` vs `buildSalesReport`'s
  `defaultRange()` — where two "last 30 days" implementations differ by one
  day; pass explicit `startDate`/`endDate` to line them up rather than relying
  on both routes' own defaults).
- Audit log entries: query `auditLogs` directly by `actorEmail` + a recent
  `createdAt` window (composite index already exists on the common query
  shapes) rather than trusting a widget's own review claims about what it
  logs.
