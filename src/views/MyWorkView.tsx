import { useEffect, useMemo, useState } from 'react'
import type {
  Assignee, Category, Task, TaskInput, WorkflowInstance,
} from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MarkDoneDialog } from '../components/MarkDoneDialog'
import { TaskModal } from '../components/TaskModal'
import {
  AssigneePile, PriorityPill, StatusPill, TagCellPile,
} from '../components/Pills'
import { endOfWorkWeekIso, formatDate, isOverdue, todayIso } from '../lib/date'

const ACTIVE_USER_KEY = 'frame.activeUser'

type Props = {
  onJumpToSettings?: () => void
  onOpenWorkflow?:   (id: number) => void
}

type BucketKey = 'overdue' | 'today' | 'this-week' | 'later' | 'no-date'

const BUCKET_META: Record<BucketKey, { label: string; subtitle: string }> = {
  'overdue':   { label: 'Overdue',     subtitle: 'past due, still open' },
  'today':     { label: 'Today',       subtitle: 'due today' },
  'this-week': { label: 'This week',   subtitle: 'through Friday' },
  'later':     { label: 'Later',       subtitle: 'next week and beyond' },
  'no-date':   { label: 'No due date', subtitle: 'no deadline set' },
}

const BUCKET_ORDER: BucketKey[] = ['overdue', 'today', 'this-week', 'later', 'no-date']

type MyRow =
  | { kind: 'task';     task: Task }
  | { kind: 'workflow'; instance: WorkflowInstance }

function bucketByDate(dueDate: string | null, status: string): BucketKey {
  if (!dueDate)                                          return 'no-date'
  if (isOverdue(dueDate, status as never))               return 'overdue'
  const today = todayIso()
  if (dueDate === today)                                  return 'today'
  if (dueDate <= endOfWorkWeekIso())                      return 'this-week'
  return 'later'
}

function bucketForRow(r: MyRow): BucketKey {
  return r.kind === 'task'
    ? bucketByDate(r.task.dueDate, r.task.status)
    : bucketByDate(r.instance.targetDate, r.instance.status)
}

const PRIORITY_ORDER = ['P0', 'P1', 'P2', 'P3', null] as const
function priorityIndex(p: string | null): number {
  const i = (PRIORITY_ORDER as readonly (string | null)[]).indexOf(p)
  return i < 0 ? PRIORITY_ORDER.length : i
}

