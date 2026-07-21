# Phase 35 — Monitoring & Backup Foundation — Completion Report

**Date:** 2026-07-21
**Plan:** investigation findings + plan sent in-session for review before implementation (per this phase's own explicit process requirement); no separate plan doc
**Status:** Complete for Firestore backup/recovery and Cloud Function error-rate alerting, both live-verified. The app-uptime-check half of "monitoring & alerting" is explicitly skipped this phase, per user decision, after investigation surfaced a real open question about whether a production deployment even currently exists (see below) — named plainly as outstanding, not silently dropped.

## Summary

This is the first phase in the production-readiness sequence that's been on the roadmap since Phase 20. Investigation came first, as required: confirmed the actual Blaze tier, Firestore edition/region, current backup/monitoring state (all zero), and — critically — that the exact same permission-gap class behind Phase 30's still-unresolved Storage bucket also applies here (the app's own service account is correctly locked out of the Monitoring/Billing APIs; this kind of setup needs the human owner's own Console access, not a code-deployable credential). A plan was sent for review with four explicit adjustable parameters; all four were resolved through follow-up questions (PITR cost confirmed negligible with real numbers, retention kept at 30 days, two real notification-channel recipients obtained after catching one duplicate and one likely-typo email along the way, uptime-check interval confirmed). Implementation then proceeded, surfacing one further real finding (no confirmed production URL exists) which the user chose to resolve by skipping that half of the work rather than guessing.

## Investigation findings

- **Tier: Blaze**, confirmed decisively via 7 live Cloud Functions v2 (`onAppointmentScheduled`, `onLabResultEntered`, `onLeaveRequestReviewed`, `onLeaveRequestSubmitted`, `onLowStock`, `onMessageSent`, `onPendingDeliveryCreated`) in `africa-south1` — Cloud Functions v2 cannot run on Spark at all.
- **Firestore**: Native mode, **Enterprise edition**, `africa-south1`. Before this phase: PITR disabled, 1-hour version retention, delete protection disabled, zero backup schedules, zero backups — no recovery path existed at all.
- **The Phase 30 Storage bucket gap is unchanged** — `bucket.exists()` for `erp-lfd.firebasestorage.app` still returns `false`, confirmed directly (not assumed from the old report).
- **The same permission-gap class extends to monitoring/backup setup, confirmed directly**: the app's runtime service account (`firebase-adminsdk-fbsvc@erp-lfd.iam.gserviceaccount.com`) gets `403 PERMISSION_DENIED` on both the Cloud Monitoring API and the Billing Budget API (which isn't even enabled on the project). This is correct least-privilege behavior, not a bug — but it means this class of setup structurally requires the human owner's own Console access (`einortsolutions237@gmail.com`), the same way the Storage bucket needed a one-time console action nobody had done yet. This phase's monitoring work was done through that real, already-authenticated Console session rather than worked around.
- **No CI/CD** (no `.github/workflows`) — deploys are manual, from this environment, using the logged-in Google account.
- **Zero existing monitoring code or dependencies** — no `console.log`/`console.error` anywhere in `functions/src/*.ts` (only automatic Cloud Functions runtime logging exists), no third-party observability packages in either `package.json`.
- **Real data volume, measured directly**: ~1,697 documents across 30 collections, ~0.56 MB total. Used to ground the PITR cost decision in real numbers rather than a hypothetical.

## What was implemented

### Backup (Firestore native, not a GCS export — deliberately, to avoid a second instance of the Storage-bucket-provisioning gap)
- **Point-in-time recovery**: enabled, 7-day version retention (`firebase firestore:databases:update default --point-in-time-recovery ENABLED`) — confirmed via `firestore:databases:get` (`versionRetentionPeriod: 604800s`).
- **Delete protection**: enabled (`--delete-protection ENABLED`) — a zero-cost, directly-adjacent safeguard against accidental full-database deletion, done alongside PITR since both are the same command.
- **Daily backup schedule, 30-day retention**: created (`firebase firestore:backups:schedules:create --recurrence DAILY --retention 30d`), confirmed via `firestore:backups:schedules:list`.
- **Real cost estimate, per explicit request, not silently assumed reasonable**: sourced from Google's official Firestore Enterprise pricing (storage ≈ $0.15/GiB-month, PITR same rate, backups ≈ $0.03/GiB-month, no free tier on any of the three) against this project's real ~0.56 MB data volume, generously padded 10× for Firestore's per-document/index storage overhead. **Combined total: under $0.01/month.** Recommendation was to keep PITR at this cost — accepted.
- **Recovery procedure, documented in `docs/backup-recovery.md`**, not just asserted as "configured": both restore paths (PITR, backup schedule) restore into a **new** Firestore database, never overwrite `default` in place. The runbook covers deciding which recovery source to use, the actual restore command, verifying restored data before touching the live app, and — honestly, not glossed over — that getting the app to actually use recovered data is a judgment call at the time (partial recovery: copy specific documents back into live `default`; whole-database disaster recovery: either clone/re-import into a fresh `default` or accept a short outage and repoint the hardcoded `'default'` database ID in `src/lib/firebase/admin.ts`). The runbook explicitly flags that it has not been rehearsed end-to-end against a real restore, and that the exact PITR-restore CLI syntax wasn't fully verified since it's one of Firestore's newer CLI surfaces.

