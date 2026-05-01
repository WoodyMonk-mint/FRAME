import { useEffect, useRef, useState } from 'react'
import type { Assignee } from '../types'

type CreateProps = {
  mode:     'create'
  onCancel: () => void
  onSubmit: (input: { name: string }) => Promise<void>
}

type EditProps = {
  mode:     'edit'
  assignee: Assignee
  onCancel: () => void
  onSubmit: (patch:  { name: string }) => Promise<void>
}

type Props = CreateProps | EditProps

export function AssigneeDialog(props: Props) {
  const isEdit = props.mode === 'edit'
  const initial = isEdit ? props.assignee : null

  const [name, setName]     = useState(initial?.name ?? '')
  const [error, setError]   = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    try {
      await props.onSubmit({ name: name.trim() })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card">
        <p className="panel-label">{isEdit ? 'Edit assignee' : 'New assignee'}</p>
        <h3>{isEdit ? `Edit "${initial?.name ?? ''}"` : 'Add an assignee'}</h3>

        {isEdit && (
          <p className="muted compact">
            Renaming cascades through every task and workflow that referenced the old name.
          </p>
        )}

        {error && <div className="setup-error">{error}</div>}

        <form onSubmit={submit} className="task-form">
          <label className="form-field">
            <span>Name</span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Alex"
              required
            />
          </label>

          <div className="dialog-actions">
            <button type="button" className="chip" onClick={props.onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save' : 'Add assignee')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
