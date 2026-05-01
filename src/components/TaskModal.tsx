import { useEffect, useState } from 'react'
import type {
  Assignee, Category, Priority, Status, Task, TaskInput, WorkflowInstance,
} from '../types'
import { ALL_PRIORITIES, ALL_STATUSES } from '../types'
import { todayIso } from '../lib/date'
import { computeAutoPercent, openSubtaskCount } from '../lib/percent'
import { TagInput } from './TagInput'
import { TaskHistoryPanel } from './TaskHistoryPanel'

type Props = {
  mode:           'add' | 'edit'
  task?:          Task
  parent?:        Task          // when adding a subtask
  childCount?:    number        // when editing a parent
  autoChildren?:  Task[]        // for displaying live auto value
  allTasks?:      Task[]        // for the "Blocked by" picker (omit to hide)
  allWorkflows?:  WorkflowInstance[]  // so step rows can show their parent workflow
  categories:     Category[]
  assignees:      Assignee[]
  tagSuggestions: string[]
  onCancel:       () => void
  onSave:         (input: TaskInput, options: { setCompletedToToday: boolean }) => Promise<void>
  onDelete?:      () => void
  onAddSubtask?:  () => void    // shown on edit modal for top-level tasks only
  onOpenTask?:    (t: Task) => void  // jump to another task (used for reverse blocker links)
}

const STATUS_LABEL: Record<Status, string> = {
  PLANNING:  'Planning',
  WIP:       'In progress',
  BLOCKED:   'Blocked',
  ON_HOLD:   'On hold',
  DONE:      'Done',
  CANCELLED: 'Cancelled',
}

