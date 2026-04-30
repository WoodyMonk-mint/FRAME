# FRAME — Specification v0.3

> **Focus, Resource and Activity Management Engine**
> Task tracking and workflow management tool for IEGG Production Management.
> Built on the same stack and visual language as PRISM.

---

## 1. Overview

FRAME replaces the current Excel task list with a structured, queryable, team-facing tool. It supports three distinct task types, workflow templates for repeatable processes (like gate reviews), team assignment, progress tracking, and analytical views.

All data lives in SQLite. All agents and tools can read/write it via the DB file directly (with schema governance enforced at the application layer and a published schema contract for agent access).

Historical task data will be seeded via direct DB injection by Monk (not an in-app import UI).

---

## 2. Core Concepts

### 2.1 Task Types

| Type | Description | Examples |
|------|-------------|---------|
| **One-off** | Discrete tasks with a clear end state | "Finalise HC limits doc", "Set up mandate repository" |
| **Repeating** | Periodic tasks that recur on a schedule | "Risk register update (monthly)", "Slate review pass (quarterly)" |
| **Workflow** | Tasks that are instances of a repeatable workflow template | Gate reviews, production analyses, mandate support |

Workflow tasks are the most structured. A workflow template defines a standard sequence of steps. Each active workflow instance is a live copy of that template with its own dates, assignees, statuses, and optional deviations from the standard process.

### 2.2 Task Hierarchy

```
Category (predefined picklist — managed in Settings)
  Task / Feature
    Subtask
```

- Categories are managed in Settings with unlock-to-edit protection (see Section 7)
- Tasks and subtasks are user-created
- Workflow templates predefine the step structure; instances can deviate (with override reason recorded)

### 2.3 Status Values

| Status | Meaning |
|--------|---------|
| PLANNING | Not yet started |
| WIP | In progress |
| BLOCKED | Stalled — blocker recorded separately |
| ON_HOLD | Deliberately paused — not actively waiting on a blocker |
| DONE | Complete |
| CANCELLED | No longer needed |

`BLOCKED` and `ON_HOLD` differ in intent: BLOCKED means we're waiting on something external (`blocked_reason` records what); ON_HOLD means we've chosen to pause it.

### 2.4 Priority

P0 / P1 / P2 / P3 — user-assigned. Surfaced in all views and dashboard.

### 2.5 Tags

Free-text, multi-value tags per task. Allows cross-category slicing (e.g. tag all 070-related tasks with "070" regardless of category). Managed ad-hoc — no predefined list required.

---

## 3. Data Model

### 3.1 Core Tables

#### `categories`
```sql
id          INTEGER PRIMARY KEY
name        TEXT NOT NULL UNIQUE
sort_order  INTEGER
colour      TEXT        -- hex, for visual grouping
is_archived INTEGER DEFAULT 0  -- soft delete; existing tasks preserve reference
```

Predefined values (matching current task list structure):
- Production Analysis
- Production Processes
- Report & Intelligence
- Gate Reviews
- Mandates
- Admin

#### `assignees`
```sql
id          INTEGER PRIMARY KEY
name        TEXT NOT NULL UNIQUE
is_active   INTEGER DEFAULT 1  -- archived, not deleted; existing tasks preserve reference
sort_order  INTEGER
```

Managed in Settings with unlock-to-edit protection. Never hard-deleted — archiving preserves all existing task references (same immutable-record pattern as PRISM taxonomy).

