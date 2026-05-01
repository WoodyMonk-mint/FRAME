import { useEffect, useRef, useState } from 'react'
import type { NewPlanningPeriodInput, PlanningPeriod, PlanningPeriodKind } from '../types'

const KIND_OPTIONS: Array<{ value: PlanningPeriodKind; label: string }> = [
  { value: 'sprint',  label: 'Sprint'  },
  { value: 'quarter', label: 'Quarter' },
  { value: 'custom',  label: 'Custom'  },
]

type CreateProps = {
  mode:     'create'
  onCancel: () => void
  onSubmit: (input: NewPlanningPeriodInput) => Promise<void>
}

type EditProps = {
  mode:     'edit'
  period:   PlanningPeriod
  onCancel: () => void
  onSubmit: (patch: NewPlanningPeriodInput) => Promise<void>
}

type Props = CreateProps | EditProps

export function PlanningPeriodDialog(props: Props) {
  const isEdit = props.mode === 'edit'
  const initial = isEdit ? props.period : null

  const [name, setName]       = useState(initial?.name ?? '')
  const [kind, setKind]       = useState<PlanningPeriodKind>(initial?.kind ?? 'sprint')
  const [startDate, setStart] = useState(initial?.startDate ?? '')
  const [endDate, setEnd]     = useState(initial?.endDate ?? '')
  const [notes, setNotes]     = useState(initial?.notes ?? '')
  const [error, setError]     = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim())                            { setError('Name is required.'); return }
    if (!startDate || !endDate)                  { setError('Start and end dates are required.'); return }
    if (startDate > endDate)                     { setError('End date must be on or after start date.'); return }
    setSaving(true)
    try {
      await props.onSubmit({
        name: name.trim(),
        kind,
        startDate,
        endDate,
        notes: notes.trim() || null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card task-modal">
        <p className="panel-label">{isEdit ? 'Edit period' : 'New period'}</p>
        <h3>{isEdit ? `Edit "${initial?.name ?? ''}"` : 'Add a planning period'}</h3>

        {error && <div className="setup-error">{error}</div>}

        <form onSubmit={submit} className="task-form">
          <label className="form-field">
            <span>Name</span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Sprint 41 or Q4 2026"
              required
            />
          </label>

          <div className="form-row">
            <label className="form-field">
              <span>Kind</span>
              <select value={kind} onChange={e => setKind(e.target.value as PlanningPeriodKind)}>
                {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>Start</span>
              <input type="date" value={startDate} onChange={e => setStart(e.target.value)} required />
            </label>
            <label className="form-field">
              <span>End</span>
              <input type="date" value={endDate} onChange={e => setEnd(e.target.value)} required />
            </label>
          </div>

          <label className="form-field">
            <span>Notes <em className="muted compact">(optional)</em></span>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </label>

          <div className="dialog-actions">
            <button type="button" className="chip" onClick={props.onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Saving…' : (isEdit ? 'Save' : 'Add period')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
