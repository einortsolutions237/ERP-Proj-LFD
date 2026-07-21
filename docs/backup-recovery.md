# Firestore Backup & Recovery — LFD ERP

Set up in Phase 35 (2026-07-21). Covers the `erp-lfd` project's Firestore `default` database only — this is the entire application datastore (every collection: `staff`, `sales`, `customers`, `treatments`, `auditLogs`, etc.). It does not cover Firebase Storage (no bucket is provisioned yet — see the Phase 30 note in `CLAUDE.md`) or anything outside Firestore.

## What's configured

| Mechanism | Setting | Purpose |
|---|---|---|
| Point-in-time recovery (PITR) | Enabled, 7-day version retention | Recover to any specific timestamp within the last 7 days — the tool for "someone/something wrote or deleted the wrong thing a few hours or days ago." |
| Daily backup schedule | Daily, 30-day retention | Recover from a full daily snapshot going back up to 30 days — the tool for "we need to go back further than PITR's 7-day window covers." |
| Delete protection | Enabled | The `default` database itself cannot be deleted (accidentally or otherwise) while this is on. |

Estimated combined monthly cost at this project's actual data volume (~1,700 documents, ~0.5 MB): under $0.01/month. See the Phase 35 completion report for the full pricing breakdown and sourcing.

## Checking current backup state

```
firebase firestore:databases:get default --project erp-lfd
firebase firestore:backups:schedules:list --project erp-lfd --database default
firebase firestore:backups:list --project erp-lfd
```

## Recovery procedure

**Important: restoring does not overwrite the live `default` database in place.** Both PITR and backup-schedule restores create a **new** Firestore database from the chosen source. There is no "restore over production" button — this is deliberate on Google's part, so a bad restore can never destroy a working database further.

### Step 1 — decide the recovery source

- **Within the last 7 days, need a specific moment** (e.g. "right before this bad write happened at 14:32"): use PITR.
- **Older than 7 days, or a full-day snapshot is good enough**: use a daily backup. List available backups first:
  ```
  firebase firestore:backups:list --project erp-lfd
  ```

### Step 2 — restore into a new database

```
firebase firestore:databases:restore --project erp-lfd --database <new-database-id> --backup <backup-resource-name>
```
(For a PITR restore rather than a named backup snapshot, the underlying API takes a `sourceDatabase` + a specific timestamp instead of a `--backup` id — this is not yet exposed as a simple CLI flag as of this writing; check `firebase firestore:databases:restore --help` for the current syntax, since this is one of the newer Firestore CLI surfaces and may have changed.)

Pick `<new-database-id>` as something clearly temporary, e.g. `recovery-2026-08-01`.

### Step 3 — verify the restored data

Before touching the live app, inspect the new database directly (Firebase Console → Firestore → switch database selector, or a one-off Admin SDK script pointed at the new database ID) and confirm it has what you expect.

### Step 4 — get the app running against the recovered data

This is the part that needs a real decision at the time, not a fixed script, because it depends on *why* you're recovering:

- **Whole-database disaster recovery** (the `default` database itself is corrupted or was deleted despite delete-protection somehow being off): the new database needs to become the one the app actually talks to. This app hardcodes `'default'` as the database ID in `src/lib/firebase/admin.ts` (`getFirestore(app, 'default')`) — there is no environment-variable indirection today. The realistic options are: (a) delete the broken `default` database (if it still exists and is deletable) and use `firestore:databases:clone` or a full export/import to repopulate a fresh `default` from the recovered database, or (b) accept a short outage and change the hardcoded `'default'` string to the recovered database's ID, redeploy, and rename later. Neither is a single command — this is the scenario worth a calm decision at the time, not a rehearsed script, and it's the main reason this runbook doesn't promise a fully automated recovery.
- **Partial recovery** (e.g., one customer's data got corrupted, or a handful of documents were wrongly deleted, and the rest of the live `default` database is fine): don't touch `default` at all. Instead, read the specific documents you need out of the recovered database (Console or a script) and write just those back into the live `default` database by hand. This is almost always the right choice for this project's actual likely failure modes (a bad manual edit, an accidental delete during testing) — a whole-database restore is the last resort, not the default response.

### Step 5 — clean up

Delete the temporary recovery database once you're done with it (it's still billing storage while it exists):
```
firebase firestore:databases:delete <new-database-id> --project erp-lfd
```

## What this doesn't cover

- Firebase Storage — no bucket exists yet (Phase 30's outstanding item), so there's nothing to back up there.
- Cloud Functions source code — that's in this Git repository, not Firestore; recovering it means checking out the right commit/tag, not restoring a database.
- A rehearsed, tested disaster-recovery drill — this runbook has not been exercised end-to-end against a real restore. If disaster recovery ever becomes a live concern (e.g. before a genuine production launch with real customers depending on uptime), doing one dry run of Step 2 (a real backup restored into a real scratch database, then deleted) would be worth the hour it takes, rather than finding out the exact CLI syntax works as documented only during a real incident.
