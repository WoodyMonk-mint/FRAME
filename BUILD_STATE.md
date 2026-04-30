# FRAME — Build State

## Current Version
v0.2.0 (Iteration 1 — Task List Core)

## Completed Iterations
| # | Name | Status |
|---|------|--------|
| 0 | Scaffold | Complete — Electron shell, full FRAME schema + views, idempotent seed (categories, assignees, workflow templates), DB location picker UI, sidebar nav across 5 view shells, BUILD_STATE.md, FRAME_SCHEMA_CONTRACT.md v0 |
| 1 | Task List Core | Complete — task IPC (list/create/update/soft-delete) with full audit_log writes per mutation, TaskListView with status-chip filter row and visible/total count, add/edit modal covering all iteration-1 fields, CODA-style soft-delete confirmation, status + priority pills, owner-auto-joins-team behaviour, ON_HOLD status added, neutral-grey palette shift |

## Current Iteration
None active. Next: Iteration 2 — Subtasks + Tags + Filtering (subtask hierarchy with auto-calc % complete, tags, full filter set, grouping, CSV export).

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
- **Linux (X11):** ✅ Iteration 0 verified 2026-04-30 (DB picker, schema, seed, all view shells). Iteration 1 user-validated 2026-04-30 (Task List view renders, filter chips work, add/edit/delete modal flows look right under the new palette).
- **Windows:** not yet verified. Woody should `git pull`, `npm install` (postinstall calls `electron-builder install-app-deps` to rebuild better-sqlite3 against Electron's Node ABI), then `npm run dev` and confirm the same flow ends with the task list rendering.

## Known Issues / Backlog
- Robocopy sync to `Z:\OC working files\FRAME\` from the handoff is Windows-specific. On this Linux dev machine the source of truth is GitHub — every change is committed and pushed, Windows pulls.
- `package.json` build config still names Windows / Mac / Linux packaging targets — untested until the first packaging run (Iteration 10 territory).
- Spec §12 lists iteration 9 twice (My Work + Settings) — minor doc inconsistency, parked for next spec rev.
- Light theme stretch goal (Iteration 10).

## Spec Deviations
- **Status enum** extended from 5 to 6 values: ON_HOLD added. Distinct from BLOCKED — BLOCKED means waiting on something external, ON_HOLD means we've chosen to pause. SPEC.md §2.3 and FRAME_SCHEMA_CONTRACT.md §5.4 updated.
- **Owner ⊂ team:** primary_owner is implicitly a member of task_assignees. The modal auto-toggles the owner's chip and seeds the join for existing tasks. Means v_workload (which queries task_assignees) covers owners by default.

## Iteration 2 Pre-flight
Before starting Iteration 2 (Subtasks + Tags + Filtering):
1. Decide tag input UX — free-text only, or autocomplete from existing tags? (recommend autocomplete + free-text fallback)
2. Decide subtask UX — inline expander on parent row, or open parent in a side-panel showing subtasks? (recommend inline expander)
3. Decide CSV export scope — current filtered view, or all tasks? (spec §9 says current filtered view)
