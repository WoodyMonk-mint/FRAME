# FRAME — Schema Contract v0

> Contract for direct DB access by agents (Monk and others).
> Read freely; write only inside the rules below.
> Authoritative copy lives in this repo. The DB file is the implementation of this contract.

---

## 1. Scope

FRAME stores all data in a single SQLite file (`frame.db`). The renderer reaches it via Electron IPC; agents reach it directly via the file. Both must respect this contract.

The schema is created and seeded by `electron/main.cjs::runSchema()` and `seedDatabase()`. Idempotent — safe to re-run.

---

## 2. Tables

### Taxonomy (UI-managed only)
- `categories` — predefined picklist; archived not deleted.
- `assignees` — team members; archived not deleted.
- `workflow_templates` + `workflow_template_steps` — workflow blueprints.

### Operational
- `tasks` — every one-off, repeating, and workflow-step task.
- `task_assignees` — multi-assignee join (separate from `tasks.primary_owner`).
- `task_tags` — free-text multi-tag.
- `workflow_instances` + `workflow_instance_steps` — live workflow runs (steps cloned from template at create time).
- `workflow_notes` — append-only activity feed per instance.
- `monthly_commitments` — start-of-month commitments per task per month.
- `task_snapshots` — periodic snapshots powering trend charts.
- `audit_log` — change log.

Full DDL: `electron/main.cjs::runSchema()`. Spec authority: `docs/SPEC.md` §3.1.

---

## 3. Views

| View | Purpose |
|------|---------|
| `v_overdue_tasks` | Open tasks past due. Includes `category_name`. Use this in briefings. |
| `v_due_soon`      | Open tasks due today or tomorrow. Includes `category_name`. |
| `v_workload`      | Open task count grouped by assignee. |

Joins ignore deleted tasks (`is_deleted = 0`) and finished work (`status NOT IN ('DONE','CANCELLED')`). Tasks with NULL `due_date` are excluded from the date views.

---

## 4. Read access — unrestricted

Agents may run any `SELECT` against any table or view. Prefer the views above when their semantics match — they are the single source of truth for "overdue" / "due soon" / "workload".

For ad-hoc reads, key indexes already exist on `tasks(status, due_date, category_id, workflow_instance_id, parent_task_id)`, `task_assignees(task_id)`, `task_tags(task_id)`, `audit_log(table_name, row_id)`.

---

## 5. Write access — rules

### 5.1 Always
- Set `audit_log.changed_by` to your agent identifier (e.g. `"Monk"`).
- For `INSERT` and `UPDATE` on `tasks`, write `audit_log` rows in the same transaction with `old_values` (UPDATE only) and `new_values` as JSON.
- Update `tasks.updated_at = datetime('now')` on every UPDATE.

### 5.2 Never
- **Never hard-delete.** Set `is_deleted = 1` on `tasks`. For taxonomy use `is_archived = 1`.
- **Never modify taxonomy directly.** `categories`, `assignees`, `workflow_templates`, `workflow_template_steps` are UI-only. Renames/archives flow through the Settings UI so unlock-to-edit, audit, and confirmation are enforced.
- **Never drop or alter tables, indexes, or views.** Schema changes go through `runSchema()` in a code release.
- **Never modify another agent's `audit_log` rows.** Append-only.

### 5.3 Append-only tables
- `workflow_notes` — agents may insert. `author` must be set.
- `audit_log` — every write goes here; never updated or deleted.
- `task_snapshots` — agents may insert when taking on-demand snapshots; never updated.

### 5.4 Status transitions
Allowed `tasks.status` values: `PLANNING`, `WIP`, `BLOCKED`, `ON_HOLD`, `DONE`, `CANCELLED`. When moving to `BLOCKED`, set `blocked_reason`. When moving to `DONE`, set `completed_date = date('now')`.

### 5.5 Repeating tasks
Setting a repeating task to `DONE` does **not** auto-create the next occurrence — the renderer handles that with a confirmation dialogue. Agents that want to advance a repeating task should insert the next task as a normal `INSERT` with `recurrence_*` fields copied and `next_due_date` cleared on the parent.

### 5.6 Workflow instances
Step ordering and deviations live on `workflow_instance_steps`, not on the template. Modifying template steps does not affect existing instances. To record a deviation, set `is_deviation = 1` and populate `deviation_reason`.

---

## 6. Historical seeding (Monk)

Historical task data from `Z:\PPM data\Team\Task list\` Excel files is injected via direct DB write after Iteration 0 lands. Process:
1. Open `frame.db` with the schema at the version recorded in `BUILD_STATE.md`.
2. Within a single transaction:
   - Insert tasks. Use `created_at` from the original record where known; otherwise `datetime('now')`.
   - Insert `task_assignees` and `task_tags` rows.
   - For finished tasks, set `status = 'DONE'` and `completed_date`.
3. Write a single `audit_log` row per inserted task with `changed_by = 'Monk:historical-seed'`.

Do not touch taxonomy from a seed script — assignees and categories are seeded by the app on first launch and any new ones must be added via Settings.

---

## 7. Versioning

This contract is versioned alongside the schema. The current version is **v0** matching Iteration 0. Future schema changes:

| Schema change | Contract change |
|---------------|-----------------|
| New column on existing table | Patch — append-only docs |
| New table or view | Minor — note in contract |
| Renamed column or breaking constraint | Major — agents must update before next read/write |

The schema version is implicit in `BUILD_STATE.md` for now. A `schema_version` table will be added when the first migration lands (likely Iteration 5+).

---

*Schema Contract v0 — 2026-04-30. Tracks `docs/SPEC.md` §3 and §8.*
