import { useEffect, useRef, useState } from 'react'

type TagUsage = { tag: string; taskCount: number; workflowCount: number }

export function TagsPanel() {
  const [items, setItems]     = useState<TagUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [renaming, setRenaming] = useState<TagUsage | null>(null)

  const reload = async () => {
    setError(null)
    try {
      setItems(await window.frame.db.listTagUsage())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

  if (loading) return <p className="muted compact">Loading…</p>

  return (
    <div className="settings-section">
      <p className="muted compact">
        Tags are free-form and are created on tasks/workflows directly. Rename here to consolidate
        — if you rename to an existing tag, it merges. Empty tags are removed automatically.
      </p>

      {error && <div className="setup-error">{error}</div>}

      {items.length === 0 ? (
        <p className="muted compact">No tags in use yet.</p>
      ) : (
        <table className="task-table settings-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th style={{ width: '8rem' }}>On tasks</th>
              <th style={{ width: '10rem' }}>On workflows</th>
              <th style={{ width: '10rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(t => (
              <tr key={t.tag} className="task-row">
                <td><span className="tag-chip-static">{t.tag}</span></td>
                <td>{t.taskCount}</td>
                <td>{t.workflowCount}</td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="chip" onClick={() => setRenaming(t)}>Rename / merge</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {renaming && (
        <RenameTagDialog
          source={renaming}
          existing={items.map(i => i.tag).filter(t => t !== renaming.tag)}
          onCancel={() => setRenaming(null)}
          onSubmit={async (newTag) => {
            const r = await window.frame.db.renameTag(renaming.tag, newTag)
            if (!r.ok) throw new Error(r.error ?? 'Rename failed')
            setRenaming(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}

function RenameTagDialog({
  source, existing, onCancel, onSubmit,
}: {
  source:   TagUsage
  existing: string[]
  onCancel: () => void
  onSubmit: (newTag: string) => Promise<void>
}) {
  const [next, setNext]     = useState(source.tag)
  const [error, setError]   = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!next.trim()) { setError('New tag is required.'); return }
    setSaving(true)
    try {
      await onSubmit(next.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const merging = existing.includes(next.trim()) && next.trim() !== source.tag

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card">
        <p className="panel-label">Rename tag</p>
        <h3>Rename "{source.tag}"</h3>

        {error && <div className="setup-error">{error}</div>}

        <form onSubmit={submit} className="task-form">
          <label className="form-field">
            <span>New name</span>
            <input
              ref={ref}
              type="text"
              value={next}
              onChange={e => setNext(e.target.value)}
              required
            />
          </label>

          {merging && (
            <p className="muted compact">
              <strong>"{next.trim()}"</strong> already exists. Confirming will merge "{source.tag}" into it.
            </p>
          )}

          <div className="dialog-actions">
            <button type="button" className="chip" onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving || !next.trim() || next.trim() === source.tag}>
              {saving ? 'Saving…' : (merging ? 'Merge' : 'Rename')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
