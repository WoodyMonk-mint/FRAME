# FRAME — Build State

## Current Version
v0.5.0 (Iteration 4 — Recurring Tasks)

## Completed Iterations
| # | Name | Status |
|---|------|--------|
| 0 | Scaffold | Complete — Electron shell, full FRAME schema + views, idempotent seed (categories, assignees, workflow templates), DB location picker UI, sidebar nav across 5 view shells, BUILD_STATE.md, FRAME_SCHEMA_CONTRACT.md v0 |
| 1 | Task List Core | Complete — task IPC (list/create/update/soft-delete) with full audit_log writes per mutation, TaskListView with status-chip filter row and visible/total count, add/edit modal covering all iteration-1 fields, CODA-style soft-delete confirmation, status + priority pills, owner-auto-joins-team behaviour, ON_HOLD status added, neutral-grey palette shift |
| 2 | Subtasks + Tags + Filtering | Complete — task_tags read/write end to end with autocomplete TagInput; subtasks via parent_task_id with chevron-expandable rows and "+ Add subtask"; auto-computed parent % (DONE=100, CANCELLED excluded) with manual-override flag (new percent_manual column added by migration); full filter panel (Category / Priority / Owner / Due range / Tag) with active count and Clear; group-by None/Category/Status/Owner with collapsible headers; native-dialog CSV export of the current filtered+grouped view |
| 3 | Workflow Engine | Complete — workflow template + instance IPCs with eager step cloning per spec line 200; WorkflowsView (list ↔ detail mode) with create + edit dialog (template, gate, project ref, status, priority, owner, team, dates, tags); WorkflowDetailView with HTML5 drag-reorder, ⚠ deviation indicator, "+ Add step" for ad-hoc additions, soft-delete that cascades to step tasks, append-only workflow_notes activity feed (capped at 30vh). Task List integration: workflows render as collapsible parent rows with "Workflow" type badge and full priority/owner/team/tags. |
| 4 | Recurring Tasks | Complete — recurrence_template_id + sort_order columns added by migration; RecurringView (list ↔ detail), RecurrenceDialog (create + edit) with optional checklist of subtasks; complete-recurring-occurrence atomically marks current done and clones the next with rolled-forward dates and checklist. Adding to a template's checklist also propagates to every open occurrence. Checklist items drag-reorderable; subtasks in the Task List drag-reorderable via the same IPC. New Task List Type column (Task / Workflow / Recurring) replaces the inline 🔁 icon and Workflow badge. Click-a-parent-row-to-expand matches workflow behaviour. Right-click a workflow row → "Open workflow…" cross-view navigation. Dialogs no longer dismiss on backdrop click. |

## Current Iteration
None active. Next: Iteration 5 — Blockers + History (blocked_reason / blocked_by, task history panel from audit_log, dependency view).

## Schema (Iteration 0 + migrations)
14 tables: `categories`, `assignees`, `workflow_templates`, `workflow_template_steps`, `workflow_instances`, `workflow_instance_steps`, `workflow_instance_tags`, `workflow_instance_assignees`, `workflow_notes`, `tasks`, `task_assignees`, `task_tags`, `monthly_commitments`, `task_snapshots`, `audit_log`.

3 views: `v_overdue_tasks`, `v_due_soon`, `v_workload`.

Indexes on tasks (status, due_date, category, workflow, parent, recurrence_template), task_assignees, task_tags, audit_log, workflow_instance_tags, workflow_instance_assignees.

Schema is governed by `docs/FRAME_SCHEMA_CONTRACT.md`.

## Seed Data
- 6 categories with muted Tailwind colours: Production Analysis, Production Processes, Report & Intelligence, Gate Reviews, Mandates, Admin
- 6 assignees: David, Wim, Athena, Cloud, Cathy, Alex
- 2 workflow templates: Gate Review (15 steps), Production Analysis (8 steps)

Seeding is idempotent — runs only on first DB open against empty tables.

## Schema Migrations Applied
- `tasks.percent_manual INTEGER DEFAULT 0` (Iter 2)
- `workflow_instances.priority TEXT` (Iter 3 Pass 4)
- `workflow_instances.primary_owner TEXT` (Iter 3 Pass 4)
- `workflow_instances.is_deleted INTEGER DEFAULT 0` (Iter 3 close-out)
- `tasks.recurrence_template_id INTEGER REFERENCES tasks(id)` (Iter 4 Pass A)
- `tasks.sort_order INTEGER` (Iter 4 — generic per-parent ordering)

All migrations run via `runMigrations()` in `electron/main.cjs` — idempotent and safe to re-run.

## Smoke Test Status
- **Linux (X11):** ✅ Iter 0–2 user-validated 2026-04-30. Iter 3 + Iter 4 user-validated 2026-04-30 → 2026-05-01 over the rolling dev session (Workflows create/edit/reorder/notes/delete; Recurring create/edit/checklist/auto-create-next/DnD; cross-view "Open workflow" right-click; dialogs no longer dismiss on backdrop click).
- **Windows:** not yet verified end-to-end. Woody should `git pull`, `npm install` (postinstall calls `electron-builder install-app-deps` to rebuild better-sqlite3 against Electron's Node ABI), then `npm run dev` and confirm the same flow ends with the task list rendering.

## Known Issues / Backlog
- Top-level rows in the Task List: workflow synthetic rows always appear after task rows (no shared sort key). User has noted this is awkward; revisit when interleaving by createdAt or some shared key feels worth it.
- Add 2 — recurring workflows (recurrence_unit/interval/auto_create_next on workflow_instances + auto-create-next on completion) — designed but not built.
- Spec §12 lists iteration 9 twice (My Work + Settings) — minor doc inconsistency, parked for next spec rev.
- Robocopy sync to `Z:\OC working files\FRAME\` from the handoff is Windows-specific. On this Linux dev machine the source of truth is GitHub — every change is committed and pushed, Windows pulls.
- `package.json` build config still names Windows / Mac / Linux packaging targets — untested until the first packaging run (Iteration 10 territory).
- Light theme stretch goal (Iteration 10).

## Spec Deviations
- **Status enum** extended from 5 to 6 values: ON_HOLD added.
- **Owner ⊂ team:** primary_owner is implicitly a member of task_assignees / workflow_instance_assignees.
- **No template-store unification.** Workflow templates live in `workflow_templates` while recurrence templates live in `tasks` (with recurrence_unit set). Spec doesn't dictate either way; current design works for v1, possible refactor target for v0.5 → v1.
