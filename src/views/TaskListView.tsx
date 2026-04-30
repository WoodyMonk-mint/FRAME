import { useEffect, useMemo, useState } from 'react'
import type { Assignee, Category, Status, Task, TaskInput } from '../types'
import { ALL_STATUSES } from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TaskModal } from '../components/TaskModal'
import { PriorityPill, StatusPill } from '../components/Pills'
import { formatDate, isOverdue, todayIso } from '../lib/date'
import { effectivePercent } from '../lib/percent'

type ModalState =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; task: Task }
  | { kind: 'add-subtask'; parent: Task }

const DEFAULT_VISIBLE: Set<Status> = new Set(['PLANNING', 'WIP', 'BLOCKED', 'ON_HOLD'])

const STATUS_LABEL: Record<Status, string> = {
  PLANNING:  'Planning',
  WIP:       'In progress',
  BLOCKED:   'Blocked',
  ON_HOLD:   'On hold',
  DONE:      'Done',
  CANCELLED: 'Cancelled',
}

export function TaskListView() {
  const [tasks, setTasks]           = useState<Task[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [assignees, setAssignees]   = useState<Assignee[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [visibleStatuses, setVisibleStatuses] = useState<Set<Status>>(DEFAULT_VISIBLE)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [modal, setModal]           = useState<ModalState>({ kind: 'closed' })
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null)

  const reload = async () => {
    setError(null)
    try {
      const [t, c, a, tg] = await Promise.all([
        window.frame.db.listTasks(),
        window.frame.db.listCategories(),
        window.frame.db.listAssignees(),
        window.frame.db.listTags(),
      ])
      setTasks(t)
      setCategories(c)
      setAssignees(a)
      setTagSuggestions(tg)
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
        const [t, c, a, tg] = await Promise.all([
          window.frame.db.listTasks(),
          window.frame.db.listCategories(),
          window.frame.db.listAssignees(),
          window.frame.db.listTags(),
        ])
        if (!cancelled) {
          setTasks(t)
          setCategories(c)
          setAssignees(a)
          setTagSuggestions(tg)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Group children by parent. Children are visible when their parent is expanded —
  // status filter applies to top-level tasks; children always render under their parent.
  const childrenByParent = useMemo(() => {
    const m = new Map<number, Task[]>()
    for (const t of tasks) {
      if (t.parentTaskId !== null) {
        const arr = m.get(t.parentTaskId) ?? []
        arr.push(t)
        m.set(t.parentTaskId, arr)
      }
    }
    return m
  }, [tasks])

  const visibleTopLevel = useMemo(
    () => tasks.filter(t => t.parentTaskId === null && visibleStatuses.has(t.status)),
    [tasks, visibleStatuses]
  )

  const totalTopLevel = useMemo(
    () => tasks.filter(t => t.parentTaskId === null).length,
    [tasks]
  )

  const toggleStatus = (s: Status) => {
    setVisibleStatuses(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const saveTask = async (input: TaskInput, opts: { setCompletedToToday: boolean }) => {
    if (modal.kind === 'add') {
      const r = await window.frame.db.createTask(input)
      if (!r.ok) throw new Error(r.error ?? 'Create failed')
    } else if (modal.kind === 'add-subtask') {
      const r = await window.frame.db.createTask({ ...input, parentTaskId: modal.parent.id })
      if (!r.ok) throw new Error(r.error ?? 'Create failed')
      setExpandedIds(prev => new Set(prev).add(modal.parent.id))
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
          <p className="muted compact">{visibleTopLevel.length} of {totalTopLevel} task{totalTopLevel === 1 ? '' : 's'}</p>
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

      {visibleTopLevel.length === 0 ? (
        <div className="view-empty">
          <p className="muted">
            {totalTopLevel === 0
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
                <th style={{ width: '9rem' }}>Team</th>
                <th style={{ width: '11rem' }}>Tags</th>
                <th style={{ width: '5.5rem', textAlign: 'right' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {visibleTopLevel.map(t => {
                const children = childrenByParent.get(t.id) ?? []
                const isExpanded = expandedIds.has(t.id)
                return (
                  <RowGroup
                    key={t.id}
                    task={t}
                    children={children}
                    isExpanded={isExpanded}
                    categoryColour={categories.find(c => c.id === t.categoryId)?.colour ?? null}
                    onToggle={() => toggleExpand(t.id)}
                    onOpen={(target) => setModal({ kind: 'edit', task: target })}
                    onMarkDone={(target) => markDone(target)}
                    onUndone={(target) => undone(target)}
                    onAddSubtask={() => setModal({ kind: 'add-subtask', parent: t })}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal.kind !== 'closed' && (
        <TaskModal
          mode={modal.kind === 'edit' ? 'edit' : 'add'}
          task={modal.kind === 'edit' ? modal.task : undefined}
          parent={modal.kind === 'add-subtask' ? modal.parent : undefined}
          childCount={modal.kind === 'edit' ? (childrenByParent.get(modal.task.id)?.length ?? 0) : 0}
          autoChildren={modal.kind === 'edit' ? (childrenByParent.get(modal.task.id) ?? []) : []}
          categories={categories}
          assignees={assignees}
          tagSuggestions={tagSuggestions}
          onCancel={() => setModal({ kind: 'closed' })}
          onSave={saveTask}
          onDelete={modal.kind === 'edit' ? () => setConfirmDelete(modal.task) : undefined}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          label="Delete task"
          title={`Delete "${confirmDelete.title}"?`}
          body="The task will be archived (soft-deleted). The audit log retains the full record. Subtasks are kept — you'll need to delete them individually."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => doDelete(confirmDelete)}
        />
      )}
    </div>
  )
}

function RowGroup({
  task, children, isExpanded, categoryColour,
  onToggle, onOpen, onMarkDone, onUndone, onAddSubtask,
}: {
  task:           Task
  children:       Task[]
  isExpanded:     boolean
  categoryColour: string | null
  onToggle:       () => void
  onOpen:         (t: Task) => void
  onMarkDone:     (t: Task) => void
  onUndone:       (t: Task) => void
  onAddSubtask:   () => void
}) {
  const hasChildren = children.length > 0
  const displayPercent = effectivePercent(task, children)
  const isAuto = hasChildren && !task.percentManual

  return (
    <>
      <TaskRow
        task={task}
        depth={0}
        canExpand={hasChildren}
        isExpanded={isExpanded}
        onToggle={onToggle}
        categoryColour={categoryColour}
        onOpen={() => onOpen(task)}
        onMarkDone={() => onMarkDone(task)}
        onUndone={() => onUndone(task)}
        displayPercent={displayPercent}
        percentMode={hasChildren ? (task.percentManual ? 'manual' : 'auto') : 'leaf'}
      />
      {isExpanded && children.map(c => (
        <TaskRow
          key={c.id}
          task={c}
          depth={1}
          canExpand={false}
          isExpanded={false}
          onToggle={() => {}}
          categoryColour={categoryColour}
          onOpen={() => onOpen(c)}
          onMarkDone={() => onMarkDone(c)}
          onUndone={() => onUndone(c)}
          displayPercent={c.percentComplete}
          percentMode="leaf"
        />
      ))}
      {isExpanded && (
        <tr className="add-subtask-row">
          <td></td>
          <td colSpan={9}>
            <button type="button" className="add-subtask-btn" onClick={onAddSubtask}>
              + Add subtask
            </button>
            {isAuto && (
              <span className="muted compact" style={{ marginLeft: '1rem', fontSize: '0.75rem' }}>
                Parent % auto-calculated from {children.length} subtask{children.length === 1 ? '' : 's'}
              </span>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function TaskRow({
  task, depth, canExpand, isExpanded, onToggle,
  categoryColour, onOpen, onMarkDone, onUndone,
  displayPercent, percentMode,
}: {
  task:           Task
  depth:          number
  canExpand:      boolean
  isExpanded:     boolean
  onToggle:       () => void
  categoryColour: string | null
  onOpen:         () => void
  onMarkDone:     () => void
  onUndone:       () => void
  displayPercent: number
  percentMode:    'auto' | 'manual' | 'leaf'
}) {
  const overdue = isOverdue(task.dueDate, task.status)
  const isDone  = task.status === 'DONE'
  const isSubtask = depth > 0

  return (
    <tr
      className={`task-row ${isDone ? 'task-row-done' : ''} ${isSubtask ? 'task-row-subtask' : ''}`}
      onClick={onOpen}
    >
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
        {!isSubtask && (
          <span className="category-cell">
            <span className="category-dot" style={{ background: categoryColour ?? 'var(--muted)' }} />
            <span className="category-name">{task.categoryName ?? '—'}</span>
          </span>
        )}
      </td>
      <td className="task-title-cell">
        <span style={{ paddingLeft: `${depth * 1.25}rem`, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          {canExpand ? (
            <button
              type="button"
              className={`expand-chevron ${isExpanded ? 'expand-chevron-open' : ''}`}
              onClick={e => { e.stopPropagation(); onToggle() }}
              aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
            >▶</button>
          ) : (
            isSubtask
              ? <span className="subtask-rail" aria-hidden>↳</span>
              : <span className="expand-chevron expand-chevron-spacer" aria-hidden></span>
          )}
          {task.title}
        </span>
      </td>
      <td><StatusPill status={task.status} /></td>
      <td><PriorityPill priority={task.priority} /></td>
      <td className={overdue ? 'overdue' : ''}>{formatDate(task.dueDate)}</td>
      <td>{task.primaryOwner ?? <span className="muted">—</span>}</td>
      <td>
        {task.assignees.length === 0
          ? <span className="muted">—</span>
          : <AssigneePile names={task.assignees} />}
      </td>
      <td>
        {task.tags.length === 0
          ? <span className="muted">—</span>
          : <TagCellPile tags={task.tags} />}
      </td>
      <td style={{ textAlign: 'right' }}>
        <span className="percent-cell">
          {displayPercent}
          {percentMode === 'auto'   && <span className="percent-mode-badge percent-mode-auto" title="Auto-computed from subtasks">A</span>}
          {percentMode === 'manual' && <span className="percent-mode-badge percent-mode-manual" title="Manually overridden">M</span>}
        </span>
      </td>
    </tr>
  )
}

function TagCellPile({ tags }: { tags: string[] }) {
  const visible = tags.slice(0, 2)
  const extra   = tags.length - visible.length
  return (
    <span className="tag-cell-pile" title={tags.join(', ')}>
      {visible.map(t => <span key={t} className="tag-chip-static">{t}</span>)}
      {extra > 0 && <span className="tag-chip-static tag-chip-extra">+{extra}</span>}
    </span>
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
