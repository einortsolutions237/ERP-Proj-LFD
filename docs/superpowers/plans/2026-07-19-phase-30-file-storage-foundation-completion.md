# Phase 30 (File Storage Foundation) — Completion Report

**Status: complete. Final whole-branch review — Ready to merge: Yes. Live-verified to the extent possible given a real, pre-existing infrastructure gap — see Outstanding.**

Plan: `docs/superpowers/plans/2026-07-19-phase-30-file-storage-foundation.md`
Range: `6fe3e82..ad0515f` (2 commits, one per task), plus one small follow-up doc-comment commit (`209ae3f`).

## What shipped

A generic, capability-gated file-attachment foundation — this project's first use of Firebase Storage in 30 phases. No UI anywhere; this is infrastructure only, for Phase 30.1 (lab scans) and 30.2 (expense receipts) to build on later.

**Task 1** — `attachments` Firestore collection (relatedCollection, relatedDocId, storagePath, fileName, mimeType, sizeBytes, uploadedBy, branchId, createdAt), Storage rules fully closed (`allow read, write: if false`), a new `src/lib/attachments/capabilityMap.ts` mapping `'labResults' | 'expenses'` to `{ manage, view }` capabilities (both looked up from the actual current capability constants, not guessed), and `POST /api/attachments` (multipart upload: capability check → file-type/size validation → related-doc existence check → Storage write → Firestore write → audit log). A genuinely new Storage emulator was wired into the test harness for the first time in this project.

**Task 2** — `GET /api/attachments/[id]`, gated on the *view* capability resolved from the attachment's own stored `relatedCollection`, streaming the file's bytes back directly (not a signed URL — deliberate, avoids IAM/emulator signing friction).

**One real gap the brief didn't anticipate, resolved during planning**: `LabResult` documents have no `branchId` field at all (lab data is deliberately org-wide in this app), so `attachments.branchId` is computed generically (`relatedDoc.branchId ?? null`) rather than any per-collection special-casing — every lab-result attachment correctly gets `branchId: null`.

## Review summary

Both tasks reviewed clean at Opus tier (elevated rigor per explicit user instruction — "the same care Phase 13 or Phase 18 got"), zero Critical/Important findings in either. Both task reviewers independently re-verified the security-relevant claims against live source rather than trusting the diff's comments: the capability-map role lists against the real `permissions.ts` constants, and the `LabResult`-has-no-`branchId` fact against the real type file. The two real "can view but not manage" asymmetries this phase's tests exercise (`general_manager` for expenses, `nurse` for lab results) were confirmed real, not assumed.

**Final whole-branch review (Opus): Ready to merge — Yes.** Independently re-verified everything both task reviews already confirmed, plus cross-task consistency (Task 2 imports Task 1's capability map by exact name, no field-name drift between the upload write and retrieval read, tests appended cleanly not interleaved) and that the closed-rules-plus-Admin-SDK-only pattern is airtight for both registered collections. Corrected a real error in the controller's own review dispatch (said "27 tests," the diff actually has 17 — 10 upload + 7 retrieval). Confirmed `.env.local` does have the Storage bucket env var set (the bucket itself is what's unprovisioned — see Outstanding). Five Minor notes, all either inherent to the plan's mandated design or genuinely forward-looking (GET doesn't also check `branchId`, correct today since no relevant role is both branch-locked and holds either view capability, but flagged for any future branch-scoped attachable collection). Applied the one recommended, non-blocking follow-up directly: a documentation comment in `capabilityMap.ts` recording the manage⊆view and branch-scoping invariants for future entries (commit `209ae3f`).

## Verification

**Automated:** `npm test` — 496/496 passing (479 + 17 new), zero regressions.

**Live verification, real `erp-lfd` — partial, and honestly limited by a real infrastructure gap, not silently worked around:**

**The real Storage bucket for `erp-lfd` does not exist yet in Google Cloud Storage.** A direct Admin-SDK write against it returns `404: The specified bucket does not exist`. This affects both routes identically and was discovered independently during Task 2's own live-verification attempt, then re-confirmed at the controller level with four targeted real-HTTP checks against the running dev server (via genuine login — `POST /api/auth/session` with real Admin-SDK-minted tokens, not manually injected cookies):

1. A role lacking the relevant capability (`cashier`, no `accounting.expense.*`) attempting an upload → real `403 Forbidden`, correct.
2. An unsupported file type (`.txt`) → real `400`, clear message (`"Unsupported file type \"text/plain\" — only JPEG, PNG, and PDF are accepted"`).
3. An unregistered `relatedCollection` (`'products'`) → real `400`, clear message.
4. A legitimate `finance_admin` uploading a real PDF to a real expense → real `500` (the Storage SDK's error propagates uncaught, since the route's `try/catch` only handles `AuthError`). **This confirms the failure mode is safe** — it fails loudly with no partial write, not a hang and not a false success — but it's not yet a graceful, user-facing JSON error. Worth wrapping when Phase 30.1/30.2 build UI on top of this, not blocking for the foundation itself. Confirmed via a follow-up query that this failed attempt left zero orphaned Firestore/Storage state, matching the code's Storage-before-Firestore write ordering.

**A genuine discrepancy was found and corrected at the controller/finishing stage, not silently accepted**: Task 2's own report claimed "two stray real expenses docs created mid-diagnosis were fully cleaned up," but a direct query of real `erp-lfd` data found one still present — `expenses/BGs8VPjlIwv7XHwhop2B`, literally titled "Phase 30 Task 2 live-verification expense (to be deleted)," plus its `expense_create` audit-log entry. Both were deleted, and a broader 3-hour recency check plus a full scan of the (empty) `attachments` collection confirmed nothing else was left behind. This is exactly the "do not trust the report" discipline this project's review process already applies to subagents, applied here to a subagent's own self-reported cleanup claim — worth remembering that "cleaned up" claims deserve the same skepticism as any other unverified report.

**The emulator suite (17 new tests: upload, retrieval, both asymmetries, both rejection classes, and a real upload-then-retrieve byte-for-byte cycle) is the evidence for actual file-storage functionality working end to end** — the real-bucket path can't be exercised until Storage is provisioned.

## Outstanding

- **Provision Firebase Storage for the real `erp-lfd` project, then `firebase deploy --only storage`.** This is the one thing that must happen before this foundation (or Phase 30.1/30.2) is usable against real data. Not a code fix — the code is correct and proven against the emulator; it's waiting on an ops/console step.
- Once Storage is provisioned, re-run the four live-HTTP checks above (they're saved in this session's scratch, not committed) to confirm a real upload/retrieve cycle succeeds against the real bucket too, closing the loop the emulator suite already proves in isolation.
- Minor, non-blocking: Storage-layer errors (like the missing-bucket case) currently surface as a bare 500, not a clear JSON error — worth wrapping in a `try/catch` around the Storage `.save()`/`.download()` calls specifically when Phase 30.1/30.2 build real UI on top of this, so a genuine future Storage outage doesn't show a blank error to a real user.
- Phase 30.1 (lab scan uploads) and 30.2 (expense receipt uploads) are the next natural phases, both blocked on the Storage-provisioning step above, not on anything in this foundation's code.

Tag `phase-30-baseline` not created — per this project's tag-on-request-only practice.
