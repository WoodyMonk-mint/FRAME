import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Assignee, Category, Priority, Status, Task, TaskInput } from '../types'
import { ALL_PRIORITIES, ALL_STATUSES } from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TaskModal } from '../components/TaskModal'
import { PriorityPill, StatusPill } from '../components/Pills'
import type { DueRange } from '../lib/date'
import { formatDate, isInDueRange, isOverdue, todayIso } from '../lib/date'
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

const STATUS_SORT_INDEX: Record<Status, string> = {
  PLANNING: '0', WIP: '1', BLOCKED: '2', ON_HOLD: '3', DONE: '4', CANCELLED: '5',
}

type GroupBy = 'none' | 'category' | 'status' | 'owner'

export function TaskListView() {
  const [tasks, setTasks]           = useState<Task[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [assignees, setAssignees]   = useState<Assignee[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [visibleStatuses, setVisibleStatuses] = useState<Set<Status>>(DEFAULT_VISIBLE)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  // Iteration 2 / Phase 3: full filter set
  const [filtersOpen, setFiltersOpen]           = useState(false)
  const [filterCategoryIds, setFilterCategoryIds] = useState<Set<number>>(new Set())
  const [filterPriorities, setFilterPriorities]   = useState<Set<Priority>>(new Set())
  const [filterOwners, setFilterOwners]           = useState<Set<string>>(new Set())
  const [filterDueRange, setFilterDueRange]       = useState<DueRange>('all')
  const [filterTags, setFilterTags]               = useState<Set<string>>(new Set())

  // Iteration 2 / Phase 4: grouping
  const [groupBy, setGroupBy]                 = useState<GroupBy>('none')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
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

  // The single filter predicate, applied to both top-level and children.
  const passesFilters = (t: Task): boolean => {
    if (!visibleStatuses.has(t.status)) return false
    if (filterCategoryIds.size > 0 && (t.categoryId === null || !filterCategoryIds.has(t.categoryId))) return false
    if (filterPriorities.size > 0 && (t.priority === null || !filterPriorities.has(t.priority))) return false
    if (filterOwners.size > 0 && (t.primaryOwner === null || !filterOwners.has(t.primaryOwner))) return false
    if (!isInDueRange(t.dueDate, t.status, filterDueRange)) return false
    if (filterTags.size > 0 && !t.tags.some(tag => filterTags.has(tag))) return false
    return true
  }

  // Auto children (unfiltered) — for the modal's auto-% calculation, we want
  // every child regardless of filters so the displayed value is consistent.
  const allChildrenByParent = useMemo(() => {
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

  // Filtered children for table rendering.
  const childrenByParent = useMemo(() => {
    const m = new Map<number, Task[]>()
    for (const t of tasks) {
      if (t.parentTaskId !== null && passesFilters(t)) {
        const arr = m.get(t.parentTaskId) ?? []
        arr.push(t)
        m.set(t.parentTaskId, arr)
      }
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, visibleStatuses, filterCategoryIds, filterPriorities, filterOwners, filterDueRange, filterTags])

  const visibleTopLevel = useMemo(
    () => tasks.filter(t => t.parentTaskId === null && passesFilters(t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, visibleStatuses, filterCategoryIds, filterPriorities, filterOwners, filterDueRange, filterTags]
  )

  const totalTopLevel = useMemo(
    () => tasks.filter(t => t.parentTaskId === null).length,
    [tasks]
  )

  const ownerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const a of assignees) set.add(a.name)
    for (const t of tasks) if (t.primaryOwner) set.add(t.primaryOwner)
    return [...set].sort()
  }, [assignees, tasks])

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (filterCategoryIds.size > 0) n++
    if (filterPriorities.size > 0)  n++
    if (filterOwners.size > 0)      n++
    if (filterDueRange !== 'all')   n++
    if (filterTags.size > 0)        n++
    return n
  }, [filterCategoryIds, filterPriorities, filterOwners, filterDueRange, filterTags])

  const clearFilters = () => {
    setFilterCategoryIds(new Set())
    setFilterPriorities(new Set())
    setFilterOwners(new Set())
    setFilterDueRange('all')
    setFilterTags(new Set())
  }

  const toggleInSet = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }

  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: '', tasks: visibleTopLevel }]
    }
    const buckets = new Map<string, { label: string; sortKey: string; tasks: Task[] }>()
    for (const t of visibleTopLevel) {
      let key:     string
      let label:   string
      let sortKey: string
      if (groupBy === 'category') {
        const c = categories.find(x => x.id === t.categoryId)
        key     = c ? `c:${c.id}` : 'c:none'
        label   = c?.name ?? '(No category)'
        sortKey = c ? String(c.sortOrder ?? 999).padStart(4, '0') + label : 'zzz' + label
      } else if (groupBy === 'status') {
        key     = `s:${t.status}`
        label   = STATUS_LABEL[t.status]
        sortKey = STATUS_SORT_INDEX[t.status] + t.status
      } else {
        key     = t.primaryOwner ? `o:${t.primaryOwner}` : 'o:none'
        label   = t.primaryOwner ?? '(Unassigned)'
        sortKey = t.primaryOwner ? '0' + t.primaryOwner : 'zzz'
      }
      if (!buckets.has(key)) buckets.set(key, { label, sortKey, tasks: [] })
      buckets.get(key)!.tasks.push(t)
    }
    return [...buckets.entries()]
      .sort((a, b) => a[1].sortKey.localeCompare(b[1].sortKey))
      .map(([key, v]) => ({ key, label: v.label, tasks: v.tasks }))
  }, [visibleTopLevel, groupBy, categories])

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
        <div className="filter-bar-spacer" />
        <label className="group-by-control">
          <span className="muted compact">Group:</span>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}>
            <option value="none">None</option>
            <option value="category">Category</option>
            <option value="status">Status</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <button
          type="button"
          className={`chip filter-toggle-chip ${activeFilterCount > 0 ? 'active' : ''}`}
          onClick={() => setFiltersOpen(o => !o)}
        >
          {filtersOpen ? 'Hide filters ▴' : `Filters${activeFilterCount > 0 ? ` (${activeFilterCount})` : ''} ▾`}
        </button>
        {activeFilterCount > 0 && (
          <button type="button" className="chip" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {filtersOpen && (
        <div className="filter-panel">
          <div className="filter-row">
            <span className="filter-row-label">Category</span>
            <div className="chip-row">
              {categories.filter(c => !c.isArchived).map(c => (
                <button
                  type="button"
                  key={c.id}
                  className={`chip ${filterCategoryIds.has(c.id) ? 'active' : ''}`}
                  onClick={() => setFilterCategoryIds(s => toggleInSet(s, c.id))}
                >{c.name}</button>
              ))}
            </div>
          </div>

          <div className="filter-row">
            <span className="filter-row-label">Priority</span>
            <div className="chip-row">
              {ALL_PRIORITIES.map(p => (
                <button
                  type="button"
                  key={p}
                  className={`chip ${filterPriorities.has(p) ? 'active' : ''}`}
                  onClick={() => setFilterPriorities(s => toggleInSet(s, p))}
                >{p}</button>
              ))}
            </div>
          </div>

          <div className="filter-row">
            <span className="filter-row-label">Owner</span>
            <div className="chip-row">
              {ownerOptions.map(name => (
                <button
                  type="button"
                  key={name}
                  className={`chip ${filterOwners.has(name) ? 'active' : ''}`}
                  onClick={() => setFilterOwners(s => toggleInSet(s, name))}
                >{name}</button>
              ))}
            </div>
          </div>

          <div className="filter-row">
            <span className="filter-row-label">Due</span>
            <div className="chip-row">
              {([
                ['all',       'All'],
                ['overdue',   'Overdue'],
                ['today',     'Today'],
                ['this-week', 'This week'],
                ['no-date',   'No date'],
              ] as Array<[DueRange, string]>).map(([v, label]) => (
                <button
                  type="button"
                  key={v}
                  className={`chip ${filterDueRange === v ? 'active' : ''}`}
                  onClick={() => setFilterDueRange(v)}
                >{label}</button>
              ))}
            </div>
          </div>

          {tagSuggestions.length > 0 && (
            <div className="filter-row">
              <span className="filter-row-label">Tag</span>
              <div className="chip-row">
                {tagSuggestions.map(tag => (
                  <button
                    type="button"
                    key={tag}
                    className={`chip ${filterTags.has(tag) ? 'active' : ''}`}
                    onClick={() => setFilterTags(s => toggleInSet(s, tag))}
                  >{tag}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
              {groups.map(g => {
                const showHeader = groupBy !== 'none'
                const collapsed  = collapsedGroups.has(g.key)
                return (
                  <Fragment key={g.key}>
                    {showHeader && (
                      <tr className="group-header" onClick={() => toggleGroup(g.key)}>
                        <td colSpan={10}>
                          <span className={`group-header-chevron ${collapsed ? '' : 'group-header-chevron-open'}`}>▶</span>
                          <span className="group-header-label">{g.label}</span>
                          <span className="group-header-count muted">({g.tasks.length})</span>
                        </td>
                      </tr>
                    )}
                    {!collapsed && g.tasks.map(t => {
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
                  </Fragment>
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
          childCount={modal.kind === 'edit' ? (allChildrenByParent.get(modal.task.id)?.length ?? 0) : 0}
          autoChildren={modal.kind === 'edit' ? (allChildrenByParent.get(modal.task.id) ?? []) : []}
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