export function TaskModal({
  mode, task, parent, childCount = 0, autoChildren = [], allTasks = [], allWorkflows = [],
  categories, assignees, tagSuggestions,
  onCancel, onSave, onDelete, onAddSubtask, onOpenTask,
}: Props) {
  const isAddSubtask = mode === 'add' && !!parent

  // Inheritance defaults: tags + category copy from the parent on first
  // render; owner + priority do not. Each tickbox is a copy-or-clear action;
  // after a toggle the field is independently editable.
  const [inheritTags,     setInheritTags]     = useState(isAddSubtask)
  const [inheritCategory, setInheritCategory] = useState(isAddSubtask)
  const [inheritOwner,    setInheritOwner]    = useState(false)
  const [inheritPriority, setInheritPriority] = useState(false)

  const [title, setTitle]                   = useState(task?.title ?? '')
  const [categoryId, setCategoryId]         = useState<number | null>(
    task?.categoryId ?? (isAddSubtask ? (parent.categoryId ?? null) : (categories[0]?.id ?? null))
  )
  const [primaryOwner, setPrimaryOwner]     = useState<string | null>(task?.primaryOwner ?? null)
  const [team, setTeam] = useState<string[]>(() => {
    const existing = task?.assignees ?? []
    const owner    = task?.primaryOwner
    if (owner && !existing.includes(owner)) return [...existing, owner]
    return existing
  })
  const [tags, setTags]                     = useState<string[]>(
    task?.tags ?? (isAddSubtask ? parent.tags : [])
  )
  const [status, setStatus]                 = useState<Status>(task?.status ?? 'PLANNING')
  const [priority, setPriority]             = useState<Priority | null>(task?.priority ?? null)
  const [blockedByTaskId, setBlockedByTaskId] = useState<number | null>(task?.blockedByTaskId ?? null)
  const [blockedReason, setBlockedReason]     = useState(task?.blockedReason ?? '')

  const onToggleInheritTags = (next: boolean) => {
    setInheritTags(next)
    if (next && parent) setTags(parent.tags)
    else if (!next)     setTags([])
  }
  const onToggleInheritCategory = (next: boolean) => {
    setInheritCategory(next)
    if (next && parent) setCategoryId(parent.categoryId ?? null)
    else if (!next)     setCategoryId(null)
  }
  const onToggleInheritOwner = (next: boolean) => {
    setInheritOwner(next)
    if (next && parent) setPrimaryOwner(parent.primaryOwner ?? null)
    else if (!next)     setPrimaryOwner(null)
  }
  const onToggleInheritPriority = (next: boolean) => {
    setInheritPriority(next)
    if (next && parent) setPriority(parent.priority ?? null)
    else if (!next)     setPriority(null)
  }
  const [dueDate, setDueDate]               = useState(task?.dueDate ?? '')
  const [percentComplete, setPercentComplete] = useState(task?.percentComplete ?? 0)
  const [percentManual, setPercentManual]   = useState<boolean>(task?.percentManual ?? false)
  const [description, setDescription]       = useState(task?.description ?? '')
  const [notes, setNotes]                   = useState(task?.notes ?? '')
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  const hasChildren = childCount > 0
  const autoValue   = hasChildren ? computeAutoPercent(autoChildren) : 0
  const sliderEnabled = !hasChildren || percentManual
  const openChildren  = hasChildren ? openSubtaskCount(autoChildren) : 0
  const blockedFromDone = status === 'DONE' && openChildren > 0

  // Auto-bump % to 100 when marked done; auto-zero when moved back to planning (add only).
  useEffect(() => {
    if (status === 'DONE' && percentComplete < 100) setPercentComplete(100)
    if (status === 'PLANNING' && percentComplete > 0 && mode === 'add') setPercentComplete(0)
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-add the primary owner to the team when it changes.
  useEffect(() => {
    if (primaryOwner) {
      setTeam(t => t.includes(primaryOwner) ? t : [...t, primaryOwner])
    }
  }, [primaryOwner])

  const toggleTeam = (name: string) => {
    setTeam(t => t.includes(name) ? t.filter(x => x !== name) : [...t, name])
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!title.trim()) { setError('Title is required.'); return }
    if (blockedFromDone) {
      setError(`Can't mark Done — ${openChildren} subtask${openChildren === 1 ? '' : 's'} still open. Finish or cancel them first.`)
      return
    }

    setSaving(true)
    try {
      const wasDone = task?.status === 'DONE'
      const becomingDone = status === 'DONE' && !wasDone
      // For a parent in auto mode, save the live auto value to keep stored
      // percent_complete reasonable for analytics; the manual flag stays off.
      const finalPercent = (hasChildren && !percentManual) ? autoValue : percentComplete
      // Blocker fields are only meaningful while status === 'BLOCKED'.
      // Clear them on save otherwise so the data matches the visible state.
      const isBlocked = status === 'BLOCKED'
      await onSave({
        title:           title.trim(),
        categoryId,
        primaryOwner:    primaryOwner ?? null,
        assignees:       team,
        tags,
        status,
        priority,
        dueDate:         dueDate || null,
        percentComplete: finalPercent,
        percentManual,
        description:     description.trim() || null,
        notes:           notes.trim() || null,
        blockedByTaskId: isBlocked ? blockedByTaskId               : null,
        blockedReason:   isBlocked ? (blockedReason.trim() || null) : null,
      }, { setCompletedToToday: becomingDone })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  // Categorise the row being edited so the headline + context line can
  // reflect what kind of task it actually is — workflow step, recurring
  // occurrence, subtask, or plain task.
  const taskKind: 'plain' | 'step' | 'recurring' | 'subtask' = (() => {
    if (mode === 'add') return 'plain'
    if (!task)          return 'plain'
    if (task.workflowInstanceId   != null) return 'step'
    if (task.recurrenceTemplateId != null) return 'recurring'
    if (task.parentTaskId         != null) return 'subtask'
    return 'plain'
  })()

  const parentWorkflow = task?.workflowInstanceId != null
    ? allWorkflows.find(w => w.id === task.workflowInstanceId) ?? null
    : null
  const parentTaskRow = task?.parentTaskId != null
    ? allTasks.find(t => t.id === task.parentTaskId) ?? null
    : null
  const parentTemplate = task?.recurrenceTemplateId != null
    ? allTasks.find(t => t.id === task.recurrenceTemplateId) ?? null
    : null

  const headlineLabel = (() => {
    if (mode === 'add' && parent) return 'New subtask'
    if (mode === 'add')           return 'New task'
    if (taskKind === 'step')      return `Edit step${task?.workflowStepNumber != null ? ` ${task.workflowStepNumber}` : ''}`
    if (taskKind === 'recurring') return 'Edit recurring occurrence'
    if (taskKind === 'subtask')   return 'Edit subtask'
    return 'Edit task'
  })()

  const headlineTitle = (() => {
    if (mode === 'add')   return parent ? 'Add subtask' : 'Add task'
    return title || 'Edit task'
  })()

  // Sub-line under the headline showing parent context. Workflow steps get
  // workflow name + gate + project; subtasks show their parent's title;
  // recurring occurrences show the template they came from.
  const headlineSubline: React.ReactNode = (() => {
    if (mode === 'add' && parent) {
      return <>Subtask of <strong>{parent.title}</strong></>
    }
    if (parentWorkflow) {
      const bits = [
        parentWorkflow.name,
        parentWorkflow.gateType   ? `(${parentWorkflow.gateType})`  : null,
        parentWorkflow.projectRef ? `· ${parentWorkflow.projectRef}` : null,
      ].filter(Boolean).join(' ')
      return <>Step of <strong>{bits}</strong></>
    }
    if (parentTemplate) {
      return <>Occurrence of <strong>{parentTemplate.title}</strong></>
    }
    if (parentTaskRow) {
      return <>Subtask of <strong>{parentTaskRow.title}</strong></>
    }
    return null
  })()

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card task-modal">
        <p className="panel-label">{headlineLabel}</p>
        <h3>{headlineTitle}</h3>
        {headlineSubline && (
          <p className="muted compact subtask-context">
            {headlineSubline}
          </p>
        )}

        {isAddSubtask && (
          <div className="inherit-panel">
            <p className="panel-label">Inherit from parent</p>
            <div className="inherit-row">
              <label className="inherit-tickbox">
                <input type="checkbox" checked={inheritTags}     onChange={e => onToggleInheritTags(e.target.checked)} />
                <span>Tags{parent.tags.length > 0 && <em className="muted compact"> ({parent.tags.length})</em>}</span>
              </label>
              <label className="inherit-tickbox">
                <input type="checkbox" checked={inheritCategory} onChange={e => onToggleInheritCategory(e.target.checked)} />
                <span>Category</span>
              </label>
              <label className="inherit-tickbox">
                <input type="checkbox" checked={inheritOwner}    onChange={e => onToggleInheritOwner(e.target.checked)} />
                <span>Primary owner</span>
              </label>
              <label className="inherit-tickbox">
                <input type="checkbox" checked={inheritPriority} onChange={e => onToggleInheritPriority(e.target.checked)} />
                <span>Priority</span>
              </label>
            </div>
          </div>
        )}

        {error && <div className="setup-error">{error}</div>}

        <form onSubmit={submit} className="task-form">
          <label className="form-field">
            <span>Title</span>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What needs doing?"
              required
            />
          </label>

          <div className="form-row">
            <label className="form-field">
              <span>Category</span>
              <select value={categoryId ?? ''} onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— None —</option>
                {categories.filter(c => !c.isArchived).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Status</span>
              <select value={status} onChange={e => setStatus(e.target.value as Status)}>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>Priority</span>
              <select value={priority ?? ''} onChange={e => setPriority(e.target.value ? e.target.value as Priority : null)}>
                <option value="">— None —</option>
                {ALL_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>

          <div className="form-row">
            <label className="form-field">
              <span>Primary owner</span>
              <select value={primaryOwner ?? ''} onChange={e => setPrimaryOwner(e.target.value || null)}>
                <option value="">— Unassigned —</option>
                {assignees.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>Due date</span>
              <input
                type="date"
                value={dueDate ?? ''}
                onChange={e => setDueDate(e.target.value)}
                min="2020-01-01"
              />
              {dueDate && <button type="button" className="form-clear" onClick={() => setDueDate('')}>clear</button>}
            </label>
          </div>

          {mode === 'edit' && task && (() => {
            // Only count *active* tasks as currently-blocked. DONE / CANCELLED
            // tasks no longer need this one; we ignore stale links.
            const blocking = allTasks.filter(t =>
              t.blockedByTaskId === task.id
              && t.status !== 'DONE'
              && t.status !== 'CANCELLED'
            )
            if (blocking.length === 0) return null
            return (
              <div className="form-field blocking-list-field">
                <span>
                  Blocking {blocking.length} task{blocking.length === 1 ? '' : 's'}
                  <em className="muted compact"> (these are waiting on this one)</em>
                </span>
                <ul className="blocking-list">
                  {blocking.map(t => (
                    <li key={t.id}>
                      {onOpenTask ? (
                        <button type="button" className="blocking-link" onClick={() => onOpenTask(t)}>
                          {t.title}
                        </button>
                      ) : (
                        <span>{t.title}</span>
                      )}
                      {t.blockedReason && (
                        <span className="muted compact"> — {t.blockedReason}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })()}

          {status === 'BLOCKED' && allTasks.length > 0 && (
            <div className="form-row">
              <label className="form-field" style={{ flex: 2 }}>
                <span>Blocked by <em className="muted compact">(optional)</em></span>
                <select
                  value={blockedByTaskId ?? ''}
                  onChange={e => setBlockedByTaskId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">— Not blocked —</option>
                  {allTasks
                    .filter(t => {
                      if (t.id === task?.id) return false
                      if (t.workflowInstanceId !== null) return false
                      if (t.recurrenceUnit !== null && t.recurrenceTemplateId === null) return false
                      // Hide DONE / CANCELLED — a finished task can't be a
                      // blocker. Keep the currently-selected one in the list
                      // even if stale so it doesn't silently vanish.
                      if (t.status === 'DONE' || t.status === 'CANCELLED') {
                        return t.id === blockedByTaskId
                      }
                      return true
                    })
                    .sort((a, b) => a.title.localeCompare(b.title))
                    .map(t => {
                      const stale = t.status === 'DONE' || t.status === 'CANCELLED'
                      return (
                        <option key={t.id} value={t.id}>
                          {t.title}{stale ? ` (${t.status.toLowerCase()})` : ''}
                        </option>
                      )
                    })}
                </select>
              </label>
              <label className="form-field" style={{ flex: 3 }}>
                <span>Blocker reason <em className="muted compact">(optional)</em></span>
                <input
                  type="text"
                  value={blockedReason}
                  onChange={e => setBlockedReason(e.target.value)}
                  placeholder={blockedByTaskId ? 'Why is this blocked?' : 'Or describe a non-task blocker'}
                />
              </label>
            </div>
          )}

          <div className="form-field">
            <span>Team</span>
            <div className="chip-row">
              {assignees.map(a => (
                <button
                  type="button"
                  key={a.id}
                  className={`chip ${team.includes(a.name) ? 'active' : ''}`}
                  onClick={() => toggleTeam(a.name)}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>

          <div className="form-field">
            <span>Tags</span>
            <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
          </div>

          <div className="form-field">
            <span>
              % complete{' '}
              <em className="muted">
                {sliderEnabled ? `${percentComplete}%` : `${autoValue}% (auto)`}
              </em>
            </span>
            {hasChildren && (
              <div className="chip-row" style={{ marginBottom: '0.4rem' }}>
                <button
                  type="button"
                  className={`chip ${!percentManual ? 'active' : ''}`}
                  onClick={() => setPercentManual(false)}
                >Auto from {childCount} subtask{childCount === 1 ? '' : 's'}</button>
                <button
                  type="button"
                  className={`chip ${percentManual ? 'active' : ''}`}
                  onClick={() => setPercentManual(true)}
                >Manual override</button>
              </div>
            )}
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={sliderEnabled ? percentComplete : autoValue}
              onChange={e => setPercentComplete(Number(e.target.value))}
              disabled={!sliderEnabled}
            />
          </div>

          <label className="form-field">
            <span>Description</span>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional — what is this task about?" />
          </label>

          <label className="form-field">
            <span>Notes</span>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional — context, links, decisions" />
          </label>

          {mode === 'edit' && task && (
            <TaskHistoryPanel taskId={task.id} />
          )}

          <div className="dialog-actions">
            {mode === 'edit' && onDelete && (
              <button type="button" className="chip chip--danger" onClick={onDelete} disabled={saving} style={{ marginRight: 'auto' }}>
                Delete
              </button>
            )}
            {mode === 'edit' && onAddSubtask && (
              <button
                type="button"
                className="chip"
                onClick={onAddSubtask}
                disabled={saving}
              >+ Add subtask</button>
            )}
            <button type="button" className="chip" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving || blockedFromDone}>
              {saving ? 'Saving…' : (mode === 'add' ? (parent ? 'Add subtask' : 'Add task') : 'Save')}
            </button>
          </div>
          <p className="muted compact" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {blockedFromDone
              ? `Can't mark Done — ${openChildren} subtask${openChildren === 1 ? '' : 's'} still open.`
              : status === 'DONE' && task?.status !== 'DONE' && `Will set completed date to ${todayIso()}.`}
          </p>
        </form>
      </div>
    </div>
  )
}
