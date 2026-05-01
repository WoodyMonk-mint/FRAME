import { useEffect, useState } from 'react'
import type { WorkflowNote } from '../types'
import { formatRelativeTime } from '../lib/date'

type Props = {
  instanceId: number
}

// Append-only activity feed. Notes are insert-only — no edit, no delete.
// Author defaults to "user" since FRAME has no current-user concept yet.
export function WorkflowNotesFeed({ instanceId }: Props) {
  const [notes, setNotes]       = useState<WorkflowNote[]>([])
  const [draft, setDraft]       = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [posting, setPosting]   = useState(false)
  const [loading, setLoading]   = useState(true)

  const reload = async () => {
    setError(null)
    try {
      const list = await window.frame.db.listWorkflowNotes(instanceId)
      setNotes(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [instanceId])

  const post = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.trim() || posting) return
    setPosting(true)
    setError(null)
    try {
      const r = await window.frame.db.addWorkflowNote(instanceId, draft.trim(), 'user')
      if (!r.ok) { setError(r.error ?? 'Post failed'); return }
      setDraft('')
      await reload()
    } finally {
      setPosting(false)
    }
  }

  return (
    <section className="workflow-notes">
      <h2 className="workflow-notes-heading">Activity</h2>

      <form onSubmit={post} className="workflow-note-form">
        <textarea
          rows={2}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Post an update — decisions, links, status…"
        />
        <div className="workflow-note-form-actions">
          <button type="submit" className="primary-button" disabled={posting || !draft.trim()}>
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>

      {error && <div className="setup-error">{error}</div>}

      {loading ? (
        <p className="muted compact">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="muted compact">No activity yet.</p>
      ) : (
        <ul className="workflow-note-list">
          {notes.map(n => (
            <li key={n.id} className="workflow-note">
              <div className="workflow-note-meta">
                <strong>{n.author ?? 'unknown'}</strong>
                <span className="muted compact"> · {formatRelativeTime(n.createdAt)}</span>
              </div>
              <p className="workflow-note-body">{n.note}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