#### `tasks`
```sql
id                   INTEGER PRIMARY KEY
type                 TEXT NOT NULL        -- 'one-off' | 'repeating' | 'workflow'
category_id          INTEGER REFERENCES categories(id)
workflow_instance_id INTEGER REFERENCES workflow_instances(id) NULL
parent_task_id       INTEGER REFERENCES tasks(id) NULL   -- for subtasks
title                TEXT NOT NULL
description          TEXT
status               TEXT NOT NULL DEFAULT 'PLANNING'
priority             TEXT                 -- P0|P1|P2|P3
primary_owner        TEXT REFERENCES assignees(name)  -- single accountable person
due_date             TEXT                 -- ISO date YYYY-MM-DD
completed_date       TEXT
percent_complete     INTEGER DEFAULT 0    -- 0-100; auto-calculated when subtasks exist, manual otherwise
recurrence_type      TEXT                 -- 'interval'|'day-of-month'|'day-of-week' (repeating tasks only)
recurrence_interval  INTEGER              -- every N days/weeks/months
recurrence_unit      TEXT                 -- 'days'|'weeks'|'months'
recurrence_anchor    TEXT                 -- 'fixed'|'completion' (fixed date vs completion-relative)
next_due_date        TEXT                 -- computed next occurrence (repeating tasks)
auto_create_next     INTEGER DEFAULT 1    -- if 1, auto-create next instance on completion (with confirmation dialogue)
blocked_reason       TEXT                 -- why it's blocked (populated when status=BLOCKED)
blocked_by_task_id   INTEGER REFERENCES tasks(id) NULL  -- optional dependency link
notes                TEXT
created_at           TEXT NOT NULL DEFAULT (datetime('now'))
updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
is_deleted           INTEGER DEFAULT 0    -- soft delete
```

**% complete rules:**
- Task has subtasks: auto-calculated as (completed subtasks / total subtasks * 100). Manual override allowed with a visible "override" indicator.
- Task has no subtasks: manual entry (0-100 slider).

**Repeating task auto-create:**
- On marking a repeating task DONE, a confirmation dialogue appears: "Create next occurrence? Due [computed date]." Ticked by default. User can adjust date or cancel.

#### `task_assignees`
```sql
id       INTEGER PRIMARY KEY
task_id  INTEGER REFERENCES tasks(id)
name     TEXT REFERENCES assignees(name)
```

Multiple assignees per task (all involved). Separate from `primary_owner` (single accountable person).

#### `task_tags`
```sql
id      INTEGER PRIMARY KEY
task_id INTEGER REFERENCES tasks(id)
tag     TEXT NOT NULL
```

#### `workflow_templates`
```sql
id           INTEGER PRIMARY KEY
name         TEXT NOT NULL UNIQUE   -- e.g. "Gate Review"
gate_type    TEXT                   -- 'Concept'|'VS'|'EFP'|'FP'|NULL (for gate reviews)
description  TEXT
category_id  INTEGER REFERENCES categories(id)
is_archived  INTEGER DEFAULT 0
created_at   TEXT
```

One template per workflow type. Gate reviews use a single "Gate Review" template with a `gate_type` field on the instance.

#### `workflow_template_steps`
```sql
id               INTEGER PRIMARY KEY
template_id      INTEGER REFERENCES workflow_templates(id)
step_number      INTEGER NOT NULL
title            TEXT NOT NULL
description      TEXT
default_owner    TEXT               -- optional default primary owner
offset_days      INTEGER            -- days after instance start date (scheduling aid)
is_optional      INTEGER DEFAULT 0
```

#### `workflow_instances`
```sql
id           INTEGER PRIMARY KEY
template_id  INTEGER REFERENCES workflow_templates(id)
name         TEXT NOT NULL          -- e.g. "070 VS Gate Review"
gate_type    TEXT                   -- populated for gate review instances
project_ref  TEXT                   -- free text project name/code
start_date   TEXT
target_date  TEXT
status       TEXT DEFAULT 'WIP'
notes        TEXT                   -- append-only activity feed (see Section 3.2)
created_at   TEXT
updated_at   TEXT
```

#### `workflow_instance_steps`
```sql
id                  INTEGER PRIMARY KEY
instance_id         INTEGER REFERENCES workflow_instances(id)
template_step_id    INTEGER REFERENCES workflow_template_steps(id) NULL  -- NULL if step was added ad-hoc
task_id             INTEGER REFERENCES tasks(id)   -- the actual task record
step_number         INTEGER NOT NULL               -- may differ from template if steps added/removed
is_deviation        INTEGER DEFAULT 0              -- 1 if this step differs from template
deviation_reason    TEXT                           -- why it deviated
```

