import { useEffect, useState } from 'react'
import type { Category } from '../types'
import { CategoryDialog } from './CategoryDialog'

export function CategoriesPanel() {
  const [items, setItems]     = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [dialog, setDialog]   = useState<{ kind: 'create' } | { kind: 'edit'; category: Category } | null>(null)

  const reload = async () => {
    setError(null)
    try {
      setItems(await window.frame.db.listCategories())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

  const toggleArchive = async (c: Category) => {
    setError(null)
    const r = await window.frame.db.updateCategory(c.id, { isArchived: !c.isArchived })
    if (!r.ok) { setError(r.error ?? 'Archive toggle failed'); return }
    await reload()
  }

  const move = async (c: Category, direction: -1 | 1) => {
    setError(null)
    const sorted = [...items].sort((a, b) =>
      (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name)
    )
    const i = sorted.findIndex(x => x.id === c.id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= sorted.length) return
    const a = sorted[i]
    const b = sorted[j]
    const aOrder = a.sortOrder ?? (i + 1)
    const bOrder = b.sortOrder ?? (j + 1)
    const r1 = await window.frame.db.updateCategory(a.id, { sortOrder: bOrder })
    const r2 = await window.frame.db.updateCategory(b.id, { sortOrder: aOrder })
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
          Categories group tasks for filtering and the dashboard. Renaming is safe — existing
          tasks update automatically. Archive instead of deleting to preserve historical references.
        </p>
        <button className="chip" onClick={() => setDialog({ kind: 'create' })}>
          + Add category
        </button>
      </div>

      {error && <div className="setup-error">{error}</div>}

      <table className="task-table settings-table">
        <thead>
          <tr>
            <th style={{ width: '6rem' }}>Order</th>
            <th>Name</th>
            <th style={{ width: '8rem' }}>Colour</th>
            <th style={{ width: '6rem' }}>Status</th>
            <th style={{ width: '14rem', textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, idx) => (
            <tr key={c.id} className="task-row">
              <td>
                <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                  <button
                    type="button"
                    className="chip chip--sm"
                    disabled={idx === 0}
                    onClick={() => move(c, -1)}
                    aria-label="Move up"
                  >↑</button>
                  <button
                    type="button"
                    className="chip chip--sm"
                    disabled={idx === sorted.length - 1}
                    onClick={() => move(c, +1)}
                    aria-label="Move down"
                  >↓</button>
                </div>
              </td>
              <td>
                <span className="category-cell">
                  <span className="category-dot" style={{ background: c.colour ?? 'var(--muted)' }} />
                  <span className="category-name">{c.name}</span>
                </span>
              </td>
              <td>
                <span className="muted compact">{c.colour ?? '—'}</span>
              </td>
              <td>
                {c.isArchived
                  ? <span className="muted compact">Archived</span>
                  : <span>Active</span>}
              </td>
              <td style={{ textAlign: 'right' }}>
                <button type="button" className="chip" onClick={() => setDialog({ kind: 'edit', category: c })}>Edit</button>
                {' '}
                <button type="button" className="chip" onClick={() => toggleArchive(c)}>
                  {c.isArchived ? 'Unarchive' : 'Archive'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {dialog?.kind === 'create' && (
        <CategoryDialog
          mode="create"
          onCancel={() => setDialog(null)}
          onSubmit={async ({ name, colour }) => {
            const r = await window.frame.db.createCategory({ name, colour })
            if (!r.ok) throw new Error(r.error ?? 'Create failed')
            setDialog(null)
            await reload()
          }}
        />
      )}

      {dialog?.kind === 'edit' && (
        <CategoryDialog
          mode="edit"
          category={dialog.category}
          onCancel={() => setDialog(null)}
          onSubmit={async ({ name, colour }) => {
            const r = await window.frame.db.updateCategory(dialog.category.id, { name, colour })
            if (!r.ok) throw new Error(r.error ?? 'Save failed')
            setDialog(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}
