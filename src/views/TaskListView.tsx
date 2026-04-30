import { useEffect, useMemo, useState } from 'react'
import type { Assignee, Category, Status, Task, TaskInput } from '../types'
import { ALL_STATUSES } from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TaskModal } from '../components/TaskModal'
import { PriorityPill, StatusPill } from '../components/Pills'
import { formatDate, isOverdue, todayIso } from '../lib/date'

type ModalState =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; task: Task }

const DEFAULT_VISIBLE: Set<Status> = new Set(['PLANNING', 'WIP', 'BLOCKED'])

const STATUS_LABEL: Record<Status, string> = {
  PLANNING:  'Planning',
  WIP:       'In progress',
  BLOCKED:   'Blocked',
  DONE:      'Done',
  CANCELLED: 'Cancelled',
}

export function TaskListView() {
  const [tasks, setTasks]           = useState<Task[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [assignees, setAssignees]   = useState<Assignee[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [visibleStatuses, setVisibleStatuses] = useState<Set<Status>>(DEFAULT_VISIBLE)
  const [modal, setModal]           = useState<ModalState>({ kind: 'closed' })
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null)

  const reload = async () => {
    setError(null)
    try {
      const [t, c, a] = await Promise.all([
        window.frame.db.listTasks(),
        window.frame.db.listCategories(),
        window.frame.db.listAssignees(),
      ])
      setTasks(t)
      setCategories(c)
      setAssignees(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [t, c, a] = await Promise.all([
          window.frame.db.listTasks(),
          window.frame.db.listCategories(),
          window.frame.db.listAssignees(),
        ])
        if (!cancelled) {
          setTasks(t)
          setCategories(c)
          setAssignees(a)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const visibleTasks = useMemo(
    () => tasks.filter(t => visibleStatuses.has(t.status)),
    [tasks, visibleStatuses]
  )

  const toggleStatus = (s: Status) => {
    setVisibleStatuses(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const saveTask = async (input: TaskInput, opts: { setCompletedToToday: boolean }) => {
    if (modal.kind === 'add') {
      const r = await window.frame.db.createTask(input)
      if (!r.ok) throw new Error(r.error ?? 'Create failed')
    } else if (modal.kind === 'edit') {
      const patch = { ...input } as Parameters<typeof window.frame.db.updateTask>[1]
      if (opts.setCompletedToToday) patch.completedDate = todayIso()
      if (input.status !== 'DONE' && modal.task.status === 'DONE') patch.completedDate = null
      const r = await window.frame.db.updateTask(modal.task.id, patch)
      if (!r.ok) throw new Error(r.error ?? 'Update failed')
    }
    setModal({ kind: 'closed' })
    await reload()
  }

  const markDone = async (task: Task) => {
    const r = await window.frame.db.updateTask(task.id, {
      status:          'DONE',
      completedDate:   todayIso(),
      percentComplete: 100,
    })
    if (!r.ok) {
      setError(r.error ?? 'Update failed')
      return
    }
    await reload()
  }

  const undone = async (task: Task) => {
    const r = await window.frame.db.updateTask(task.id, {
      status:        'WIP',
      completedDate: null,
    })
    if (!r.ok) {
      setError(r.error ?? 'Update failed')
      return
    }
    await reload()
  }

  const doDelete = async (task: Task) => {
    setConfirmDelete(null)
    const r = await window.frame.db.softDeleteTask(task.id)
    if (!r.ok) {
      setError(r.error ?? 'Delete failed')
      return
    }
    setModal({ kind: 'closed' })
    await reload()
  }

  if (loading) {
    return <div className="view-empty"><p className="muted">Loading…</p></div>
  }

  return (
    <div className="task-view">
      <header className="view-header view-header-row">
        <div>
          <h1>Task List</h1>
          <p className="muted compact">{visibleTasks.length} of {tasks.length} task{tasks.length === 1 ? '' : 's'}</p>
        </div>
        <button className="primary-button" onClick={() => setModal({ kind: 'add' })}>
          + Add task
        </button>
      </header>

      {error && <div className="setup-error" style={{ margin: '1rem 2rem 0' }}>{error}</div>}

      <div className="filter-bar">
        <span className="filter-label muted">Status</span>
        {ALL_STATUSES.map(s => (
          <button
            key={s}
            className={`chip ${visibleStatuses.has(s) ? 'active' : ''}`}
            onClick={() => toggleStatus(s)}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {visibleTasks.length === 0 ? (
        <div className="view-empty">
          <p className="muted">
            {tasks.length === 0
              ? 'No tasks yet. Click "Add task" to create one.'
              : 'No tasks match the current filter.'}
          </p>
        </div>
      ) : (
        <div className="task-table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <th aria-label="Done" style={{ width: '2.25rem' }}></th>
                <th style={{ width: '11rem' }}>Category</th>
                <th>Title</th>
                <th style={{ width: '7rem' }}>Status</th>
                <th style={{ width: '4rem' }}>Pri</th>
                <th style={{ width: '8rem' }}>Due</th>
                <th style={{ width: '8rem' }}>Owner</th>
                <th style={{ width: '10rem' }}>Team</th>
                <th style={{ width: '5rem', textAlign: 'right' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map(t => (
                <TaskRow
                  key={t.id}
                  task={t}
                  categoryColour={categories.find(c => c.id === t.categoryId)?.colour ?? null}
                  onOpen={() => setModal({ kind: 'edit', task: t })}
                  onMarkDone={() => markDone(t)}
                  onUndone={() => undone(t)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal.kind !== 'closed' && (
        <TaskModal
          mode={modal.kind}
          task={modal.kind === 'edit' ? modal.task : undefined}
          categories={categories}
          assignees={assignees}
          onCancel={() => setModal({ kind: 'closed' })}
          onSave={saveTask}
          onDelete={modal.kind === 'edit' ? () => setConfirmDelete(modal.task) : undefined}
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
    </div>
  )
}

function TaskRow({
  task, categoryColour, onOpen, onMarkDone, onUndone,
}: {
  task:           Task
  categoryColour: string | null
  onOpen:         () => void
  onMarkDone:     () => void
  onUndone:       () => void
}) {
  const overdue = isOverdue(task.dueDate, task.status)
  const isDone  = task.status === 'DONE'

  return (
    <tr className={`task-row ${isDone ? 'task-row-done' : ''}`} onClick={onOpen}>
      <td onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          className="task-checkbox"
          checked={isDone}
          onChange={() => isDone ? onUndone() : onMarkDone()}
          title={isDone ? 'Mark not done' : 'Mark done'}
        />
      </td>
      <td>
        <span className="category-cell">
          <span className="category-dot" style={{ background: categoryColour ?? 'var(--muted)' }} />
          <span className="category-name">{task.categoryName ?? '—'}</span>
        </span>
      </td>
      <td className="task-title-cell">{task.title}</td>
      <td><StatusPill status={task.status} /></td>
      <td><PriorityPill priority={task.priority} /></td>
      <td className={overdue ? 'overdue' : ''}>{formatDate(task.dueDate)}</td>
      <td>{task.primaryOwner ?? <span className="muted">—</span>}</td>
      <td>
        {task.assignees.length === 0
          ? <span className="muted">—</span>
          : <AssigneePile names={task.assignees} />}
      </td>
      <td style={{ textAlign: 'right' }}>{task.percentComplete}</td>
    </tr>
  )
}

function AssigneePile({ names }: { names: string[] }) {
  const visible = names.slice(0, 3)
  const extra   = names.length - visible.length
  return (
    <span className="assignee-pile" title={names.join(', ')}>
      {visible.map(n => (
        <span key={n} className="assignee-chip">{n[0]}</span>
      ))}
      {extra > 0 && <span className="assignee-chip assignee-chip-extra">+{extra}</span>}
    </span>
  )
}
