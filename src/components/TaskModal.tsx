import { useEffect, useState } from 'react'
import type { Assignee, Category, Priority, Status, Task, TaskInput } from '../types'
import { ALL_PRIORITIES, ALL_STATUSES } from '../types'
import { todayIso } from '../lib/date'
import { computeAutoPercent } from '../lib/percent'
import { TagInput } from './TagInput'

type Props = {
  mode:           'add' | 'edit'
  task?:          Task
  parent?:        Task          // when adding a subtask
  childCount?:    number        // when editing a parent
  autoChildren?:  Task[]        // for displaying live auto value
  categories:     Category[]
  assignees:      Assignee[]
  tagSuggestions: string[]
  onCancel:       () => void
  onSave:         (input: TaskInput, options: { setCompletedToToday: boolean }) => Promise<void>
  onDelete?:      () => void
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
  mode, task, parent, childCount = 0, autoChildren = [],
  categories, assignees, tagSuggestions,
  onCancel, onSave, onDelete,
}: Props) {
  const [title, setTitle]                   = useState(task?.title ?? '')
  const [categoryId, setCategoryId]         = useState<number | null>(
    task?.categoryId ?? parent?.categoryId ?? (categories[0]?.id ?? null)
  )
  const [primaryOwner, setPrimaryOwner]     = useState<string | null>(task?.primaryOwner ?? null)
  const [team, setTeam] = useState<string[]>(() => {
    const existing = task?.assignees ?? []
    const owner    = task?.primaryOwner
    if (owner && !existing.includes(owner)) return [...existing, owner]
    return existing
  })
  const [tags, setTags]                     = useState<string[]>(task?.tags ?? [])
  const [status, setStatus]                 = useState<Status>(task?.status ?? 'PLANNING')
  const [priority, setPriority]             = useState<Priority | null>(task?.priority ?? null)
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

    setSaving(true)
    try {
      const wasDone = task?.status === 'DONE'
      const becomingDone = status === 'DONE' && !wasDone
      // For a parent in auto mode, save the live auto value to keep stored
      // percent_complete reasonable for analytics; the manual flag stays off.
      const finalPercent = (hasChildren && !percentManual) ? autoValue : percentComplete
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
      }, { setCompletedToToday: becomingDone })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const headlineLabel = (() => {
    if (mode === 'add' && parent) return 'New subtask'
    if (mode === 'add')           return 'New task'
    return 'Edit task'
  })()

  const headlineTitle = (() => {
    if (mode === 'add')   return parent ? 'Add subtask' : 'Add task'
    return title || 'Edit task'
  })()

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-card task-modal" onClick={e => e.stopPropagation()}>
        <p className="panel-label">{headlineLabel}</p>
        <h3>{headlineTitle}</h3>
        {parent && (
          <p className="muted compact subtask-context">
            Subtask of <strong>{parent.title}</strong>
          </p>
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

          <div className="dialog-actions">
            {mode === 'edit' && onDelete && (
              <button type="button" className="chip chip--danger" onClick={onDelete} disabled={saving} style={{ marginRight: 'auto' }}>
                Delete
              </button>
            )}
            <button type="button" className="chip" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Saving…' : (mode === 'add' ? (parent ? 'Add subtask' : 'Add task') : 'Save')}
            </button>
          </div>
          <p className="muted compact" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {status === 'DONE' && task?.status !== 'DONE' && `Will set completed date to ${todayIso()}.`}
          </p>
        </form>
      </div>
    </div>
  )
}