Template steps are cloned into instance steps at creation. Steps can be added, removed, or reordered on the instance — deviations recorded with reason. If the template is updated later, existing instances are unaffected.

#### `workflow_notes`
```sql
id          INTEGER PRIMARY KEY
instance_id INTEGER REFERENCES workflow_instances(id)
note        TEXT NOT NULL
author      TEXT           -- assignee name or 'Monk' for agent entries
created_at  TEXT NOT NULL DEFAULT (datetime('now'))
```

Append-only activity feed on workflow instances. Records decisions, links, context, status updates during a live review.

#### `monthly_commitments`
```sql
id           INTEGER PRIMARY KEY
task_id      INTEGER REFERENCES tasks(id)
month        TEXT NOT NULL     -- YYYY-MM
committed    INTEGER DEFAULT 0
committed_at TEXT
notes        TEXT
```

#### `task_snapshots`
```sql
id           INTEGER PRIMARY KEY
snapshot_date TEXT NOT NULL    -- YYYY-MM-DD (taken at month end / on demand)
task_id      INTEGER REFERENCES tasks(id)
status       TEXT
percent_complete INTEGER
due_date     TEXT
primary_owner TEXT
```

Periodic snapshots to power trend charts on the dashboard (overdue count over time, completion rate by month). Snapshot taken automatically on the 1st of each month + on demand from Settings.

#### `audit_log`
```sql
id          INTEGER PRIMARY KEY
table_name  TEXT NOT NULL
row_id      INTEGER NOT NULL
action      TEXT NOT NULL      -- INSERT|UPDATE|DELETE
changed_by  TEXT               -- 'user' or agent identifier e.g. 'Monk'
changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
old_values  TEXT               -- JSON snapshot
new_values  TEXT               -- JSON snapshot
```

### 3.2 DB Views (for agent/query access)

```sql
-- Overdue tasks (used by Monk for briefings)
CREATE VIEW v_overdue_tasks AS
  SELECT t.*, c.name as category_name
  FROM tasks t
  JOIN categories c ON t.category_id = c.id
  WHERE t.status NOT IN ('DONE','CANCELLED')
    AND t.is_deleted = 0
    AND t.due_date < date('now');

-- Due today or tomorrow
CREATE VIEW v_due_soon AS
  SELECT t.*, c.name as category_name
  FROM tasks t
  JOIN categories c ON t.category_id = c.id
  WHERE t.status NOT IN ('DONE','CANCELLED')
    AND t.is_deleted = 0
    AND t.due_date BETWEEN date('now') AND date('now','+1 day');

-- Open tasks by assignee (workload view)
CREATE VIEW v_workload AS
  SELECT a.name as assignee, COUNT(*) as open_tasks
  FROM task_assignees a
  JOIN tasks t ON a.task_id = t.id
  WHERE t.status NOT IN ('DONE','CANCELLED') AND t.is_deleted = 0
  GROUP BY a.name;
```

---

## 4. Views

### 4.1 Task List

Default view. Sortable, filterable table.

**Columns:** Category | Title | Type | Status | Priority | Due Date | Owner | Assignees | % Complete | Tags | Overdue flag

**Filters:**
- Category (multi-select)
- Status (multi-select)
- Assignee / Owner
- Task type
- Due date range
- Priority
- Tag
- Show/hide completed and cancelled

**Actions:**
- Add task (modal)
- Edit task (modal)
- Mark complete
- Soft delete (CODA confirmation)
- Expand row to show subtasks
- Export current view as CSV

**Grouping:** By category, status, assignee, workflow instance

### 4.2 Monthly Planning Mode

Accessible from Task List. A dedicated mode for start-of-month commitment planning.

- Filtered to open/overdue tasks only
- Checkbox per task: "Commit for [Month]"
- Batch commit button: "Commit selected for [Month]"
- Shows previous month's hit rate as context ("Last month: 9/12 committed tasks completed — 75%")

### 4.3 Dashboard / Analytics

**Summary cards:**
- Total open tasks
- Overdue count
- Due this week
- % complete (all tasks, current month)
- Monthly commitment hit rate (last 3 months rolling)
- Blocked tasks count (with quick-view of blockers)

