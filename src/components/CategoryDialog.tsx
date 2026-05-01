import { useEffect, useRef, useState } from 'react'
import type { Category } from '../types'

const DEFAULT_COLOUR = '#6366f1'

type CreateProps = {
  mode:     'create'
  onCancel: () => void
  onSubmit: (input: { name: string; colour: string }) => Promise<void>
}

type EditProps = {
  mode:     'edit'
  category: Category
  onCancel: () => void
  onSubmit: (patch:  { name: string; colour: string }) => Promise<void>
}

type Props = CreateProps | EditProps

export function CategoryDialog(props: Props) {
  const isEdit = props.mode === 'edit'
  const initial = isEdit ? props.category : null

  const [name, setName]     = useState(initial?.name ?? '')
  const [colour, setColour] = useState(initial?.colour ?? DEFAULT_COLOUR)
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
      await props.onSubmit({ name: name.trim(), colour })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card">
        <p className="panel-label">{isEdit ? 'Edit category' : 'New category'}</p>
        <h3>{isEdit ? `Edit "${initial?.name ?? ''}"` : 'Add a category'}</h3>

        {error && <div className="setup-error">{error}</div>}

        <form onSubmit={submit} className="task-form">
          <label className="form-field">
            <span>Name</span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Production Analysis"
              required
            />
          </label>

          <label className="form-field">
            <span>Colour</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="color"
                value={colour}
                onChange={e => setColour(e.target.value)}
                style={{ width: '3rem', height: '2rem', padding: 0, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'transparent' }}
              />
              <span className="muted compact">{colour}</span>
            </div>
          </label>

          <div className="dialog-actions">
            <button type="button" className="chip" onClick={props.onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save' : 'Add category')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
