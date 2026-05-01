import { useEffect, useRef, useState } from 'react'
import type { Assignee, NewWorkflowStepInput, Priority } from '../types'
import { ALL_PRIORITIES } from '../types'

type Props = {
  assignees: Assignee[]
  onCancel:  () => void
  onSubmit:  (input: NewWorkflowStepInput) => Promise<void>
}

// Ad-hoc step gets is_deviation=1 by definition, so the reason is required.
export function AddStepDialog({ assignees, onCancel, onSubmit }: Props) {
  const [title, setTitle]                 = useState('')
  const [primaryOwner, setPrimaryOwner]   = useState<string | null>(null)
  const [priority, setPriority]           = useState<Priority | null>(null)
  const [dueDate, setDueDate]             = useState('')
  const [description, setDescription]     = useState('')
  const [error, setError]                 = useState<string | null>(null)
  const [saving, setSaving]               = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!title.trim())  { setError('Title is required.'); return }
    setSaving(true)
    try {
      await onSubmit({
        title:           title.trim(),
        description:     description.trim() || null,
        primaryOwner,
        priority,
        dueDate:         dueDate || null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-card task-modal" onClick={e => e.stopPropagation()}>
        <p className="panel-label">New step</p>
        <h3>Add an ad-hoc step</h3>
        <p className="muted compact" style={{ marginBottom: '0.5rem' }}>
          This step isn't in the template, so it'll be flagged as a deviation. Add context in the description if useful.
        </p>

        {error && <div className="setup-error">{error}</div>}

        <form onSubmit={submit} className="task-form">
          <label className="form-field">
            <span>Title</span>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What is the new step?"
              required
            />
          </label>

          <div className="form-row">
            <label className="form-field">
              <span>Primary owner</span>
              <select value={primaryOwner ?? ''} onChange={e => setPrimaryOwner(e.target.value || null)}>
                <option value="">— Unassigned —</option>
                {assignees.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
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
              <span>Due date</span>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} min="2020-01-01" />
            </label>
          </div>

          <label className="form-field">
            <span>Description <em className="muted compact">(optional)</em></span>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this step about? Why was it added?"
            />
          </label>

          <div className="dialog-actions">
            <button type="button" className="chip" onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Adding…' : 'Add step'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