**Charts:**
- Tasks by status (donut)
- Tasks by category (bar)
- Overdue count over time (line — from task_snapshots)
- Completion rate by month (bar — from monthly_commitments)
- Assignee workload (horizontal bar — open tasks per person, split by primary_owner vs contributor)
- Workflow instance progress (grouped bar per active workflow)

**Filters:** Same as Task List. Dashboard responds to filter state.

**Export:** Current chart's underlying data as CSV.

### 4.4 My Work

A personal view — shows only tasks where the active user is either `primary_owner` or in `task_assignees`. Designed for individuals to manage and track their own workload without the noise of the full team list.

**Summary cards (top row):**
- My open tasks
- My overdue tasks
- My tasks due this week
- My % complete this month
- My commitment hit rate (last 3 months)

**Task table:** Same columns as Task List but pre-filtered to the current user. All filters still available for further slicing.

**Charts:**
- My tasks by status (donut)
- My tasks by category (bar)
- My workload over time — tasks due per week/month (line)
- My completion rate by month

**Active user:** Set in Settings — a simple "Who am I?" picker from the assignees list. Persisted in local config (not the DB). Each team member sets this once on their machine.

**Export:** Current view as CSV.

### 4.5 Calendar

Month/week view.

- Tasks with due dates shown as blocks, colour-coded by category
- Click to open edit modal
- Overdue tasks in red
- Workflow instances shown as spans (start to target date)
- Toggle: show subtasks / top-level only

### 4.6 Settings

**Taxonomy (all with unlock-to-edit protection):**
- Categories — add, rename, reorder, set colour; archive (not delete) if tasks exist
- Assignees — add, rename, archive; existing task references preserved on rename/archive
- Workflow Templates — create, edit, archive; manage step sequences
- Tags — view all tags in use; merge/rename tags

**System:**
- DB path — show, change location
- Snapshot — take manual snapshot now
- Export full DB as CSV
- View audit log (last 100 entries, filterable)

**Unlock-to-edit pattern (same as PRISM):** Taxonomy sections show a lock icon. User must explicitly click "Unlock to edit" before changes are permitted. Re-locks on navigation away or after save.

---

## 5. Workflow Templates (Initial Set)

### Gate Review (Concept / VS / EFP / FP)
Single template, gate type set on instance.

| # | Step | Default Owner | Optional |
|---|------|--------------|---------|
| 1 | GR Kickoff | Alex | No |
| 2 | Receive request, confirm assessment goals | David | No |
| 3 | Review deliverables, check missing with Pteam | David | No |
| 4 | Build Kick-Off Meeting & GR Deliverables | Alex | No |
| 5 | Pteam Presentation | Alex | No |
| 6 | Support Pteam: Mandate draft for central team review | David, Athena | No |
| 7 | Discuss within PPM | David | No |
| 8 | Discuss with central teams (GRC, BOS, Finance) | David | Yes |
| 9 | Q&A with Pteam | Alex | No |
| 10 | Prep PM feedback, sync with central teams | David | No |
| 11 | Consolidate PM feedback and share with Yongyi | Wim, David | No |
| 12 | Deliver assessment to GR team | David | No |
| 13 | Feedback meeting with assessment teams | David | No |
| 14 | GR Decision meeting | Alex | No |
| 15 | Support Pteam: finalised Mandate for GR approval | David, Athena | No |

### Production Analysis

| # | Step | Default Owner | Optional |
|---|------|--------------|---------|
| 1 | Receive request / initiate | David | No |
| 2 | Assign PoC | David | No |
| 3 | Review available materials | PoC | No |
| 4 | Playtest / build review | PoC | Yes |
| 5 | Internal PPM discussion | David | No |
| 6 | Draft assessment | PoC | No |
| 7 | Feedback meeting with studio | David | No |
| 8 | Finalise and deliver assessment | PoC | No |

---

## 6. Monthly Commitment Model

At the start of each month, tasks are committed via the Monthly Planning Mode. At month end, completion rate is calculated from `monthly_commitments` joined with `tasks.completed_date`.

