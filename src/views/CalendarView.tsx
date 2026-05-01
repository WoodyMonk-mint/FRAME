import { useEffect, useMemo, useState } from 'react'
import type {
  Assignee, Category, Task, TaskInput, WorkflowInstance,
} from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MarkDoneDialog } from '../components/MarkDoneDialog'
import { TaskModal } from '../components/TaskModal'
import { addRecurrence, isOverdue, todayIso } from '../lib/date'

type Props = {
  onOpenWorkflow?: (id: number) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Build a 6×7 grid of dates anchored at the Monday on/before the 1st of the month.
function monthGrid(year: number, monthIdx: number): string[][] {
  const first = new Date(Date.UTC(year, monthIdx, 1))
  // JS getUTCDay: 0 = Sun, 1 = Mon, ..., 6 = Sat. We want Mon-first weeks.
  const firstWeekday = (first.getUTCDay() + 6) % 7  // shift so Mon = 0
  const start = new Date(first)
  start.setUTCDate(first.getUTCDate() - firstWeekday)
  const weeks: string[][] = []
  for (let w = 0; w < 6; w++) {
    const week: string[] = []
    for (let d = 0; d < 7; d++) {
      const cell = new Date(start)
      cell.setUTCDate(start.getUTCDate() + w * 7 + d)
      week.push(cell.toISOString().slice(0, 10))
    }
    weeks.push(week)
  }
  return weeks
}

function isCalendarTask(t: Task): boolean {
  // Recurrence templates are hidden (their occurrences appear); everything
  // else with a due date is a real calendar item — including workflow steps.
  if (t.recurrenceUnit !== null && t.recurrenceTemplateId === null) return false
  if (t.dueDate === null) return false
  return true
}

export function CalendarView({ onOpenWorkflow }: Props = {}) {
  const today = todayIso()

  const [tasks, setTasks]           = useState<Task[]>([])
  const [workflows, setWorkflows]   = useState<WorkflowInstance[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [assignees, setAssignees]   = useState<Assignee[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  const [anchorMonth, setAnchorMonth] = useState(() => {
    const d = new Date()
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() }
  })
  const [showSubtasks, setShowSubtasks] = useState(false)

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

  // ─── Index tasks + workflow markers by date ──────────────────────────────

  const categoryById = useMemo(
    () => new Map(categories.map(c => [c.id, c])),
    [categories]
  )
  const workflowsById = useMemo(
    () => new Map(workflows.map(w => [w.id, w])),
    [workflows]
  )

  const tasksByDate = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!isCalendarTask(t)) continue
      if (!showSubtasks && t.parentTaskId !== null) continue
      const d = t.dueDate as string
      if (!m.has(d)) m.set(d, [])
      m.get(d)!.push(t)
    }
    return m
  }, [tasks, showSubtasks])

  // Project future recurring occurrences from each template's latest known
  // occurrence due_date, up to a horizon ~12 months ahead. They render as
  // ghost blocks so the user can see "this will recur on X" without those
  // tasks existing as rows yet.
  const projectionsByDate = useMemo(() => {
    const m = new Map<string, Task[]>()
    // Find latest occurrence due_date per template.
    const latestByTemplate = new Map<number, string>()
    for (const t of tasks) {
      if (t.recurrenceTemplateId == null) continue
      if (t.dueDate == null) continue
      const cur = latestByTemplate.get(t.recurrenceTemplateId)
      if (!cur || t.dueDate > cur) latestByTemplate.set(t.recurrenceTemplateId, t.dueDate)
    }
    // Horizon: 12 months from today.
    const horizonDate = new Date()
    horizonDate.setUTCFullYear(horizonDate.getUTCFullYear() + 1)
    const horizon = horizonDate.toISOString().slice(0, 10)

    for (const t of tasks) {
      const isTemplate = t.recurrenceUnit != null && t.recurrenceTemplateId == null
      if (!isTemplate) continue
      const latest = latestByTemplate.get(t.id)
      if (!latest) continue
      let d = addRecurrence(latest, t.recurrenceUnit, t.recurrenceInterval)
      // Cap at 60 projections per template as a safety net.
      let n = 0
      while (d && d <= horizon && n < 60) {
        if (!m.has(d)) m.set(d, [])
        m.get(d)!.push(t)
        d = addRecurrence(d, t.recurrenceUnit, t.recurrenceInterval)
        n++
      }
    }
    return m
  }, [tasks])

  // Workflows show on their start_date AND target_date as chips — proper
  // span rendering (bars across cells) is parked.
  type WorkflowMarker = { instance: WorkflowInstance; kind: 'start' | 'target' }
  const workflowsByDate = useMemo(() => {
    const m = new Map<string, WorkflowMarker[]>()
    for (const w of workflows) {
      if (w.status === 'CANCELLED') continue
      if (w.startDate) {
        if (!m.has(w.startDate)) m.set(w.startDate, [])
        m.get(w.startDate)!.push({ instance: w, kind: 'start' })
      }
      if (w.targetDate && w.targetDate !== w.startDate) {
        if (!m.has(w.targetDate)) m.set(w.targetDate, [])
        m.get(w.targetDate)!.push({ instance: w, kind: 'target' })
      }
    }
    return m
  }, [workflows])

  const grid = useMemo(
    () => monthGrid(anchorMonth.year, anchorMonth.month),
    [anchorMonth]
  )

  // ─── Mutations from the edit modal ───────────────────────────────────────

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

  // ─── Navigation ──────────────────────────────────────────────────────────

  const stepMonth = (delta: number) => {
    setAnchorMonth(prev => {
      const d = new Date(Date.UTC(prev.year, prev.month + delta, 1))
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() }
    })
  }

  const jumpToToday = () => {
    const d = new Date()
    setAnchorMonth({ year: d.getUTCFullYear(), month: d.getUTCMonth() })
  }

  if (loading) {
    return <div className="view-empty"><p className="muted">Loading…</p></div>
  }

  return (
    <div className="task-view">
      <header className="view-header view-header-row">
        <div>
          <h1>Calendar</h1>
          <p className="muted compact">
            {MONTH_NAMES[anchorMonth.month]} {anchorMonth.year}
          </p>
        </div>
        <div className="header-actions">
          <button className="chip" onClick={() => stepMonth(-1)} aria-label="Previous month">←</button>
          <button className="chip" onClick={jumpToToday}>Today</button>
          <button className="chip" onClick={() => stepMonth(+1)} aria-label="Next month">→</button>
          <button
            className={`chip ${showSubtasks ? 'active' : ''}`}
            onClick={() => setShowSubtasks(v => !v)}
            title={showSubtasks ? 'Hide subtasks' : 'Show subtasks'}
          >{showSubtasks ? 'Hide subtasks' : 'Show subtasks'}</button>
        </div>
      </header>

      {error && <div className="setup-error" style={{ margin: '1rem 2rem 0' }}>{error}</div>}

      <div className="calendar-grid">
        <div className="calendar-weekday-row">
          {WEEKDAYS.map(d => <div key={d} className="calendar-weekday">{d}</div>)}
        </div>
        {grid.map((week, wi) => (
          <div key={wi} className="calendar-week">
            {week.map(date => {
              const inMonth = new Date(date + 'T00:00:00Z').getUTCMonth() === anchorMonth.month
              const isToday = date === today
              const dayNum  = Number(date.slice(8, 10))
              const dayTasks = tasksByDate.get(date) ?? []
              const dayMarkers = workflowsByDate.get(date) ?? []
              const dayProjections = projectionsByDate.get(date) ?? []
              return (
                <div
                  key={date}
                  className={[
                    'calendar-cell',
                    inMonth   ? '' : 'calendar-cell-out',
                    isToday   ? 'calendar-cell-today' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="calendar-cell-header">
                    <span className="calendar-cell-day">{dayNum}</span>
                  </div>
                  <div className="calendar-cell-body">
                    {dayMarkers.map(({ instance, kind }) => {
                      const header = [
                        instance.name,
                        instance.gateType   ? `(${instance.gateType})`  : null,
                        instance.projectRef ? `· ${instance.projectRef}` : null,
                      ].filter(Boolean).join(' ')
                      const wfCat = categoryById.get(instance.categoryId ?? -1)
                      const wfColour = wfCat?.colour ?? 'rgba(99, 102, 241, 0.85)'
                      return (
                        <button
                          type="button"
                          key={`w-${instance.id}-${kind}`}
                          className={`calendar-workflow-chip ${kind === 'target' ? 'calendar-workflow-target' : ''}`}
                          style={{ borderLeftColor: wfColour }}
                          onClick={() => onOpenWorkflow?.(instance.id)}
                          title={`${instance.name} — ${kind === 'start' ? 'starts' : 'ends'}`}
                        >
                          <span className="calendar-task-context">{header}</span>
                          <span className="calendar-task-title">{kind === 'start' ? 'Start' : 'End'}</span>
                        </button>
                      )
                    })}
                    {dayProjections.map(tpl => (
                      <button
                        type="button"
                        key={`p-${tpl.id}-${date}`}
                        className="calendar-task-block calendar-task-projected"
                        onClick={() => setEditing(tpl)}
                        title={`Projected occurrence of "${tpl.title}" — created when the current cycle is marked done`}
                      >
                        <span className="calendar-task-title">🔁 {tpl.title}</span>
                      </button>
                    ))}
                    {dayTasks.map(t => {
                      const cat = categoryById.get(t.categoryId ?? -1)
                      const colour = cat?.colour ?? 'var(--muted)'
                      const overdue = isOverdue(t.dueDate, t.status)
                      const wf = t.workflowInstanceId != null
                        ? workflowsById.get(t.workflowInstanceId) ?? null
                        : null
                      const wfHeader = wf
                        ? [
                            wf.name,
                            wf.gateType   ? `(${wf.gateType})`  : null,
                            wf.projectRef ? `· ${wf.projectRef}` : null,
                          ].filter(Boolean).join(' ')
                        : null
                      const stepLabel = wf && t.workflowStepNumber != null
                        ? `${t.workflowStepNumber}. ` : ''
                      const tooltip = wf
                        ? `${wf.name} — step ${t.workflowStepNumber ?? '?'}: ${t.title}`
                        : t.title
                      return (
                        <button
                          type="button"
                          key={t.id}
                          className={[
                            'calendar-task-block',
                            overdue                ? 'calendar-task-overdue' : '',
                            t.status === 'DONE'    ? 'calendar-task-done'    : '',
                            wf                     ? 'calendar-task-step'    : '',
                          ].filter(Boolean).join(' ')}
                          style={{ borderLeftColor: overdue ? '#ef4444' : colour }}
                          onClick={() => setEditing(t)}
                          title={tooltip}
                        >
                          {wfHeader && (
                            <span className="calendar-task-context">{wfHeader}</span>
                          )}
                          <span className="calendar-task-title">{stepLabel}{t.title}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

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
