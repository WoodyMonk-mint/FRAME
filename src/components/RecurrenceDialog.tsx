import { useEffect, useRef, useState } from 'react'
import type {
  Assignee, Category, NewRecurrenceInput, NewSubtaskTemplateInput,
  Priority, RecurrenceUnit, Task,
} from '../types'
import { ALL_PRIORITIES, RECURRENCE_UNITS } from '../types'
import { todayIso } from '../lib/date'
import { TagInput } from './TagInput'

const UNIT_LABEL_SINGULAR: Record<RecurrenceUnit, string> = {
  day:   'day',
  week:  'week',
  month: 'month',
  year:  'year',
}
const UNIT_LABEL_PLURAL: Record<RecurrenceUnit, string> = {
  day:   'days',
  week:  'weeks',
  month: 'months',
  year:  'years',
}

type CreateProps = {
  mode:           'create'
  categories:     Category[]
  assignees:      Assignee[]
  tagSuggestions: string[]
  onCancel:       () => void
  onSubmit:       (input: NewRecurrenceInput) => Promise<void>
}

type EditProps = {
  mode:           'edit'
  template:       Task
  categories:     Category[]
  assignees:      Assignee[]
  tagSuggestions: string[]
  onCancel:       () => void
  onSubmit:       (patch: NewRecurrenceInput) => Promise<void>
}

type Props = CreateProps | EditProps

