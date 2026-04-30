# FRAME — Build State

## Current Version
v0.1.0 (Iteration 0 — scaffold)

## Completed Iterations
| # | Name | Status |
|---|------|--------|
| 0 | Scaffold | Complete — Electron shell, full FRAME schema + views, idempotent seed (categories, assignees, workflow templates), DB location picker UI, sidebar nav across 5 view shells, BUILD_STATE.md, FRAME_SCHEMA_CONTRACT.md v0 |

## Current Iteration
None active. Next: Iteration 1 — Task List Core (full CRUD for one-off tasks; categories, assignees, status, priority, due date, primary owner).

## Schema (Iteration 0)
13 tables: `categories`, `assignees`, `workflow_templates`, `workflow_template_steps`, `workflow_instances`, `tasks`, `workflow_instance_steps`, `workflow_notes`, `task_assignees`, `task_tags`, `monthly_commitments`, `task_snapshots`, `audit_log`.

3 views: `v_overdue_tasks`, `v_due_soon`, `v_workload`.

Indexes on tasks (status, due_date, category, workflow, parent), task_assignees, task_tags, audit_log.

Schema is governed by `docs/FRAME_SCHEMA_CONTRACT.md`.

## Seed Data
- 6 categories with muted Tailwind colours: Production Analysis, Production Processes, Report & Intelligence, Gate Reviews, Mandates, Admin
- 6 assignees: David, Wim, Athena, Cloud, Cathy, Alex
- 2 workflow templates: Gate Review (15 steps), Production Analysis (8 steps)

Seeding is idempotent — runs only on first DB open against empty tables.

## Known Issues / Backlog
- **End-to-end smoke test on Windows still required.** This Linux session can compile (vite build + tsc) but cannot run the Electron app. Woody should `git pull` on his Windows machine, run `npm install` (postinstall calls `electron-builder install-app-deps` to rebuild better-sqlite3), then `npm run dev` and confirm the first-run picker appears, choosing "Use default location" creates a populated frame.db.
- Robocopy sync to `Z:\OC working files\FRAME\` from the handoff is Windows-specific. On this Linux dev machine the source of truth is GitHub — every change is committed and pushed, Windows pulls.
- `package.json` build config still names some Windows packaging targets — untested until the first packaging run (Iteration 10 territory).
- Spec §12 lists iteration 9 twice (My Work + Settings) — minor doc inconsistency, parked for next spec rev.
- Light theme stretch goal (Iteration 10).

## Iteration 1 Pre-flight
Before starting Iteration 1:
1. Confirm Iteration 0 runs end-to-end on Windows (above).
2. Decide whether tasks IPC should mirror the same handler-per-action pattern (db:create-task, db:update-task) or a single db:tasks-mutate for batch.
3. Decide tag input UX — autocomplete from existing tags vs free-text only.
