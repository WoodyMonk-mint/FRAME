import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Assignee, Category, Status, Task, TaskInput } from '../types'
import { ALL_PRIORITIES, ALL_STATUSES } from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TaskModal } from '../components/TaskModal'
import { PriorityPill, StatusPill } from '../components/Pills'
import { FilterDropdown } from '../components/FilterDropdown'
import { SavedViewsDropdown } from '../components/SavedViewsDropdown'
import { SingleSelectDropdown } from '../components/SingleSelectDropdown'
import type { DueRange } from '../lib/date'
import { formatDate, isOverdue, todayIso } from '../lib/date'
import { effectivePercent } from '../lib/percent'
import { tasksToCsv } from '../lib/csv'
import type { SortColumn, TaskFilters, TaskFilterPreset } from '../lib/taskFilters'
import {
  DEFAULT_FILTERS,
  passesFilters,
  loadPresets, savePresets,
  getDefaultPresetId, setDefaultPresetId,
} from '../lib/taskFilters'

type ModalState =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; task: Task }
  | { kind: 'add-subtask'; parent: Task }

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

const DUE_RANGE_OPTIONS: Array<{ value: DueRange; label: string }> = [
  { value: 'all',       label: 'All' },
  { value: 'overdue',   label: 'Overdue' },
  { value: 'today',     label: 'Today' },
  { value: 'this-week', label: 'This week' },
  { value: 'no-date',   label: 'No date' },
]

const UNASSIGNED_KEY = ''

