# Phase 19 (Messaging) — Completion Report

**Date:** 2026-07-07

## Summary

Staff-to-staff messaging shipped: a relationship-based access check (`canMessage`) — the app's first access model that is not a capability check — enforcing an organizational hierarchy (staff → own-branch `branch_manager` → `general_manager`) plus a flat `it_admin` support line and a `super_admin` reach-everyone line. Two new closed Firestore collections (`conversations`, `messages`), two API routes, one Cloud Function trigger, and a two-page UI (conversation list + thread view), following this project's established patterns throughout (deterministic-ID idempotent creation like `attendanceRecords`, Cloud Function trigger matching `onAppointmentScheduled` exactly, fully-closed Firestore rules like `treatments`/`leaveRequests`).

## Process note on how this phase actually happened, for the record

This phase's implementation was found already complete in a git worktree (`.claude/worktrees/phase-19-messaging`, branch `worktree-phase-19-messaging`) at the start of this session, with its own plan doc and five tasks already committed — not built during this conversation's own dispatch-and-review loop. The originating session is unknown; this is the same kind of gap CLAUDE.md already tracks for Phase 8.1 ("how it actually happened — sequence unconfirmed, content real and good"). Per explicit user decision, this session treated the existing implementation as the accepted plan rather than re-implementing from the separately-drafted plan this session had written first (which took a different, capability-check-based-list-avoiding design in a few places — see below) — the existing worktree's plan and code became the source of truth, and this session's own alternate plan draft (`2026-07-07-phase-19-messaging.md` on `main`, never committed) was discarded in favor of it.

## What shipped

