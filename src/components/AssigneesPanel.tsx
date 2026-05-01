import { useEffect, useState } from 'react'
import type { Assignee } from '../types'
import { AssigneeDialog } from './AssigneeDialog'

export function AssigneesPanel() {
  const [items, setItems]     = useState<Assignee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [dialog, setDialog]   = useState<{ kind: 'create' } | { kind: 'edit'; assignee: Assignee } | null>(null)

  const reload = async () => {
    setError(null)
    try {
      setItems(await window.frame.db.listAssignees())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

  const toggleActive = async (a: Assignee) => {
    setError(null)
    const r = await window.frame.db.updateAssignee(a.id, { isActive: !a.isActive })
    if (!r.ok) { setError(r.error ?? 'Toggle failed'); return }
    await reload()
  }

  const move = async (a: Assignee, direction: -1 | 1) => {
    setError(null)
    const sorted = [...items].sort((x, y) =>
      (x.sortOrder ?? 999) - (y.sortOrder ?? 999) || x.name.localeCompare(y.name)
    )
    const i = sorted.findIndex(x => x.id === a.id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= sorted.length) return
    const a1 = sorted[i]
    const a2 = sorted[j]
    const order1 = a1.sortOrder ?? (i + 1)
    const order2 = a2.sortOrder ?? (j + 1)
    const r1 = await window.frame.db.updateAssignee(a1.id, { sortOrder: order2 })
    const r2 = await window.frame.db.updateAssignee(a2.id, { sortOrder: order1 })
    if (!r1.ok || !r2.ok) { setError((r1.ok ? r2 : r1).error ?? 'Reorder failed'); return }
    await reload()
  }

  if (loading) return <p className="muted compact">Loading…</p>

  const sorted = [...items].sort((a, b) =>
    (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name)
  )

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <p className="muted compact">
          Assignees become primary owners and team members on tasks. Renaming cascades through
          every task and workflow that referenced them. Archive instead of removing to keep
          historical references intact.
        </p>
        <button className="chip" onClick={() => setDialog({ kind: 'create' })}>+ Add assignee</button>
      </div>

      {error && <div className="setup-error">{error}</div>}

      <table className="task-table settings-table">
        <thead>
          <tr>
            <th style={{ width: '6rem' }}>Order</th>
            <th>Name</th>
            <th style={{ width: '6rem' }}>Status</th>
            <th style={{ width: '14rem', textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a, idx) => (
            <tr key={a.id} className="task-row">
              <td>
                <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                  <button
                    type="button"
                    className="chip chip--sm"
                    disabled={idx === 0}
                    onClick={() => move(a, -1)}
                    aria-label="Move up"
                  >↑</button>
                  <button
                    type="button"
                    className="chip chip--sm"
                    disabled={idx === sorted.length - 1}
                    onClick={() => move(a, +1)}
                    aria-label="Move down"
                  >↓</button>
                </div>
              </td>
              <td>{a.name}</td>
              <td>
                {a.isActive
                  ? <span>Active</span>
                  : <span className="muted compact">Archived</span>}
              </td>
              <td style={{ textAlign: 'right' }}>
                <button type="button" className="chip" onClick={() => setDialog({ kind: 'edit', assignee: a })}>Edit</button>
                {' '}
                <button type="button" className="chip" onClick={() => toggleActive(a)}>
                  {a.isActive ? 'Archive' : 'Unarchive'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {dialog?.kind === 'create' && (
        <AssigneeDialog
          mode="create"
          onCancel={() => setDialog(null)}
          onSubmit={async ({ name }) => {
            const r = await window.frame.db.createAssignee({ name })
            if (!r.ok) throw new Error(r.error ?? 'Create failed')
            setDialog(null)
            await reload()
          }}
        />
      )}

      {dialog?.kind === 'edit' && (
        <AssigneeDialog
          mode="edit"
          assignee={dialog.assignee}
          onCancel={() => setDialog(null)}
          onSubmit={async ({ name }) => {
            const r = await window.frame.db.updateAssignee(dialog.assignee.id, { name })
            if (!r.ok) throw new Error(r.error ?? 'Save failed')
            setDialog(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}