export function TaskListView() {
  const [tasks, setTasks]           = useState<Task[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [assignees, setAssignees]   = useState<Assignee[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  // Filter model: a single TaskFilters object plus saved-view machinery.
  const [filters, setFiltersState] = useState<TaskFilters>(DEFAULT_FILTERS)
  const [presets, setPresets]                = useState<TaskFilterPreset[]>([])
  const [activePresetId, setActivePresetId]  = useState<string | null>(null)
  const [defaultPresetId, setDefaultIdState] = useState<string | null>(null)
  const [openDropdown, setOpenDropdown]      = useState<string | null>(null)

  // Grouping
  const [groupBy, setGroupBy]                 = useState<GroupBy>('none')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const [modal, setModal]                 = useState<ModalState>({ kind: 'closed' })
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

  // Initial load: data + presets + default preset application.
  useEffect(() => {
    let cancelled = false
    const initialPresets = loadPresets()
    const initialDefault = getDefaultPresetId()
    if (!cancelled) {
      setPresets(initialPresets)
      setDefaultIdState(initialDefault)
      const def = initialDefault ? initialPresets.find(p => p.id === initialDefault) : null
      if (def) {
        setFiltersState(def.filters)
        setActivePresetId(def.id)
      }
    }
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

  // Manual filter mutations clear the active preset id (the user has diverged
  // from the named view). Preset applies use setFiltersState directly.
  const updateFilters = (patch: Partial<TaskFilters>) => {
    setFiltersState(prev => ({ ...prev, ...patch }))
    setActivePresetId(null)
  }

  const toggleExcluded = <K extends keyof TaskFilters>(key: K, value: TaskFilters[K] extends Array<infer V> ? V : never) => {
    const arr = filters[key] as unknown as unknown[]
    const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]
    updateFilters({ [key]: next as unknown } as Partial<TaskFilters>)
  }

  const showAll = <K extends keyof TaskFilters>(key: K) => {
    updateFilters({ [key]: [] as unknown } as Partial<TaskFilters>)
  }

  const clearAllFilters = () => {
    setFiltersState(DEFAULT_FILTERS)
    setActivePresetId(null)
  }

  // ─── Saved-view actions ──────────────────────────────────────────────────

  const persistPresets = (next: TaskFilterPreset[]) => {
    setPresets(next)
    savePresets(next)
  }

  const applyPreset = (preset: TaskFilterPreset) => {
    setFiltersState(preset.filters)
    setActivePresetId(preset.id)
    setOpenDropdown(null)
  }

  const saveCurrentAsPreset = (name: string) => {
    const existing = presets.find(p => p.name === name)
    const next: TaskFilterPreset = {
      id:      existing?.id ?? `tf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      filters,
    }
    const updated = existing
      ? presets.map(p => p.id === existing.id ? next : p)
      : [...presets, next]
    persistPresets(updated)
    setActivePresetId(next.id)
  }

  const renamePreset = (id: string, name: string) => {
    persistPresets(presets.map(p => p.id === id ? { ...p, name } : p))
  }

  const deletePreset = (id: string) => {
    persistPresets(presets.filter(p => p.id !== id))
    if (activePresetId === id) setActivePresetId(null)
    if (defaultPresetId === id) {
      setDefaultIdState(null)
      setDefaultPresetId(null)
    }
  }

  const setDefaultPreset = (id: string | null) => {
    setDefaultIdState(id)
    setDefaultPresetId(id)
  }

  // ─── Derived data ────────────────────────────────────────────────────────

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

  const childrenByParent = useMemo(() => {
    const m = new Map<number, Task[]>()
    for (const t of tasks) {
      if (t.parentTaskId !== null && passesFilters(t, filters)) {
        const arr = m.get(t.parentTaskId) ?? []
        arr.push(t)
        m.set(t.parentTaskId, arr)
      }
    }
    return m
  }, [tasks, filters])

  const visibleTopLevel = useMemo(
    () => {
      const base = tasks.filter(t => t.parentTaskId === null && passesFilters(t, filters))
      if (!filters.sortBy || !filters.sortDir) return base
      const sorted = [...base]
      const col = filters.sortBy
      sorted.sort((a, b) => {
        let cmp = 0
        switch (col) {
          case 'category': cmp = (a.categoryName ?? '~').localeCompare(b.categoryName ?? '~'); break
          case 'title':    cmp = a.title.localeCompare(b.title); break
          case 'status':   cmp = STATUS_SORT_INDEX[a.status].localeCompare(STATUS_SORT_INDEX[b.status]); break
          case 'priority': cmp = (a.priority ?? 'P9').localeCompare(b.priority ?? 'P9'); break
          case 'due':      cmp = (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99'); break
          case 'owner':    cmp = (a.primaryOwner ?? '~').localeCompare(b.primaryOwner ?? '~'); break
          case 'team':     cmp = a.assignees.length - b.assignees.length; break
          case 'tags':     cmp = a.tags.length - b.tags.length; break
          case 'percent': {
            const ap = effectivePercent(a, allChildrenByParent.get(a.id) ?? [])
            const bp = effectivePercent(b, allChildrenByParent.get(b.id) ?? [])
            cmp = ap - bp
            break
          }
        }
        return filters.sortDir === 'desc' ? -cmp : cmp
      })
      return sorted
    },
    [tasks, filters, allChildrenByParent]
  )

  // Click-to-cycle: unsorted → asc → desc → unsorted (back to IPC default order).
  const cycleSort = (col: NonNullable<SortColumn>) => {
    setFiltersState(prev => {
      if (prev.sortBy !== col) return { ...prev, sortBy: col, sortDir: 'asc' }
      if (prev.sortDir === 'asc') return { ...prev, sortDir: 'desc' }
      return { ...prev, sortBy: null, sortDir: null }
    })
    setActivePresetId(null)
  }

  const totalTopLevel = useMemo(
    () => tasks.filter(t => t.parentTaskId === null).length,
    [tasks]
  )

  // Owner option set: union of seeded assignees and any owner already on a task,
  // plus a sentinel "(Unassigned)" entry so the user can hide unowned tasks.
  const ownerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const a of assignees) set.add(a.name)
    for (const t of tasks) if (t.primaryOwner) set.add(t.primaryOwner)
    const ordered = [...set].sort()
    return [
      ...ordered.map(name => ({ value: name, label: name })),
      { value: UNASSIGNED_KEY, label: '(Unassigned)' },
    ]
  }, [assignees, tasks])

  // ─── Grouping ────────────────────────────────────────────────────────────

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

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Task mutations ──────────────────────────────────────────────────────

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
    if (!r.ok) { setError(r.error ?? 'Update failed'); return }
    await reload()
  }

  const undone = async (task: Task) => {
    const r = await window.frame.db.updateTask(task.id, { status: 'WIP', completedDate: null })
    if (!r.ok) { setError(r.error ?? 'Update failed'); return }
    await reload()
  }

  const doDelete = async (task: Task) => {
    setConfirmDelete(null)
    const r = await window.frame.db.softDeleteTask(task.id)
    if (!r.ok) { setError(r.error ?? 'Delete failed'); return }
    setModal({ kind: 'closed' })
    await reload()
  }

  const exportCsv = async () => {
    setError(null)
    const flat: Task[] = []
    for (const g of groups) {
      for (const t of g.tasks) {
        flat.push(t)
        for (const c of (childrenByParent.get(t.id) ?? [])) flat.push(c)
      }
    }
    if (flat.length === 0) {
      setError('Nothing to export — current view has no tasks.')
      return
    }
    const csv = tasksToCsv(flat)
    const r = await window.frame.app.saveCsv(csv, `frame-tasks-${todayIso()}.csv`)
    if (!r.ok && !r.cancelled) setError(r.error ?? 'Export failed')
  }

  if (loading) {
    return <div className="view-empty"><p className="muted">Loading…</p></div>
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const hasAnyExclusions =
    filters.excludedStatuses.length    > 0 ||
    filters.excludedCategoryIds.length > 0 ||
    filters.excludedPriorities.length  > 0 ||
    filters.excludedOwners.length      > 0 ||
    filters.excludedTags.length        > 0 ||
    filters.dueRange                   !== 'all'

  return (
    <div className="task-view">
      <header className="view-header view-header-row">
        <div>
          <h1>Task List</h1>
          <p className="muted compact">{visibleTopLevel.length} of {totalTopLevel} task{totalTopLevel === 1 ? '' : 's'}</p>
        </div>
        <div className="header-actions">
          <button className="chip" onClick={exportCsv}>Export CSV</button>
          <button className="primary-button" onClick={() => setModal({ kind: 'add' })}>+ Add task</button>
        </div>
      </header>

      {error && <div className="setup-error" style={{ margin: '1rem 2rem 0' }}>{error}</div>}

      <div className="filter-bar filter-bar-dropdowns" onClick={() => setOpenDropdown(null)}>
        <SavedViewsDropdown
          presets={presets}
          activeId={activePresetId}
          defaultId={defaultPresetId}
          isOpen={openDropdown === 'saved'}
          onOpen={() => setOpenDropdown('saved')}
          onClose={() => setOpenDropdown(null)}
          onApply={applyPreset}
          onClearActive={() => { setFiltersState(DEFAULT_FILTERS); setActivePresetId(null) }}
          onSaveCurrent={saveCurrentAsPreset}
          onRename={renamePreset}
          onDelete={deletePreset}
          onSetDefault={setDefaultPreset}
        />

        <FilterDropdown
          label="Status"
          options={ALL_STATUSES.map(s => ({ value: s, label: STATUS_LABEL[s] }))}
          excluded={filters.excludedStatuses}
          isOpen={openDropdown === 'status'}
          onOpen={() => setOpenDropdown('status')}
          onClose={() => setOpenDropdown(null)}
          onToggle={(v) => toggleExcluded('excludedStatuses', v as Status)}
          onShowAll={() => showAll('excludedStatuses')}
        />

        <FilterDropdown
          label="Category"
          options={categories.filter(c => !c.isArchived).map(c => ({ value: String(c.id), label: c.name }))}
          excluded={filters.excludedCategoryIds.map(String)}
          isOpen={openDropdown === 'category'}
          onOpen={() => setOpenDropdown('category')}
          onClose={() => setOpenDropdown(null)}
          onToggle={(v) => toggleExcluded('excludedCategoryIds', Number(v))}
          onShowAll={() => showAll('excludedCategoryIds')}
        />

        <FilterDropdown
          label="Priority"
          options={ALL_PRIORITIES.map(p => ({ value: p, label: p }))}
          excluded={filters.excludedPriorities}
          isOpen={openDropdown === 'priority'}
          onOpen={() => setOpenDropdown('priority')}
          onClose={() => setOpenDropdown(null)}
          onToggle={(v) => toggleExcluded('excludedPriorities', v as typeof filters.excludedPriorities[number])}
          onShowAll={() => showAll('excludedPriorities')}
        />

        <FilterDropdown
          label="Owner"
          options={ownerOptions}
          excluded={filters.excludedOwners}
          isOpen={openDropdown === 'owner'}
          onOpen={() => setOpenDropdown('owner')}
          onClose={() => setOpenDropdown(null)}
          onToggle={(v) => toggleExcluded('excludedOwners', v)}
          onShowAll={() => showAll('excludedOwners')}
        />

        <SingleSelectDropdown
          label="Due"
          options={DUE_RANGE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          selected={filters.dueRange}
          defaultValue="all"
          isOpen={openDropdown === 'due'}
          onOpen={() => setOpenDropdown('due')}
          onClose={() => setOpenDropdown(null)}
          onChange={(v) => updateFilters({ dueRange: v as DueRange })}
        />

        {tagSuggestions.length > 0 && (
          <FilterDropdown
            label="Tag"
            options={tagSuggestions.map(t => ({ value: t, label: t }))}
            excluded={filters.excludedTags}
            isOpen={openDropdown === 'tag'}
            onOpen={() => setOpenDropdown('tag')}
            onClose={() => setOpenDropdown(null)}
            onToggle={(v) => toggleExcluded('excludedTags', v)}
            onShowAll={() => showAll('excludedTags')}
          />
        )}

        {hasAnyExclusions && (
          <button type="button" className="dash-filter-clear-all" onClick={clearAllFilters}>
            Clear all
          </button>
        )}

        <div className="filter-bar-spacer" />

        <SingleSelectDropdown
          label="Group"
          options={[
            { value: 'none',     label: 'None' },
            { value: 'category', label: 'Category' },
            { value: 'status',   label: 'Status' },
            { value: 'owner',    label: 'Owner' },
          ]}
          selected={groupBy}
          defaultValue="none"
          isOpen={openDropdown === 'group'}
          onOpen={() => setOpenDropdown('group')}
          onClose={() => setOpenDropdown(null)}
          onChange={(v) => setGroupBy(v as GroupBy)}
        />
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
                <SortTh col="category" sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="11rem">Category</SortTh>
                <SortTh col="title"    sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort}>Title</SortTh>
                <SortTh col="status"   sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="7rem">Status</SortTh>
                <SortTh col="priority" sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="4rem">Pri</SortTh>
                <SortTh col="due"      sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="8rem">Due</SortTh>
                <SortTh col="owner"    sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="8rem">Owner</SortTh>
                <SortTh col="team"     sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="9rem">Team</SortTh>
                <SortTh col="tags"     sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="11rem">Tags</SortTh>
                <SortTh col="percent"  sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="5.5rem" align="right">%</SortTh>
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

function SortTh({
  col, sortBy, sortDir, onClick, width, align = 'left', children,
}: {
  col:      NonNullable<SortColumn>
  sortBy:   SortColumn
  sortDir:  TaskFilters['sortDir']
  onClick:  (col: NonNullable<SortColumn>) => void
  width?:   string
  align?:   'left' | 'right'
  children: React.ReactNode
}) {
  const sorted = sortBy === col
  const arrow  = sorted ? (sortDir === 'asc' ? '▲' : '▼') : ''
  return (
    <th
      className={`sortable-th${sorted ? ' is-sorted' : ''}`}
      style={{ width, textAlign: align, cursor: 'pointer' }}
      onClick={() => onClick(col)}
    >
      <span className="sortable-th-inner">
        {children}
        {arrow && <span className="sort-indicator">{arrow}</span>}
      </span>
    </th>
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
