import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Assignee, Category, Status, Task, TaskInput, WorkflowInstance } from '../types'
import { ALL_PRIORITIES, ALL_STATUSES } from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MarkDoneDialog } from '../components/MarkDoneDialog'
import { TaskModal } from '../components/TaskModal'
import { PriorityPill, StatusPill } from '../components/Pills'
import { FilterDropdown } from '../components/FilterDropdown'
import { SavedViewsDropdown } from '../components/SavedViewsDropdown'
import { SingleSelectDropdown } from '../components/SingleSelectDropdown'
import { ContextMenu, type ContextMenuItem } from '../components/ContextMenu'
import type { DueRange } from '../lib/date'
import { formatDate, isInDueRange, isOverdue, todayIso } from '../lib/date'
import { effectivePercent, openSubtaskCount } from '../lib/percent'
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

// Top-level rows are either real tasks or synthetic workflow-instance rows.
// Workflow rows nest their step-tasks underneath, the same way parent tasks
// nest subtasks.
type TopRow =
  | { kind: 'task';     task: Task }
  | { kind: 'workflow'; instance: WorkflowInstance }

function isKnownStatus(s: string): s is Status {
  return (ALL_STATUSES as readonly string[]).includes(s)
}

// Filter pass for workflow rows. Priority / owner / tag don't apply
// (workflows have none of these), so they always pass those dimensions.
function passesWorkflowFilters(i: WorkflowInstance, f: TaskFilters): boolean {
  if (isKnownStatus(i.status) && f.excludedStatuses.includes(i.status)) return false
  if (i.categoryId !== null && f.excludedCategoryIds.includes(i.categoryId)) return false
  if (!isInDueRange(i.targetDate, isKnownStatus(i.status) ? i.status : 'WIP', f.dueRange)) return false
  return true
}