export function RecurrenceDialog(props: Props) {
  const isEdit = props.mode === 'edit'
  const t = isEdit ? props.template : null

  const [title, setTitle]                       = useState(t?.title ?? '')
  const [description, setDescription]           = useState(t?.description ?? '')
  const [categoryId, setCategoryId]             = useState<number | null>(
    t?.categoryId ?? (props.categories[0]?.id ?? null)
  )
  const [priority, setPriority]                 = useState<Priority | null>(t?.priority ?? null)
  const [primaryOwner, setPrimaryOwner]         = useState<string | null>(t?.primaryOwner ?? null)
  const [team, setTeam] = useState<string[]>(() => {
    const existing = t?.assignees ?? []
    const owner    = t?.primaryOwner
    if (owner && !existing.includes(owner)) return [...existing, owner]
    return existing
  })
  const [tags, setTags]                         = useState<string[]>(t?.tags ?? [])
  const [dueDate, setDueDate]                   = useState(t?.dueDate ?? todayIso())
  const [recurrenceUnit, setRecurrenceUnit]     = useState<RecurrenceUnit>(t?.recurrenceUnit ?? 'week')
  const [recurrenceInterval, setRecurrenceInterval] = useState<number>(t?.recurrenceInterval ?? 1)
  const [autoCreateNext, setAutoCreateNext]     = useState<boolean>(t?.autoCreateNext ?? true)
  // Checklist subtasks — create mode only. Edit mode manages them in the
  // detail view (we'd need to fetch + diff existing subtask rows here).
  const [subtaskDrafts, setSubtaskDrafts]       = useState<NewSubtaskTemplateInput[]>([])

  const [error, setError]                       = useState<string | null>(null)
  const [saving, setSaving]                     = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  // Owner auto-joins team.
  useEffect(() => {
    if (primaryOwner) setTeam(t => t.includes(primaryOwner) ? t : [...t, primaryOwner])
  }, [primaryOwner])

  const toggleTeam = (n: string) =>
    setTeam(t => t.includes(n) ? t.filter(x => x !== n) : [...t, n])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!title.trim())                          { setError('Title is required.'); return }
    if (!dueDate)                               { setError('First due date is required.'); return }
    if (!recurrenceUnit)                        { setError('Pick a recurrence unit.'); return }
    if (!recurrenceInterval || recurrenceInterval < 1) {
      setError('Recurrence interval must be at least 1.'); return
    }
    setSaving(true)
    try {
      const payload: NewRecurrenceInput = {
        title:              title.trim(),
        description:        description.trim() || null,
        categoryId,
        priority,
        primaryOwner,
        assignees:          team,
        tags,
        dueDate,
        recurrenceUnit,
        recurrenceInterval,
        autoCreateNext,
        subtasks:           isEdit ? undefined : subtaskDrafts
          .map(s => ({ ...s, title: s.title.trim() }))
          .filter(s => s.title.length > 0),
      }
      await props.onSubmit(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const unitLabel = recurrenceInterval === 1
    ? UNIT_LABEL_SINGULAR[recurrenceUnit]
    : UNIT_LABEL_PLURAL[recurrenceUnit]

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card task-modal">
        <p className="panel-label">{isEdit ? 'Edit recurring task' : 'New recurring task'}</p>
        <h3>{isEdit ? title || 'Edit recurring task' : 'Set up a recurring task'}</h3>

        {error && <div className="setup-error">{error}</div>}

        <form onSubmit={submit} className="task-form">
          <label className="form-field">
            <span>Title</span>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Weekly status report"
              required
            />
          </label>

          <div className="form-row">
            <label className="form-field">
              <span>Category</span>
              <select value={categoryId ?? ''} onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— None —</option>
                {props.categories.filter(c => !c.isArchived).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Priority</span>
              <select value={priority ?? ''} onChange={e => setPriority(e.target.value ? e.target.value as Priority : null)}>
                <option value="">— None —</option>
                {ALL_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>Primary owner</span>
              <select value={primaryOwner ?? ''} onChange={e => setPrimaryOwner(e.target.value || null)}>
                <option value="">— Unassigned —</option>
                {props.assignees.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </label>
          </div>

          <div className="form-row">
            <label className="form-field">
              <span>First due date</span>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} min="2020-01-01" required />
            </label>
            <label className="form-field">
              <span>Repeats every</span>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={recurrenceInterval}
                  onChange={e => setRecurrenceInterval(Math.max(1, Number(e.target.value) || 1))}
                  style={{ width: '4.5rem' }}
                  required
                />
                <select value={recurrenceUnit} onChange={e => setRecurrenceUnit(e.target.value as RecurrenceUnit)}>
                  {RECURRENCE_UNITS.map(u => (
                    <option key={u} value={u}>
                      {recurrenceInterval === 1 ? UNIT_LABEL_SINGULAR[u] : UNIT_LABEL_PLURAL[u]}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>

          <p className="muted compact" style={{ fontSize: '0.75rem' }}>
            Repeats every {recurrenceInterval} {unitLabel}, starting {dueDate || '—'}.
          </p>

          <div className="form-field">
            <span>Team</span>
            <div className="chip-row">
              {props.assignees.map(a => (
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
            <span>Tags <em className="muted compact">(optional)</em></span>
            <TagInput value={tags} onChange={setTags} suggestions={props.tagSuggestions} />
          </div>

          <label className="form-field">
            <span>Description <em className="muted compact">(optional)</em></span>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this recurring task about?"
            />
          </label>

          {!isEdit && (
            <div className="form-field">
              <span>
                Checklist <em className="muted compact">(applied to each new occurrence)</em>
              </span>
              <div className="recurring-subtask-list">
                {subtaskDrafts.map((s, i) => (
                  <div key={i} className="recurring-subtask-row">
                    <input
                      type="text"
                      value={s.title}
                      onChange={e => setSubtaskDrafts(prev => {
                        const next = [...prev]
                        next[i] = { ...next[i], title: e.target.value }
                        return next
                      })}
                      placeholder="e.g. Gather metrics"
                    />
                    <button
                      type="button"
                      className="delete-icon-btn"
                      onClick={() => setSubtaskDrafts(prev => prev.filter((_, j) => j !== i))}
                      aria-label="Remove this subtask"
                      title="Remove"
                    >×</button>
                  </div>
                ))}
                <button
                  type="button"
                  className="chip"
                  onClick={() => setSubtaskDrafts(prev => [...prev, { title: '' }])}
                >+ Add to checklist</button>
              </div>
            </div>
          )}

          <label className="inherit-tickbox">
            <input
              type="checkbox"
              checked={autoCreateNext}
              onChange={e => setAutoCreateNext(e.target.checked)}
            />
            <span>Auto-create the next occurrence when one is marked done</span>
          </label>

          <div className="dialog-actions">
            <button type="button" className="chip" onClick={props.onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save' : 'Create recurring task')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
