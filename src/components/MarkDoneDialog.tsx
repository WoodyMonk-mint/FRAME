import { useEffect, useRef, useState } from 'react'

type Props = {
  taskTitle: string
  onCancel:  () => void
  onConfirm: (note: string) => void
}

export function MarkDoneDialog({ taskTitle, onCancel, onConfirm }: Props) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { taRef.current?.focus() }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    onConfirm(note.trim())
  }

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-card" onClick={e => e.stopPropagation()}>
        <p className="panel-label">Confirm</p>
        <h3>Mark "{taskTitle}" done?</h3>
        <form onSubmit={submit} className="task-form">
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