- `src/lib/messaging/canMessage.ts` — pure relationship-check function, symmetric by construction, five categories (staff / branch_manager / general_manager / it_admin / super_admin).
- `src/lib/messaging/getMessagingParty.ts` — live Firebase Auth custom-claims lookup for the *other* participant in a conversation (never the `staff` Firestore doc) at the moment a message is sent or a thread is read — this is what makes a role/branch change close off an existing conversation immediately, without needing the affected account to re-authenticate.
- `src/lib/auth/permissions.ts` — new `messaging.access` capability (granted to every role) gating baseline feature access only; `canMessage` itself deliberately stays outside `permissions.ts`'s `ROLE_CAPABILITIES` shape, since it is a relationship check, not a capability.
- `GET /api/messaging/conversations` — merged reachable-contacts + existing-conversations list, each item carrying a live `canReply` flag.
- `GET`/`POST /api/messaging/messages` — thread read (with a read-receipt side effect, no audit log) and send (audit-logged as `message_create`, live-re-validated against `canMessage` every time — a 403 if the pair was never allowed, a 409 if a conversation exists but the relationship has since closed).
- `functions/src/messageNotifications.ts` — `onMessageSent` Cloud Function, deployed to `erp-lfd`, notifying the other participant.
- `/messages` and `/messages/[peerUid]` pages, a `Messages` Sidebar entry visible to every role, and a `message_received` NotificationBell route.
- `firestore.rules`/`firestore.indexes.json` — `conversations`/`messages` fully closed; one composite index (`messages`: `conversationId` + `createdAt`).
- `docs/tech-debt.md` — TD-4 (deleted staff member's conversations become unreachable, data survives) and TD-5 (deactivated-but-not-deleted staff remain fully messageable) — both accepted, deliberately deferred, per explicit user decision.

## Review

Final whole-branch review (Opus): **zero Critical findings.** `canMessage` traced correct against every hierarchy rule including the tricky negatives (branch_manager↔branch_manager, general_manager↔general_manager, general_manager↔staff all correctly `false`); send-time enforcement confirmed to use live claims; conversation-ID scheme confirmed duplicate-proof under concurrent first-sends; no Timestamp leaks; correct composite index; Cloud Function confirmed template-faithful; zero pre-existing route files touched.

One Important finding, resolved as documentation rather than code: the conversation-*list* route derives its advisory `canReply` hint from the `staff` Firestore doc rather than live claims, which the plan's Global Constraints (as originally worded) said should never happen. Per explicit user decision, this was accepted as an intentional, low-risk performance trade-off (the list never grants access itself; real enforcement at send/read time already uses live claims) and the plan's constraint wording was amended to scope the live-claims requirement to the two enforcement routes specifically, rather than changing the code to add one Auth `getUser()` call per staff member per list poll.

One Minor finding — deactivated (disabled, not deleted) staff remain fully messageable, distinct from TD-4's deleted-staff case — was added as **TD-5**, per explicit user decision, rather than fixed in-phase.

**A real bug the whole-branch review missed, found during the finishing-a-development-branch verification pass:** the review read the diff but was not asked to run `npm run lint`. Doing so surfaced a genuine defect in `ThreadView.tsx` — `notFound` was a `useRef`, set to `true` inside `load()`'s 404 branch, but mutating a ref never triggers a re-render. Since nothing else in that code path calls `setState`, a genuinely unreachable peer's thread page would get stuck showing "Loading…" forever instead of ever rendering the intended "This contact is not reachable" message. Fixed by converting `notFound` to `useState`; re-verified clean via `tsc --noEmit` and `eslint`. The one remaining lint line in this file (`load()` called directly in a `useEffect` body) is an already-accepted, pre-existing pattern identical to `NotificationBell.tsx` on `main` — left alone as out of this phase's scope, not a new issue.

## Live verification

**29/29 checks passed** against real `erp-lfd` data. Six disposable test accounts were provisioned (`cashier`/`hr_admin` across two real branches, `branch_manager` for each of those branches, `general_manager`, `it_admin`), the existing `super_admin` account was reused, sessions were minted via Admin-SDK custom-token exchange (no stored passwords), and the dev server was run against real Firestore data (Admin SDK reads/writes bypass Firestore rules entirely, so undeployed rules don't block functional testing — only a genuinely new composite index would, and that was deployed).

Checks covered: every named relationship in the hierarchy (staff→own-branch-manager succeeds, cross-branch and staff→staff both fail; branch_manager→own-branch-staff and →general_manager succeed, cross-branch fails; general_manager→any branch_manager succeeds org-wide, →staff directly fails; anyone↔it_admin both directions; super_admin↔anyone both directions), duplicate-conversation prevention under actual concurrent requests (two simultaneous first-sends between the same pair resolved to the same `conversationId`, exactly one `conversations` doc), audit logging (message_create written on send, nothing written on read), the `/messages` page reachable for every one of the seven test sessions, and the branch-change-closes-conversation guarantee.

**One live-verification correction worth recording:** the first attempt at the branch-change check mutated the *sender's* custom claims and used the sender's own already-issued session cookie to retest — which predictably didn't close the conversation, since a session cookie's claims are baked in at mint time and this app's own architecture never re-reads the *caller's* claims mid-session (only the counterparty's, via `getMessagingParty`). Corrected by mutating the *recipient's* claims instead (the account named as `peerUid` in the request, looked up live on every send) while leaving the sender's session untouched — confirmed 409 on send, `canReply: false` on read, reverted afterward. This is exactly the mechanism the phase exists to prove, working as designed; the first failure was a test-methodology bug, not a code defect.

After deploying `onMessageSent` (`firebase deploy --only functions:onMessageSent,firestore:rules,firestore:indexes`), a real message produced a `message_received` notification for the recipient within 2 seconds, confirmed via direct Firestore read.

**Cleanup:** all six test accounts, their `staff` docs, all six `conversations` created during verification (and their 15 `messages`), and the one `notifications` doc were deleted; confirmed zero orphaned conversations remain afterward. The 16 `message_create` audit log entries generated during verification were deliberately left in place, matching this project's established practice of treating the audit trail as permanent history rather than deleting it during test cleanup.

## Outstanding / not in this phase

- TD-4 and TD-5 (both above) remain open, deliberately deferred.
- The plan-vs-implementation constraint wording gap is resolved (documentation amended); no code follow-up needed.
- CLAUDE.md's own note on how Phase 8.1 "actually happened" now has a sibling for Phase 19 (see Process Note above) — worth tracking alongside it, not blocking anything.