export function TaskListView() {
  const [tasks, setTasks]           = useState<Task[]>([])
  const [workflows, setWorkflows]   = useState<WorkflowInstance[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [assignees, setAssignees]   = useState<Assignee[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  const [expandedIds, setExpandedIds]                 = useState<Set<number>>(new Set())
  const [expandedWorkflowIds, setExpandedWorkflowIds] = useState<Set<number>>(new Set())

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
  const [confirmDone, setConfirmDone]     = useState<Task | null>(null)

  // Right-click context menu on task rows.
  const [ctxMenu, setCtxMenu] = useState<{ task: Task; x: number; y: number } | null>(null)

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
        const [t, w, c, a, tg] = await Promise.all([
          window.frame.db.listTasks(),
          window.frame.db.listWorkflowInstances(),
          window.frame.db.listCategories(),
          window.frame.db.listAssignees(),
          window.frame.db.listTags(),
        ])
        if (!cancelled) {
          setTasks(t)
          setWorkflows(w)
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

  // Subtasks of regular tasks (parent_task_id linkage). Used for parent-task
  // nesting and the auto-percent calculation.
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

  // Workflow steps grouped by their parent instance, sorted by step_number.
  // A workflow step is a task with workflow_instance_id set and no parent_task_id.
  const stepsByWorkflowId = useMemo(() => {
    const m = new Map<number, Task[]>()
    for (const t of tasks) {
      if (t.workflowInstanceId !== null && t.parentTaskId === null) {
        const arr = m.get(t.workflowInstanceId) ?? []
        arr.push(t)
        m.set(t.workflowInstanceId, arr)
      }
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.workflowStepNumber ?? 0) - (b.workflowStepNumber ?? 0))
    }
    return m
  }, [tasks])

  const visibleStepsByWorkflowId = useMemo(() => {
    const m = new Map<number, Task[]>()
    for (const [id, steps] of stepsByWorkflowId) {
      m.set(id, steps.filter(s => passesFilters(s, filters)))
    }
    return m
  }, [stepsByWorkflowId, filters])

  // The unified row list: real top-level tasks + synthetic workflow rows.
  const topRows = useMemo<TopRow[]>(() => {
    const rows: TopRow[] = []
    for (const t of tasks) {
      if (t.parentTaskId === null && t.workflowInstanceId === null && passesFilters(t, filters)) {
        rows.push({ kind: 'task', task: t })
      }
    }
    for (const w of workflows) {
      if (passesWorkflowFilters(w, filters)) {
        rows.push({ kind: 'workflow', instance: w })
      }
    }
    if (!filters.sortBy || !filters.sortDir) return rows
    const col = filters.sortBy
    const sorted = [...rows]
    sorted.sort((a, b) => {
      const cmp = compareForSort(a, b, col, allChildrenByParent)
      return filters.sortDir === 'desc' ? -cmp : cmp
    })
    return sorted
  }, [tasks, workflows, filters, allChildrenByParent])

  // Click-to-cycle: unsorted → asc → desc → unsorted (back to IPC default order).
  const cycleSort = (col: NonNullable<SortColumn>) => {
    setFiltersState(prev => {
      if (prev.sortBy !== col) return { ...prev, sortBy: col, sortDir: 'asc' }
      if (prev.sortDir === 'asc') return { ...prev, sortDir: 'desc' }
      return { ...prev, sortBy: null, sortDir: null }
    })
    setActivePresetId(null)
  }

  const totalTopLevelTasks = useMemo(
    () => tasks.filter(t => t.parentTaskId === null && t.workflowInstanceId === null).length,
    [tasks]
  )

  const visibleTopLevelTaskCount = useMemo(
    () => topRows.filter(r => r.kind === 'task').length,
    [topRows]
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
      return [{ key: 'all', label: '', rows: topRows }]
    }
    const buckets = new Map<string, { label: string; sortKey: string; rows: TopRow[] }>()
    for (const r of topRows) {
      const { key, label, sortKey } = groupKeyFor(r, groupBy, categories)
      if (!buckets.has(key)) buckets.set(key, { label, sortKey, rows: [] })
      buckets.get(key)!.rows.push(r)
    }
    return [...buckets.entries()]
      .sort((a, b) => a[1].sortKey.localeCompare(b[1].sortKey))
      .map(([key, v]) => ({ key, label: v.label, rows: v.rows }))
  }, [topRows, groupBy, categories])

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

  const toggleWorkflowExpand = (id: number) => {
    setExpandedWorkflowIds(prev => {
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

  const markDone = async (task: Task, completedDate: string, note: string) => {
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
      for (const r of g.rows) {
        if (r.kind === 'task') {
          flat.push(r.task)
          for (const c of (childrenByParent.get(r.task.id) ?? [])) flat.push(c)
        } else {
          for (const s of (visibleStepsByWorkflowId.get(r.instance.id) ?? [])) flat.push(s)
        }
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

  const workflowCount = topRows.filter(r => r.kind === 'workflow').length

  return (
    <div className="task-view">
      <header className="view-header view-header-row">
        <div>
          <h1>Task List</h1>
          <p className="muted compact">
            {visibleTopLevelTaskCount} of {totalTopLevelTasks} task{totalTopLevelTasks === 1 ? '' : 's'}
            {workflowCount > 0 && ` · ${workflowCount} workflow${workflowCount === 1 ? '' : 's'}`}
          </p>
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

      {topRows.length === 0 ? (
        <div className="view-empty">
          <p className="muted">
            {totalTopLevelTasks === 0 && workflows.length === 0
              ? 'No tasks yet. Click "Add task" to create one, or start a workflow from the Workflows view.'
              : 'No tasks match the current filter.'}
          </p>
        </div>
      ) : (
        <div className="task-table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <SortTh col="category" sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="11rem">Category</SortTh>
                <SortTh col="title"    sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort}>Title</SortTh>
                <SortTh col="status"   sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="7rem">Status</SortTh>
                <SortTh col="percent"  sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="7.5rem" align="right">%</SortTh>
                <SortTh col="priority" sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="4rem">Pri</SortTh>
                <SortTh col="due"      sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="8rem">Due</SortTh>
                <SortTh col="owner"    sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="8rem">Owner</SortTh>
                <SortTh col="team"     sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="9rem">Team</SortTh>
                <SortTh col="tags"     sortBy={filters.sortBy} sortDir={filters.sortDir} onClick={cycleSort} width="11rem">Tags</SortTh>
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
                        <td colSpan={9}>
                          <span className={`group-header-chevron ${collapsed ? '' : 'group-header-chevron-open'}`}>▶</span>
                          <span className="group-header-label">{g.label}</span>
                          <span className="group-header-count muted">({g.rows.length})</span>
                        </td>
                      </tr>
                    )}
                    {!collapsed && g.rows.map(r => {
                      if (r.kind === 'task') {
                        const t = r.task
                        const children = childrenByParent.get(t.id) ?? []
                        const isExpanded = expandedIds.has(t.id)
                        return (
                          <RowGroup
                            key={`t-${t.id}`}
                            task={t}
                            children={children}
                            isExpanded={isExpanded}
                            categoryColour={categories.find(c => c.id === t.categoryId)?.colour ?? null}
                            onToggle={() => toggleExpand(t.id)}
                            onOpen={(target) => setModal({ kind: 'edit', task: target })}
                            onAddSubtask={() => setModal({ kind: 'add-subtask', parent: t })}
                            onContextMenu={(target, x, y) => setCtxMenu({ task: target, x, y })}
                          />
                        )
                      }
                      const inst = r.instance
                      const steps = visibleStepsByWorkflowId.get(inst.id) ?? []
                      const isExpanded = expandedWorkflowIds.has(inst.id)
                      return (
                        <WorkflowRowGroup
                          key={`w-${inst.id}`}
                          instance={inst}
                          steps={steps}
                          isExpanded={isExpanded}
                          categoryColour={categories.find(c => c.id === inst.categoryId)?.colour ?? null}
                          onToggle={() => toggleWorkflowExpand(inst.id)}
                          onOpenStep={(target) => setModal({ kind: 'edit', task: target })}
                          onContextMenu={(target, x, y) => setCtxMenu({ task: target, x, y })}
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
          onAddSubtask={
            modal.kind === 'edit' && modal.task.parentTaskId === null && modal.task.workflowInstanceId === null
              ? () => setModal({ kind: 'add-subtask', parent: modal.task })
              : undefined
          }
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

      {confirmDone && (
        <MarkDoneDialog
          taskTitle={confirmDone.title}
          onCancel={() => setConfirmDone(null)}
          onConfirm={(date, note) => markDone(confirmDone, date, note)}
        />
      )}

      {ctxMenu && (() => {
        const t       = ctxMenu.task
        const isDone  = t.status === 'DONE'
        // Subtasks aren't allowed on subtasks, and (for now) not on workflow
        // step-tasks either — keeps the nesting depth manageable.
        const canSub  = t.parentTaskId === null && t.workflowInstanceId === null
        const openCount = openSubtaskCount(allChildrenByParent.get(t.id) ?? [])
        const blockedFromDone = !isDone && openCount > 0
        const markLabel = isDone
          ? 'Mark not done'
          : blockedFromDone
            ? `Mark done (${openCount} open subtask${openCount === 1 ? '' : 's'})`
            : 'Mark done'
        const items: ContextMenuItem[] = [
          { kind: 'item', label: 'Open',        onSelect: () => setModal({ kind: 'edit', task: t }) },
          { kind: 'item', label: 'Add subtask', onSelect: () => setModal({ kind: 'add-subtask', parent: t }), disabled: !canSub },
          { kind: 'item', label: markLabel,
            disabled: blockedFromDone,
            onSelect: () => isDone ? undone(t) : setConfirmDone(t) },
          { kind: 'divider' },
          { kind: 'item', label: 'Delete…', danger: true, onSelect: () => setConfirmDelete(t) },
        ]
        return (
          <ContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            items={items}
            onClose={() => setCtxMenu(null)}
          />
        )
      })()}
    </div>
  )
}

// ─── Sort + group helpers ───────────────────────────────────────────────────

function compareForSort(
  a: TopRow, b: TopRow,
  col: NonNullable<SortColumn>,
  allChildrenByParent: Map<number, Task[]>,
): number {
  const av = sortKeyForRow(a, col, allChildrenByParent)
  const bv = sortKeyForRow(b, col, allChildrenByParent)
  if (typeof av === 'number' && typeof bv === 'number') return av - bv
  return String(av).localeCompare(String(bv))
}

function sortKeyForRow(
  r: TopRow,
  col: NonNullable<SortColumn>,
  allChildrenByParent: Map<number, Task[]>,
): string | number {
  if (r.kind === 'workflow') {
    const i = r.instance
    switch (col) {
      case 'category': return i.categoryName ?? '~'
      case 'title':    return i.name
      case 'status':   return isKnownStatus(i.status) ? STATUS_SORT_INDEX[i.status] : '5'
      case 'priority': return 'P9'
      case 'due':      return i.targetDate ?? '9999-99-99'
      case 'owner':    return '~'
      case 'team':     return -1
      case 'tags':     return -1
      case 'percent':  return i.percentDone
    }
  }
  const t = r.task
  switch (col) {
    case 'category': return t.categoryName ?? '~'
    case 'title':    return t.title
    case 'status':   return STATUS_SORT_INDEX[t.status]
    case 'priority': return t.priority ?? 'P9'
    case 'due':      return t.dueDate ?? '9999-99-99'
    case 'owner':    return t.primaryOwner ?? '~'
    case 'team':     return t.assignees.length
    case 'tags':     return t.tags.length
    case 'percent':  return effectivePercent(t, allChildrenByParent.get(t.id) ?? [])
  }
}

function groupKeyFor(
  r: TopRow,
  groupBy: 'category' | 'status' | 'owner',
  categories: Category[],
): { key: string; label: string; sortKey: string } {
  if (r.kind === 'workflow') {
    const i = r.instance
    if (groupBy === 'category') {
      const c = categories.find(x => x.id === i.categoryId)
      const label = c?.name ?? '(No category)'
      return {
        key:     c ? `c:${c.id}` : 'c:none',
        label,
        sortKey: c ? String(c.sortOrder ?? 999).padStart(4, '0') + label : 'zzz' + label,
      }
    } else if (groupBy === 'status') {
      if (isKnownStatus(i.status)) {
        return {
          key:     `s:${i.status}`,
          label:   STATUS_LABEL[i.status],
          sortKey: STATUS_SORT_INDEX[i.status] + i.status,
        }
      }
      return {
        key:     `s:${i.status}`,
        label:   i.status,
        sortKey: '9' + i.status,
      }
    }
    return { key: 'o:none', label: '(Unassigned)', sortKey: 'zzz' }
  }
  const t = r.task
  if (groupBy === 'category') {
    const c = categories.find(x => x.id === t.categoryId)
    const label = c?.name ?? '(No category)'
    return {
      key:     c ? `c:${c.id}` : 'c:none',
      label,
      sortKey: c ? String(c.sortOrder ?? 999).padStart(4, '0') + label : 'zzz' + label,
    }
  } else if (groupBy === 'status') {
    return {
      key:     `s:${t.status}`,
      label:   STATUS_LABEL[t.status],
      sortKey: STATUS_SORT_INDEX[t.status] + t.status,
    }
  }
  return {
    key:     t.primaryOwner ? `o:${t.primaryOwner}` : 'o:none',
    label:   t.primaryOwner ?? '(Unassigned)',
    sortKey: t.primaryOwner ? '0' + t.primaryOwner : 'zzz',
  }
}

// ─── Sub-components ─────────────────────────────────────────────────────────

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
  onToggle, onOpen, onAddSubtask, onContextMenu,
}: {
  task:           Task
  children:       Task[]
  isExpanded:     boolean
  categoryColour: string | null
  onToggle:       () => void
  onOpen:         (t: Task) => void
  onAddSubtask:   () => void
  onContextMenu:  (t: Task, x: number, y: number) => void
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
        onContextMenu={(x, y) => onContextMenu(task, x, y)}
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
          onContextMenu={(x, y) => onContextMenu(c, x, y)}
          displayPercent={c.percentComplete}
          percentMode="leaf"
        />
      ))}
      {isExpanded && (
        <tr className="add-subtask-row">
          <td></td>
          <td colSpan={8}>
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

function WorkflowRowGroup({
  instance, steps, isExpanded, categoryColour,
  onToggle, onOpenStep, onContextMenu,
}: {
  instance:       WorkflowInstance
  steps:          Task[]
  isExpanded:     boolean
  categoryColour: string | null
  onToggle:       () => void
  onOpenStep:     (t: Task) => void
  onContextMenu:  (t: Task, x: number, y: number) => void
}) {
  const status = isKnownStatus(instance.status) ? instance.status : 'WIP'
  const overdue = isOverdue(instance.targetDate, status)
  const titleSuffix = [
    instance.gateType   ? `(${instance.gateType})`         : null,
    instance.projectRef ? `· ${instance.projectRef}`        : null,
  ].filter(Boolean).join(' ')

  return (
    <>
      <tr
        className="task-row task-row-workflow"
        onClick={onToggle}
      >
        <td>
          <span className="category-cell">
            <span className="category-dot" style={{ background: categoryColour ?? 'var(--muted)' }} />
            <span className="category-name">{instance.categoryName ?? instance.templateName ?? '—'}</span>
          </span>
        </td>
        <td className="task-title-cell">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              type="button"
              className={`expand-chevron ${isExpanded ? 'expand-chevron-open' : ''}`}
              onClick={e => { e.stopPropagation(); onToggle() }}
              aria-label={isExpanded ? 'Collapse workflow' : 'Expand workflow'}
            >▶</button>
            <span className="workflow-row-badge">Workflow</span>
            <strong>{instance.name}</strong>
            {titleSuffix && <span className="muted compact">{titleSuffix}</span>}
          </span>
        </td>
        <td><StatusPill status={status} /></td>
        <td style={{ textAlign: 'right' }}>
          <span className="percent-cell">
            <span className="percent-bar">
              <span
                className={`percent-bar-fill ${instance.percentDone === 100 ? 'is-done' : ''}`}
                style={{ width: `${instance.percentDone}%` }}
              />
            </span>
            <span className="percent-cell-num">{instance.percentDone}</span>
            <span
              className="percent-mode-badge percent-mode-auto"
              title={`${instance.doneSteps}/${instance.totalSteps} steps complete`}
            >W</span>
          </span>
        </td>
        <td><span className="muted">—</span></td>
        <td className={overdue ? 'overdue' : ''}>{formatDate(instance.targetDate)}</td>
        <td><span className="muted">—</span></td>
        <td><span className="muted">—</span></td>
        <td><span className="muted">—</span></td>
      </tr>
      {isExpanded && steps.map(s => (
        <TaskRow
          key={s.id}
          task={s}
          depth={1}
          canExpand={false}
          isExpanded={false}
          onToggle={() => {}}
          categoryColour={categoryColour}
          onOpen={() => onOpenStep(s)}
          onContextMenu={(x, y) => onContextMenu(s, x, y)}
          displayPercent={s.percentComplete}
          percentMode="leaf"
          stepNumber={s.workflowStepNumber}
        />
      ))}
    </>
  )
}

function TaskRow({
  task, depth, canExpand, isExpanded, onToggle,
  categoryColour, onOpen, onContextMenu,
  displayPercent, percentMode, stepNumber,
}: {
  task:            Task
  depth:           number
  canExpand:       boolean
  isExpanded:      boolean
  onToggle:        () => void
  categoryColour:  string | null
  onOpen:          () => void
  onContextMenu:   (x: number, y: number) => void
  displayPercent:  number
  percentMode:     'auto' | 'manual' | 'leaf'
  stepNumber?:     number | null
}) {
  const overdue = isOverdue(task.dueDate, task.status)
  const isDone  = task.status === 'DONE'
  const isSubtask = depth > 0

  return (
    <tr
      className={`task-row ${isDone ? 'task-row-done' : ''} ${isSubtask ? 'task-row-subtask' : ''}`}
      onClick={onOpen}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e.clientX, e.clientY) }}
    >
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
          {stepNumber != null && (
            <span className="workflow-step-number muted compact">{stepNumber}.</span>
          )}
          {task.title}
        </span>
      </td>
      <td><StatusPill status={task.status} /></td>
      <td style={{ textAlign: 'right' }}>
        <span className="percent-cell">
          <span className="percent-bar">
            <span
              className={`percent-bar-fill ${displayPercent === 100 ? 'is-done' : ''}`}
              style={{ width: `${displayPercent}%` }}
            />
          </span>
          <span className="percent-cell-num">{displayPercent}</span>
          {percentMode === 'auto'   && <span className="percent-mode-badge percent-mode-auto" title="Auto-computed from subtasks">A</span>}
          {percentMode === 'manual' && <span className="percent-mode-badge percent-mode-manual" title="Manually overridden">M</span>}
        </span>
      </td>
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
