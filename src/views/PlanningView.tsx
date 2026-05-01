import { useEffect, useMemo, useState } from 'react'
import type {
  Assignee, Category, NewPlanningPeriodInput, PlanningPeriod,
  PlanningPeriodKind, Task, TaskInput, WorkflowInstance,
} from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PlanningPeriodDialog } from '../components/PlanningPeriodDialog'
import { TaskModal } from '../components/TaskModal'
import { PriorityPill, StatusPill } from '../components/Pills'
import { formatDate, isOverdue, todayIso } from '../lib/date'

type Props = {
  onOpenWorkflow?: (id: number) => void
}

const KIND_LABEL: Record<PlanningPeriodKind, string> = {
  sprint: 'Sprint', quarter: 'Quarter', custom: 'Custom',
}

const KIND_ORDER: PlanningPeriodKind[] = ['quarter', 'sprint', 'custom']

function periodTimeStatus(p: PlanningPeriod): 'past' | 'active' | 'future' {
  const today = todayIso()
  if (p.endDate < today)   return 'past'
  if (p.startDate > today) return 'future'
  return 'active'
}

export function PlanningView({ onOpenWorkflow }: Props = {}) {
  const [periods, setPeriods]       = useState<PlanningPeriod[]>([])
  const [tasks, setTasks]           = useState<Task[]>([])
  const [workflows, setWorkflows]   = useState<WorkflowInstance[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [assignees, setAssignees]   = useState<Assignee[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  const [dialog, setDialog]         = useState<{ kind: 'create' } | { kind: 'edit'; period: PlanningPeriod } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<PlanningPeriod | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const reload = async () => {
    setError(null)
    try {
      const [p, t, w, c, a, tg] = await Promise.all([
        window.frame.db.listPlanningPeriods(),
        window.frame.db.listTasks(),
        window.frame.db.listWorkflowInstances(),
        window.frame.db.listCategories(),
        window.frame.db.listAssignees(),
        window.frame.db.listTags(),
      ])
      setPeriods(p)
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

  const tasksByPeriod = useMemo(() => {
    const m = new Map<number, Task[]>()
    for (const t of tasks) {
      if (t.recurrenceUnit !== null && t.recurrenceTemplateId === null) continue
      for (const pid of t.periodIds) {
        const arr = m.get(pid) ?? []
        arr.push(t)
        m.set(pid, arr)
      }
    }
    return m
  }, [tasks])

  const workflowsByPeriod = useMemo(() => {
    const m = new Map<number, WorkflowInstance[]>()
    for (const w of workflows) {
      for (const pid of w.periodIds) {
        const arr = m.get(pid) ?? []
        arr.push(w)
        m.set(pid, arr)
      }
    }
    return m
  }, [workflows])

  const grouped = useMemo(() => {
    const m: Record<PlanningPeriodKind, PlanningPeriod[]> = { sprint: [], quarter: [], custom: [] }
    for (const p of periods) {
      if (p.isArchived) continue
      m[p.kind].push(p)
    }
    return m
  }, [periods])

  // ─── Task edit + commit mutations from this view ─────────────────────────

  const saveTaskEdited = async (input: TaskInput, opts: { setCompletedToToday: boolean }) => {
    if (!editingTask) return
    const patch = { ...input } as Parameters<typeof window.frame.db.updateTask>[1]
    if (opts.setCompletedToToday) patch.completedDate = todayIso()
    if (input.status !== 'DONE' && editingTask.status === 'DONE') patch.completedDate = null
    const r = await window.frame.db.updateTask(editingTask.id, patch)
    if (!r.ok) throw new Error(r.error ?? 'Update failed')
    setEditingTask(null)
    await reload()
  }

  if (loading) {
    return <div className="view-empty"><p className="muted">Loading…</p></div>
  }

  return (
    <div className="task-view">
      <header className="view-header view-header-row">
        <div>
          <h1>Planning</h1>
          <p className="muted compact">
            Sprints, quarters, and custom horizons. Commit tasks and workflows to a period to
            track hit rate.
          </p>
        </div>
        <div className="header-actions">
          <button className="chip" onClick={() => setDialog({ kind: 'create' })}>+ Add period</button>
        </div>
      </header>

      {error && <div className="setup-error" style={{ margin: '1rem 2rem 0' }}>{error}</div>}

      <div className="planning-grid">
        {KIND_ORDER.map(kind => {
          const list = grouped[kind]
          if (list.length === 0) return null
          return (
            <section key={kind} className="planning-kind-section">
              <h2 className="planning-kind-heading">{KIND_LABEL[kind]}{list.length > 1 ? 's' : ''}</h2>
              <div className="planning-period-list">
                {list.map(p => {
                  const status = periodTimeStatus(p)
                  const tasksList = tasksByPeriod.get(p.id) ?? []
                  const wfList    = workflowsByPeriod.get(p.id) ?? []
                  return (
                    <article key={p.id} className={`planning-period-card planning-period-${status}`}>
                      <header className="planning-period-header">
                        <div>
                          <h3>{p.name}</h3>
                          <p className="muted compact">
                            {formatDate(p.startDate)} → {formatDate(p.endDate)}
                            {' · '}
                            <span className={`planning-period-status planning-period-status-${status}`}>{status}</span>
                          </p>
                        </div>
                        <div className="planning-period-progress">
                          <span className="planning-period-hit">{p.hitRate}%</span>
                          <span className="muted compact">
                            {p.doneCommitted}/{p.totalCommitted}
                          </span>
                        </div>
                      </header>

                      {p.notes && <p className="muted compact" style={{ margin: '0.25rem 0 0.5rem' }}>{p.notes}</p>}

                      {(tasksList.length === 0 && wfList.length === 0) ? (
                        <p className="muted compact">No commitments yet.</p>
                      ) : (
                        <div className="planning-commit-list">
                          {wfList.map(w => (
                            <button
                              key={`w-${w.id}`}
                              className={`planning-commit-row ${w.status === 'DONE' ? 'is-done' : ''}`}
                              onClick={() => onOpenWorkflow?.(w.id)}
                              type="button"
                            >
                              <span className="type-badge type-badge-workflow">Workflow</span>
                              <span className="planning-commit-title">{w.name}</span>
                              <StatusPill status={w.status} />
                              <span className="planning-commit-due">{formatDate(w.targetDate)}</span>
                            </button>
                          ))}
                          {tasksList.map(t => {
                            const cat = categories.find(c => c.id === t.categoryId)
                            const colour = cat?.colour ?? 'var(--muted)'
                            const overdue = isOverdue(t.dueDate, t.status)
                            const badge =
                              t.workflowInstanceId   != null ? { label: 'Step',     cls: 'type-badge-workflow' }
                            : t.parentTaskId         != null ? { label: 'Subtask',  cls: 'type-badge-task' }
                            : t.recurrenceTemplateId != null ? { label: 'Recurring',cls: 'type-badge-recurring' }
                            : t.type === 'feature'           ? { label: 'Feature',  cls: 'type-badge-feature' }
                                                              : { label: 'Task',    cls: 'type-badge-task' }
                            return (
                              <button
                                key={`t-${t.id}`}
                                className={`planning-commit-row ${t.status === 'DONE' ? 'is-done' : ''}`}
                                onClick={() => setEditingTask(t)}
                                type="button"
                              >
                                <span
                                  className="planning-commit-stripe"
                                  style={{ background: overdue ? '#ef4444' : colour }}
                                />
                                <span className={`type-badge ${badge.cls}`}>{badge.label}</span>
                                <span className="planning-commit-title">{t.title}</span>
                                <PriorityPill priority={t.priority} />
                                <StatusPill status={t.status} />
                                <span className={`planning-commit-due ${overdue ? 'overdue' : ''}`}>{formatDate(t.dueDate)}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}

                      <footer className="planning-period-footer">
                        <button className="chip" onClick={() => setDialog({ kind: 'edit', period: p })}>Edit</button>
                        <button
                          className="chip chip--danger"
                          onClick={() => setConfirmDelete(p)}
                        >Delete</button>
                      </footer>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
        {periods.filter(p => !p.isArchived).length === 0 && (
          <div className="view-empty">
            <p className="muted compact">
              No planning periods yet. Click "+ Add period" to create your first sprint or quarter.
            </p>
          </div>
        )}
      </div>

      {dialog?.kind === 'create' && (
        <PlanningPeriodDialog
          mode="create"
          onCancel={() => setDialog(null)}
          onSubmit={async (input) => {
            const r = await window.frame.db.createPlanningPeriod(input)
            if (!r.ok) throw new Error(r.error ?? 'Create failed')
            setDialog(null)
            await reload()
          }}
        />
      )}

      {dialog?.kind === 'edit' && (
        <PlanningPeriodDialog
          mode="edit"
          period={dialog.period}
          onCancel={() => setDialog(null)}
          onSubmit={async (input: NewPlanningPeriodInput) => {
            const r = await window.frame.db.updatePlanningPeriod(dialog.period.id, input)
            if (!r.ok) throw new Error(r.error ?? 'Save failed')
            setDialog(null)
            await reload()
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          label="Delete period"
          title={`Delete "${confirmDelete.name}"?`}
          body="The period and its commitments are removed. The tasks and workflows themselves are unaffected."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const target = confirmDelete
            setConfirmDelete(null)
            const r = await window.frame.db.deletePlanningPeriod(target.id)
            if (!r.ok) { setError(r.error ?? 'Delete failed'); return }
            await reload()
          }}
        />
      )}

      {editingTask && (
        <TaskModal
          mode="edit"
          task={editingTask}
          childCount={0}
          autoChildren={[]}
          allTasks={tasks}
          allWorkflows={workflows}
          onOpenTask={(t) => setEditingTask(t)}
          categories={categories}
          assignees={assignees}
          tagSuggestions={tagSuggestions}
          onCancel={() => setEditingTask(null)}
          onSave={saveTaskEdited}
        />
      )}
    </div>
  )
}
