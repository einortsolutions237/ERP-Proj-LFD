# Resuming this project in a new Claude Code session

Paste this to start a new session:

> Resume the LFD Services ERP project — check CLAUDE.md, the latest phase-N-baseline tag, and the plans directory for where we left off, then tell me current status before we start anything new.

A shorter version works too: "resume the LFD ERP project, what's the current state?"

## Why this works

- **"LFD Services ERP"** matches the project name in Claude's saved memory (workflow patterns, recurring bugs to watch for, UAT/wrapup conventions) — mentioning it pulls that context in.
- **CLAUDE.md** — the repo's living design doc; a new prose section gets added after each phase.
- **Latest `phase-N-baseline` tag** — `git tag` shows what's actually shipped, reviewed, and UAT-passed. Current: `phase-4-baseline`.
- **`docs/superpowers/plans/`** — the most recent dated plan file has the fullest detail on what's currently in progress or just finished.