### Monitoring & alerting (native GCP Cloud Monitoring, done through the real Console — no third-party tool, justified: this app already lives entirely in the GCP/Firebase/Vercel ecosystem and Cloud Monitoring's free tier covers this at this scale)
- **Two email notification channels** created (`Account Owner` → `einortsolutions237@gmail.com`, `Operational Contact` → `njeirheinard@gmail.com`) — confirmed both real, distinct addresses after catching a duplicate-address submission and a likely gmail.com/mail.com typo in the request, both resolved by asking rather than guessing.
- **Cloud Function error-rate alert policy** ("LFD ERP - Cloud Function Error Rate"): metric `cloudfunctions.googleapis.com/function/execution_count`, filtered to `status != ok`, summed over a 5-minute rolling window, threshold `> 0` — i.e. any single Cloud Function error triggers an alert. Deliberately a simple "any error" trigger rather than a rate/percentage threshold, since this project's real invocation volume is low enough that a percentage-based threshold would add complexity with no benefit. Both notification channels attached — Google's own Console UI independently recommended exactly this ("we recommend that you create multiple notification channels for redundancy purposes"), confirming the earlier research rather than just asserting it. Confirmed live: policy shows Enabled, correct threshold/filter, both channels attached.
- **Honest scope correction, made explicit in the plan before implementation**: Phase 27's actual historical incident (the audit-log Timestamp-serialization crash) was a Next.js page-render error, not a Cloud Function failure — this alert would not have caught that specific bug, and the plan said so plainly rather than overselling. It's built for what it actually covers: a genuinely crashing background trigger.

### Code
- **`src/app/api/health/route.ts`** (new): unauthenticated, returns `200 {"status":"ok"}`, no Firestore/Firebase dependency at all — deliberately, so it can only ever reflect the deployed process being up, never a downstream dependency hiccup being mistaken for an outage. Intended as the eventual uptime-check target.
- **`src/middleware.ts`**: added `/api/health` to the existing `PUBLIC_PATHS` allowlist. **A real, necessary fix found while verifying the new route** — this app has a global middleware gating every route behind a session-cookie check; the health endpoint was getting redirected to `/login` until added to the allowlist. Flagged explicitly since it's a one-line change to an access-control file, even though the route itself has no auth logic being bypassed (it reads and returns nothing sensitive).

## What was explicitly skipped, and why

**The uptime-check half of "monitoring & alerting" was not implemented this phase, per user decision.** While building it, a real blocker surfaced: setting up an uptime check requires a real production URL to point it at, and this session found no evidence one currently exists — not logged into Vercel in the browser, no `.vercel` project link in this working directory, and (more tellingly) a review of this project's own history shows **every single phase's "live verification against real `erp-lfd` data" across more than 30 phases has run against a local `next dev` server, never an actual deployed production instance.** CLAUDE.md states the app is "deployed on Vercel" as settled architecture, but nothing in this session could confirm a live deployment actually exists right now. Rather than guess a URL (which risks silently monitoring nothing, or the wrong thing), this was surfaced to the user directly and skipped on explicit instruction.

**This is worth resolving before the next phase in this sequence**, not just for the uptime check's sake: if there genuinely is no live production deployment, that's a more fundamental fact about this project's actual current state than a missing monitoring check — and if there is one, its URL should get recorded somewhere findable (this report, or CLAUDE.md) so the next session doesn't have to re-investigate the same question.

No staging environment, no user/operational documentation beyond the recovery runbook, and no UAT were attempted — all explicitly out of scope per the phase brief, unchanged.

## Verification

- **`npx tsc --noEmit`**: clean after the `/api/health` route and middleware change.
- **`npm test`**: 505/505 passing, no regressions (this phase touched no test-covered application logic).
- **Live verification, all via the real, already-authenticated environment (Firebase CLI login, real Cloud Console session)** — no emulator, no mocking, since this phase's entire subject is real infrastructure state:
  - `firestore:databases:get` confirms PITR enabled (604800s retention) and delete protection enabled.
  - `firestore:backups:schedules:list` confirms the daily/30-day schedule exists.
  - The Cloud Monitoring Console confirms the alert policy is Enabled with the correct metric, filter, threshold, and both notification channels attached.
  - `curl` against the real local dev server confirms `/api/health` returns `200 {"status":"ok"}` with no session cookie, after the middleware fix (previously `307` to `/login`).
- Zero changes to any capability gate, business logic, or design-system file — confirmed by the diff itself (three files touched: `src/app/api/health/route.ts` new, `src/middleware.ts` one-line addition, `docs/backup-recovery.md` new).

## Outstanding for the next phase in this sequence

- **The production-deployment-URL question above** — resolve whether a live Vercel deployment exists, and if so, record its URL; then the uptime check itself is a small, quick follow-up (the `/api/health` endpoint and its middleware exemption are already in place and ready for it).
- Staging environment (its own dedicated planning conversation, per this phase's explicit scope limit).
- User/operational documentation, UAT (both explicitly deferred).
- The recovery runbook has never been exercised end-to-end — worth one real dry run (restore a backup into a scratch database, confirm it works, delete it) before this becomes a live concern rather than during a real incident.
- The Storage bucket provisioning gap (Phase 30, still open, unrelated to this phase but the same root permission-class).
