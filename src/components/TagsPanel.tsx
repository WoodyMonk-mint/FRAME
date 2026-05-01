import { useEffect, useRef, useState } from 'react'

type TagUsage = { tag: string; taskCount: number; workflowCount: number; inLibrary: boolean }

export function TagsPanel() {
  const [items, setItems]     = useState<TagUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [renaming, setRenaming] = useState<TagUsage | null>(null)
  const [adding, setAdding]     = useState(false)

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

  const onDelete = async (tag: string) => {
    setError(null)
    const r = await window.frame.db.deleteTag(tag)
    if (!r.ok) { setError(r.error ?? 'Delete failed'); return }
    await reload()
  }

  if (loading) return <p className="muted compact">Loading…</p>

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <p className="muted compact">
          Tags are free-form. Add to the library here to make them available as suggestions
          everywhere. Rename to consolidate — renaming to an existing tag merges. Library entries
          can be deleted; tags actually applied to tasks or workflows can only be renamed/merged.
        </p>
        <button className="chip" onClick={() => setAdding(true)}>+ Add tag</button>
      </div>

      {error && <div className="setup-error">{error}</div>}

      {items.length === 0 ? (
        <p className="muted compact">No tags yet — add one to start a library.</p>
      ) : (
        <table className="task-table settings-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th style={{ width: '7rem' }}>On tasks</th>
              <th style={{ width: '9rem' }}>On workflows</th>
              <th style={{ width: '7rem' }}>Library</th>
              <th style={{ width: '14rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(t => {
              const inUse = t.taskCount > 0 || t.workflowCount > 0
              return (
                <tr key={t.tag} className="task-row">
                  <td><span className="tag-chip-static">{t.tag}</span></td>
                  <td>{t.taskCount}</td>
                  <td>{t.workflowCount}</td>
                  <td>
                    {t.inLibrary
                      ? <span>Registered</span>
                      : <span className="muted compact">Implicit</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="chip" onClick={() => setRenaming(t)}>Rename / merge</button>
                    {t.inLibrary && !inUse && (
                      <>
                        {' '}
                        <button type="button" className="chip chip--danger" onClick={() => onDelete(t.tag)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {adding && (
        <AddTagDialog
          existing={items.map(i => i.tag)}
          onCancel={() => setAdding(false)}
          onSubmit={async (name) => {
            const r = await window.frame.db.createTag(name)
            if (!r.ok) throw new Error(r.error ?? 'Add failed')
            setAdding(false)
            await reload()
          }}
        />
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

function AddTagDialog({
  existing, onCancel, onSubmit,
}: {
  existing: string[]
  onCancel: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName]     = useState('')
  const [error, setError]   = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const clean = name.trim()
    if (!clean) { setError('Tag name is required.'); return }
    if (existing.includes(clean)) { setError(`"${clean}" already exists.`); return }
    setSaving(true)
    try {
      await onSubmit(clean)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card">
        <p className="panel-label">New tag</p>
        <h3>Add a tag</h3>
        {error && <div className="setup-error">{error}</div>}
        <form onSubmit={submit} className="task-form">
          <label className="form-field">
            <span>Name</span>
            <input
              ref={ref}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. urgent"
              required
            />
          </label>
          <div className="dialog-actions">
            <button type="button" className="chip" onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Adding…' : 'Add tag'}
            </button>
          </div>
        </form>
      </div>
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
