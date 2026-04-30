# FRAME — Build State

## Current Version
v0.3.0 (Iteration 2 — Subtasks + Tags + Filtering)

## Completed Iterations
| # | Name | Status |
|---|------|--------|
| 0 | Scaffold | Complete — Electron shell, full FRAME schema + views, idempotent seed (categories, assignees, workflow templates), DB location picker UI, sidebar nav across 5 view shells, BUILD_STATE.md, FRAME_SCHEMA_CONTRACT.md v0 |
| 1 | Task List Core | Complete — task IPC (list/create/update/soft-delete) with full audit_log writes per mutation, TaskListView with status-chip filter row and visible/total count, add/edit modal covering all iteration-1 fields, CODA-style soft-delete confirmation, status + priority pills, owner-auto-joins-team behaviour, ON_HOLD status added, neutral-grey palette shift |
| 2 | Subtasks + Tags + Filtering | Complete — task_tags read/write end to end with autocomplete TagInput; subtasks via parent_task_id with chevron-expandable rows and "+ Add subtask"; auto-computed parent % (DONE=100, CANCELLED excluded) with manual-override flag (new percent_manual column added by migration); full filter panel (Category / Priority / Owner / Due range / Tag) with active count and Clear; group-by None/Category/Status/Owner with collapsible headers; native-dialog CSV export of the current filtered+grouped view |

## Current Iteration
None active. Next: Iteration 3 — Workflow Engine (templates → instances with step cloning, deviation tracking, workflow_notes feed).

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

## Smoke Test Status
- **Linux (X11):** ✅ Iteration 0 verified 2026-04-30 (DB picker, schema, seed, all view shells). Iteration 1 user-validated 2026-04-30 (Task List view renders, filter chips work, add/edit/delete modal flows look right under the new palette). Iteration 2 dev-server passes — schema migration (`percent_manual` column added) ran on first launch without data loss; user-validation outstanding for end-to-end subtask/tag/filter/grouping/export flows.
- **Windows:** not yet verified. Woody should `git pull`, `npm install` (postinstall calls `electron-builder install-app-deps` to rebuild better-sqlite3 against Electron's Node ABI), then `npm run dev` and confirm the same flow ends with the task list rendering.

## Known Issues / Backlog
- Robocopy sync to `Z:\OC working files\FRAME\` from the handoff is Windows-specific. On this Linux dev machine the source of truth is GitHub — every change is committed and pushed, Windows pulls.
- `package.json` build config still names Windows / Mac / Linux packaging targets — untested until the first packaging run (Iteration 10 territory).
- Spec §12 lists iteration 9 twice (My Work + Settings) — minor doc inconsistency, parked for next spec rev.
- Light theme stretch goal (Iteration 10).

## Spec Deviations
- **Status enum** extended from 5 to 6 values: ON_HOLD added. Distinct from BLOCKED — BLOCKED means waiting on something external, ON_HOLD means we've chosen to pause. SPEC.md §2.3 and FRAME_SCHEMA_CONTRACT.md §5.4 updated.
- **Owner ⊂ team:** primary_owner is implicitly a member of task_assignees. The modal auto-toggles the owner's chip and seeds the join for existing tasks. Means v_workload (which queries task_assignees) covers owners by default.

## Iteration 3 Pre-flight
Before starting Iteration 3 (Workflow Engine):
1. Decide workflow instance entry point — top-level "Workflows" view, or a new task type that opens a workflow detail panel?
2. Decide step task creation — clone all template steps as task rows on instance creation, or lazy-create when first edited?
3. Decide deviation UX — inline edit on the step list, or a separate "Edit step" modal that asks for the deviation reason?
4. Decide workflow_notes UI — inline feed under the step list, or a side panel?

## Schema Migrations Applied
- `percent_manual INTEGER DEFAULT 0` added to `tasks` (Iteration 2). The migration runs once on first launch via `runMigrations()` in `electron/main.cjs` — idempotent and safe to re-run.