export function MyWorkView({ onJumpToSettings, onOpenWorkflow }: Props = {}) {
  const [activeUser, setActiveUser] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_USER_KEY) || null
  )

  const [tasks, setTasks]           = useState<Task[]>([])
  const [workflows, setWorkflows]   = useState<WorkflowInstance[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [assignees, setAssignees]   = useState<Assignee[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  const [editing, setEditing]             = useState<Task | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null)
  const [confirmDone, setConfirmDone]     = useState<Task | null>(null)

  const reload = async () => {
    setError(null)
    try {
      const [t, w, c, a, tg] = await Promise.all([
        window.frame.db.listTasks(),
        window.frame.db.listWorkflowInstances(),
        window.frame.db.listCategories(),
        window.frame.db.listAssignees(),
        window.frame.db.listTags(),
      ])
      setTasks(t)
      setWorkflows(w)
      setCategories(c)
      setAssignees(a)
      setTagSuggestions(tg)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

  // Re-read the localStorage value whenever the user navigates here so a
  // change in Settings → General surfaces immediately.
  useEffect(() => {
    const onFocus = () => setActiveUser(localStorage.getItem(ACTIVE_USER_KEY) || null)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const myRows = useMemo<MyRow[]>(() => {
    if (!activeUser) return []
    const rows: MyRow[] = []
    for (const t of tasks) {
      if (t.recurrenceUnit !== null && t.recurrenceTemplateId === null) continue   // recurrence template
      if (t.status === 'DONE' || t.status === 'CANCELLED')               continue
      if (t.primaryOwner === activeUser || t.assignees.includes(activeUser)) {
        rows.push({ kind: 'task', task: t })
      }
    }
    for (const w of workflows) {
      if (w.status === 'DONE' || w.status === 'CANCELLED') continue
      if (w.primaryOwner === activeUser || w.assignees.includes(activeUser)) {
        rows.push({ kind: 'workflow', instance: w })
      }
    }
    return rows
  }, [tasks, workflows, activeUser])

  const buckets = useMemo(() => {
    const m: Record<BucketKey, MyRow[]> = {
      'overdue': [], 'today': [], 'this-week': [], 'later': [], 'no-date': [],
    }
    for (const r of myRows) m[bucketForRow(r)].push(r)
    const priorityOf = (r: MyRow) => r.kind === 'task' ? r.task.priority : r.instance.priority
    const dueOf      = (r: MyRow) => r.kind === 'task' ? r.task.dueDate  : r.instance.targetDate
    for (const k of BUCKET_ORDER) {
      m[k].sort((a, b) => {
        const p = priorityIndex(priorityOf(a)) - priorityIndex(priorityOf(b))
        if (p !== 0) return p
        return (dueOf(a) ?? '9999-99-99').localeCompare(dueOf(b) ?? '9999-99-99')
      })
    }
    return m
  }, [myRows])

  // Lookup helpers for parent context shown next to subtasks / workflow steps.
  const tasksById     = useMemo(() => new Map(tasks.map(t => [t.id, t])),         [tasks])
  const workflowsById = useMemo(() => new Map(workflows.map(w => [w.id, w])),     [workflows])
  const categoryById  = useMemo(() => new Map(categories.map(c => [c.id, c])),    [categories])

  const parentLabelFor = (t: Task): string | null => {
    if (t.workflowInstanceId != null) {
      const w = workflowsById.get(t.workflowInstanceId)
      if (!w) return null
      return [
        w.name,
        w.gateType   ? `(${w.gateType})`  : null,
        w.projectRef ? `· ${w.projectRef}` : null,
      ].filter(Boolean).join(' ')
    }
    if (t.parentTaskId != null) return tasksById.get(t.parentTaskId)?.title ?? null
    return null
  }

  const typeBadgeFor = (t: Task): { label: string; cls: string } => {
    if (t.workflowInstanceId   != null) return { label: 'Step',      cls: 'type-badge-workflow' }
    if (t.parentTaskId         != null) return { label: 'Subtask',   cls: 'type-badge-task' }
    if (t.recurrenceTemplateId != null) return { label: 'Recurring', cls: 'type-badge-recurring' }
    if (t.type === 'feature')           return { label: 'Feature',   cls: 'type-badge-feature' }
    return { label: 'Task', cls: 'type-badge-task' }
  }

  // ─── Mutations ───────────────────────────────────────────────────────────

  const saveEdited = async (input: TaskInput, opts: { setCompletedToToday: boolean }) => {
    if (!editing) return
    const patch = { ...input } as Parameters<typeof window.frame.db.updateTask>[1]
    if (opts.setCompletedToToday) patch.completedDate = todayIso()
    if (input.status !== 'DONE' && editing.status === 'DONE') patch.completedDate = null
    const r = await window.frame.db.updateTask(editing.id, patch)
    if (!r.ok) throw new Error(r.error ?? 'Update failed')
    setEditing(null)
    await reload()
  }

  const markDone = async (task: Task, completedDate: string, note: string, createNext?: boolean) => {
    if (task.recurrenceTemplateId !== null) {
      const r = await window.frame.db.completeRecurringOccurrence(
        task.id, completedDate, note || null, !!createNext,
      )
      setConfirmDone(null)
      if (!r.ok) { setError(r.error ?? 'Update failed'); return }
      await reload()
      return
    }
    const patch: Parameters<typeof window.frame.db.updateTask>[1] = {
      status:          'DONE',
      completedDate,
      percentComplete: 100,
    }
    if (note) {
      const stamped = `[${completedDate}] Done — ${note}`
      patch.notes = task.notes && task.notes.trim()
        ? `${stamped}\n\n${task.notes}`
        : stamped
    }
    const r = await window.frame.db.updateTask(task.id, patch)
    setConfirmDone(null)
    if (!r.ok) { setError(r.error ?? 'Update failed'); return }
    await reload()
  }

  const doDelete = async (task: Task) => {
    setConfirmDelete(null)
    const r = await window.frame.db.softDeleteTask(task.id)
    if (!r.ok) { setError(r.error ?? 'Delete failed'); return }
    setEditing(null)
    await reload()
  }

  if (loading) {
    return <div className="view-empty"><p className="muted">Loading…</p></div>
  }

  if (!activeUser) {
    return (
      <div className="task-view">
        <header className="view-header">
          <h1>My Work</h1>
        </header>
        <div className="view-empty">
          <p className="muted compact">
            Pick yourself in <strong>Settings → General → Active user</strong> to see this view.
          </p>
          {onJumpToSettings && (
            <p style={{ marginTop: '0.5rem' }}>
              <button className="primary-button" onClick={onJumpToSettings}>Open Settings</button>
            </p>
          )}
        </div>
      </div>
    )
  }

  const overdueCount   = buckets.overdue.length
  const todayCount     = buckets.today.length
  const thisWeekCount  = buckets['this-week'].length
  const totalOpen      = myRows.length

  return (
    <div className="task-view">
      <header className="view-header view-header-row">
        <div>
          <h1>My Work</h1>
          <p className="muted compact">
            {activeUser} · {totalOpen} open task{totalOpen === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      {error && <div className="setup-error" style={{ margin: '1rem 2rem 0' }}>{error}</div>}

      <div className="my-work-cards">
        <div className={`dashboard-card ${overdueCount  > 0 ? 'dashboard-card-danger' : ''}`}>
          <div className="dashboard-card-value">{overdueCount}</div>
          <div className="dashboard-card-label">Overdue</div>
        </div>
        <div className={`dashboard-card ${todayCount    > 0 ? 'dashboard-card-warn'   : ''}`}>
          <div className="dashboard-card-value">{todayCount}</div>
          <div className="dashboard-card-label">Due today</div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-value">{thisWeekCount}</div>
          <div className="dashboard-card-label">Due this week</div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-value">{totalOpen}</div>
          <div className="dashboard-card-label">My open</div>
        </div>
      </div>

      {totalOpen === 0 ? (
        <p className="muted compact" style={{ padding: '0 2rem' }}>Nothing assigned to you right now.</p>
      ) : (
        <div className="task-table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: '0.6rem' }} aria-label="Category" />
                <th style={{ width: '5.5rem' }}>Type</th>
                <th>Title</th>
                <th style={{ width: '7rem' }}>Status</th>
                <th style={{ width: '7.5rem' }}>%</th>
                <th style={{ width: '4rem' }}>Pri</th>
                <th style={{ width: '8rem' }}>Due</th>
                <th style={{ width: '8rem' }}>Owner</th>
                <th style={{ width: '9rem' }}>Team</th>
                <th style={{ width: '11rem' }}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {BUCKET_ORDER.map(key => {
                const list = buckets[key]
                if (list.length === 0) return null
                const meta = BUCKET_META[key]
                return (
                  <Bucket
                    key={key}
                    label={meta.label}
                    subtitle={meta.subtitle}
                    list={list}
                    categoryById={categoryById}
                    parentLabelFor={parentLabelFor}
                    typeBadgeFor={typeBadgeFor}
                    onOpen={(t) => setEditing(t)}
                    onOpenWorkflow={onOpenWorkflow}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <TaskModal
          mode="edit"
          task={editing}
          childCount={0}
          autoChildren={[]}
          allTasks={tasks}
          allWorkflows={workflows}
          onOpenTask={(t) => setEditing(t)}
          categories={categories}
          assignees={assignees}
          tagSuggestions={tagSuggestions}
          onCancel={() => setEditing(null)}
          onSave={saveEdited}
          onDelete={() => setConfirmDelete(editing)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          label="Delete task"
          title={`Delete "${confirmDelete.title}"?`}
          body="The task will be archived (soft-deleted). The audit log retains the full record."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => doDelete(confirmDelete)}
        />
      )}

      {confirmDone && (
        <MarkDoneDialog
          taskTitle={confirmDone.title}
          autoCreateNext={
            confirmDone.recurrenceTemplateId !== null
              ? (confirmDone.autoCreateNext ?? true)
              : undefined
          }
          onCancel={() => setConfirmDone(null)}
          onConfirm={(date, note, createNext) => markDone(confirmDone, date, note, createNext)}
        />
      )}
    </div>
  )
}

function Bucket({
  label, subtitle, list, categoryById, parentLabelFor, typeBadgeFor, onOpen, onOpenWorkflow,
}: {
  label:           string
  subtitle:        string
  list:            MyRow[]
  categoryById:    Map<number, Category>
  parentLabelFor:  (t: Task) => string | null
  typeBadgeFor:    (t: Task) => { label: string; cls: string }
  onOpen:          (t: Task) => void
  onOpenWorkflow?: (id: number) => void
}) {
  return (
    <>
      <tr className="group-header">
        <td colSpan={10}>
          <span className="group-header-label">{label}</span>
          <span className="group-header-count muted">({list.length})</span>
          <span className="muted compact" style={{ marginLeft: '0.5rem' }}>· {subtitle}</span>
        </td>
      </tr>
      {list.map(r => {
        if (r.kind === 'task') {
          const t       = r.task
          const cat     = categoryById.get(t.categoryId ?? -1)
          const colour  = cat?.colour ?? 'var(--muted)'
          const overdue = isOverdue(t.dueDate, t.status)
          const parent  = parentLabelFor(t)
          const badge   = typeBadgeFor(t)
          return (
            <tr key={`t-${t.id}`} className="task-row" onClick={() => onOpen(t)} style={{ cursor: 'pointer' }}>
              <td className="my-work-colour-cell" title={cat?.name ?? '(No category)'}>
                <span
                  className="my-work-colour-stripe"
                  style={{ background: overdue ? '#ef4444' : colour }}
                />
              </td>
              <td><span className={`type-badge ${badge.cls}`}>{badge.label}</span></td>
              <td className="task-title-cell">
                <span className="task-title-text">
                  {parent && <span className="task-parent-context muted compact">{parent}: </span>}
                  {t.title}
                </span>
              </td>
              <td><StatusPill status={t.status} /></td>
              <td>
                <span className="percent-cell">
                  <span className="percent-bar">
                    <span
                      className={`percent-bar-fill ${t.percentComplete === 100 ? 'is-done' : ''}`}
                      style={{ width: `${t.percentComplete}%` }}
                    />
                  </span>
                  <span className="percent-cell-num">{t.percentComplete}</span>
                </span>
              </td>
              <td><PriorityPill priority={t.priority} /></td>
              <td className={overdue ? 'overdue' : ''}>{formatDate(t.dueDate)}</td>
              <td>{t.primaryOwner ?? <span className="muted">—</span>}</td>
              <td><AssigneePile names={t.assignees} /></td>
              <td><TagCellPile tags={t.tags} /></td>
            </tr>
          )
        }
        // workflow row
        const w       = r.instance
        const cat     = categoryById.get(w.categoryId ?? -1)
        const colour  = cat?.colour ?? 'rgba(99, 102, 241, 0.85)'
        const overdue = isOverdue(w.targetDate, (w.status as never))
        const titleSuffix = [
          w.gateType   ? `(${w.gateType})`  : null,
          w.projectRef ? `· ${w.projectRef}` : null,
        ].filter(Boolean).join(' ')
        return (
          <tr
            key={`w-${w.id}`}
            className="task-row task-row-workflow"
            onClick={() => onOpenWorkflow?.(w.id)}
            style={{ cursor: onOpenWorkflow ? 'pointer' : 'default' }}
          >
            <td className="my-work-colour-cell" title={cat?.name ?? '(No category)'}>
              <span
                className="my-work-colour-stripe"
                style={{ background: overdue ? '#ef4444' : colour }}
              />
            </td>
            <td><span className="type-badge type-badge-workflow">Workflow</span></td>
            <td className="task-title-cell">
              <span className="task-title-text">
                <strong>{w.name}</strong>
                {titleSuffix && <span className="muted compact"> {titleSuffix}</span>}
              </span>
            </td>
            <td><StatusPill status={w.status as never} /></td>
            <td>
              <span className="percent-cell" title={`${w.doneSteps}/${w.totalSteps} steps complete`}>
                <span className="percent-bar">
                  <span
                    className={`percent-bar-fill ${w.percentDone === 100 ? 'is-done' : ''}`}
                    style={{ width: `${w.percentDone}%` }}
                  />
                </span>
                <span className="percent-cell-num">{w.percentDone}</span>
              </span>
            </td>
            <td><PriorityPill priority={w.priority} /></td>
            <td className={overdue ? 'overdue' : ''}>{formatDate(w.targetDate)}</td>
            <td>{w.primaryOwner ?? <span className="muted">—</span>}</td>
            <td><AssigneePile names={w.assignees} /></td>
            <td><TagCellPile tags={w.tags} /></td>
          </tr>
        )
      })}
    </>
  )
}