Dashboard shows rolling 3-month commitment hit rate. This enables lightweight sprint-style accountability without heavy process overhead.

---

## 7. Settings Governance (Unlock-to-Edit)

All taxonomy tables (categories, assignees, workflow templates) are protected by an unlock-to-edit mechanism:

- Default state: read-only, lock icon visible
- User clicks "Unlock to edit": section becomes editable, lock icon open
- Re-locks automatically on: navigation away, after save, after 5 minutes idle

Rename/archive operations on assignees and categories never hard-delete. Existing task references are preserved. New tasks see the updated name. The DB retains both the old and new name via the soft-archive pattern.

---

## 8. Agent Access

Monk and other agents access the DB directly via the SQLite file (same pattern as PRISM).

**Read:** Unrestricted. Use the `v_overdue_tasks`, `v_due_soon`, `v_workload` views for standard queries.

**Write:** Must follow the schema contract defined in `FRAME_SCHEMA_CONTRACT.md` (to be written before agent write access is enabled). Key rules:
- Always set `changed_by` to agent identifier in audit_log
- Never hard-delete (set `is_deleted = 1`)
- Never modify taxonomy tables directly (assignees, categories) — these are UI-only
- Workflow note additions via `workflow_notes` table are permitted (append-only)

**Historical data seeding:** Monk will inject historical task data from the Excel task list files directly into the DB after Iteration 0 is complete.

---

## 9. Export

- **Full export:** All tasks + subtasks + assignees as flat CSV (from Settings)
- **View export:** Current filtered Task List view as CSV
- **Dashboard export:** Underlying data for any chart as CSV
- **Workflow export:** All tasks for a given workflow instance as CSV

CSV columns (full export): id, type, category, workflow_instance, parent_task, title, status, priority, primary_owner, assignees, due_date, completed_date, percent_complete, tags, blocked_reason, notes, created_at

---

## 10. Visual Style

Match PRISM exactly:
- Dark theme default (light mode: stretch goal)
- Same sidebar navigation, colour palette, typography, button styles
- Framer Motion transitions on view changes
- Recharts for all charts
- Tailwind throughout

---

## 11. Out of Scope (v1)

- Multi-user / real-time sync
- Mobile / web version
- Push notifications (Monk handles reminders via briefings)
- Direct integration with TAPD, Outlook, etc.
- Time tracking

---

## 12. Iteration Plan

| # | Name | Scope |
|---|------|-------|
| 0 | Scaffold | Project setup, Electron shell, SQLite init + full schema + views, sidebar nav, empty views, DB location picker |
| 1 | Task List Core | Full CRUD for one-off tasks, categories, assignees, status, priority, due date, primary owner |
| 2 | Subtasks + Tags + Filtering | Subtask hierarchy, tags, all filters, grouping, CSV export, % complete auto-calc |
| 3 | Workflow Engine | Templates, instances, step cloning, deviation tracking, workflow_notes feed |
| 4 | Repeating Tasks | Recurrence rules, next-due logic, auto-create dialogue on completion |
| 5 | Blockers + History | blocked_reason/blocked_by, task history panel (audit log), dependency view |
| 6 | Dashboard | All summary cards, charts, snapshot system |
| 7 | Calendar View | Month/week calendar with task blocks and workflow spans |
| 8 | Monthly Commitments | Planning mode, commitment toggle, hit rate dashboard integration |
| 9 | My Work View | Personal task view, active user picker in Settings, personal summary cards and charts |
| 9 | Settings | Full taxonomy management (unlock-to-edit), DB tools, audit log viewer |
| 10 | Polish & Stability | Edge cases, light mode, keyboard shortcuts, performance |

---

## 13. Open Questions

None remaining — all resolved in spec review session 2026-04-30.

---

*Spec v0.2 — 2026-04-30. Updated with review feedback: flexible workflow deviation model, immutable taxonomy pattern, tag system, monthly planning mode, blocker fields, history panel, team owner/contributor split, recurrence model detail, snapshot system for trend charts, DB views for agent access. Historical data import via agent injection (not in-app UI).*
