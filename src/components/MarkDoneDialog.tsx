import { useEffect, useRef, useState } from 'react'
import { todayIso } from '../lib/date'

type Props = {
  taskTitle: string
  // When provided, an extra "Create next occurrence?" tickbox is shown,
  // pre-set to this default. The boolean comes back as the 3rd arg to
  // onConfirm. Omit for non-recurring tasks.
  autoCreateNext?: boolean
  onCancel:  () => void
  onConfirm: (completedDate: string, note: string, createNext?: boolean) => void
}

export function MarkDoneDialog({ taskTitle, autoCreateNext, onCancel, onConfirm }: Props) {
  const [completedDate, setCompletedDate] = useState(todayIso())
  const [note, setNote]                   = useState('')
  const [createNext, setCreateNext]       = useState<boolean>(autoCreateNext ?? false)
  const [error, setError]                 = useState<string | null>(null)
  const [submitting, setSubmitting]       = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const showCreateNext = autoCreateNext !== undefined

  useEffect(() => { taRef.current?.focus() }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    if (!completedDate) { setError('Completion date is required.'); return }
    setSubmitting(true)
    onConfirm(completedDate, note.trim(), showCreateNext ? createNext : undefined)
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card">
        <p className="panel-label">Confirm</p>
        <h3>Mark "{taskTitle}" done?</h3>
        {error && <div className="setup-error">{error}</div>}
        <form onSubmit={submit} className="task-form">
          <label className="form-field">
            <span>Completed</span>
            <input
              type="date"
              value={completedDate}
              onChange={e => setCompletedDate(e.target.value)}
              min="2020-01-01"
              required
            />
          </label>
          <label className="form-field">
            <span>Note <em className="muted compact">(optional — saved to the task's notes)</em></span>
            <textarea
              ref={taRef}
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="What happened? Outcome, links, follow-ups…"
            />
          </label>
          {showCreateNext && (
            <label className="inherit-tickbox">
              <input
                type="checkbox"
                checked={createNext}
                onChange={e => setCreateNext(e.target.checked)}
              />
              <span>Create the next occurrence after marking this done</span>
            </label>
          )}
          <div className="dialog-actions">
            <button type="button" className="chip" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? 'Marking…' : 'Mark done'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
