import { useEffect, useState } from 'react'
import type {
  Assignee, Category, RecurrenceTemplateSummary, RecurrenceUnit,
} from '../types'
import { formatDate } from '../lib/date'
import { RecurrenceDialog } from '../components/RecurrenceDialog'
import { RecurringDetailView } from './RecurringDetailView'

const UNIT_LABEL: Record<RecurrenceUnit, string> = {
  day: 'day', week: 'week', month: 'month', year: 'year',
}

function ruleLabel(unit: RecurrenceUnit | null, interval: number | null): string {
  if (!unit) return '—'
  const n = interval ?? 1
  if (n === 1) return `every ${UNIT_LABEL[unit]}`
  return `every ${n} ${UNIT_LABEL[unit]}s`
}

export function RecurringView() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  if (selectedId !== null) {
    return <RecurringDetailView templateId={selectedId} onBack={() => setSelectedId(null)} />
  }
  return <RecurringList onSelect={setSelectedId} />
}

function RecurringList({ onSelect }: { onSelect: (id: number) => void }) {
  const [items, setItems]                   = useState<RecurrenceTemplateSummary[]>([])
  const [categories, setCategories]         = useState<Category[]>([])
  const [assignees, setAssignees]           = useState<Assignee[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [dialogOpen, setDialogOpen]         = useState(false)

  const reload = async () => {
    setError(null)
    try {
      const [list, cats, asn, tags] = await Promise.all([
        window.frame.db.listRecurrenceTemplates(),
        window.frame.db.listCategories(),
        window.frame.db.listAssignees(),
        window.frame.db.listTags(),
      ])
      setItems(list)
      setCategories(cats)
      setAssignees(asn)
      setTagSuggestions(tags)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

  if (loading) {
    return <div className="view-empty"><p className="muted">Loading…</p></div>
  }

  return (
    <div className="task-view">
      <header className="view-header view-header-row">
        <div>
          <h1>Recurring</h1>
          <p className="muted compact">{items.length} recurring task{items.length === 1 ? '' : 's'}</p>
        </div>
        <div className="header-actions">
          <button className="primary-button" onClick={() => setDialogOpen(true)}>+ New recurring</button>
        </div>
      </header>

      {error && <div className="setup-error" style={{ margin: '1rem 2rem 0' }}>{error}</div>}

      {items.length === 0 ? (
        <div className="view-empty">
          <p className="muted">
            No recurring tasks yet. Click "New recurring" to set one up — e.g. a weekly status report or a monthly review.
          </p>
        </div>
      ) : (
        <div className="task-table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: '11rem' }}>Category</th>
                <th>Title</th>
                <th style={{ width: '10rem' }}>Repeats</th>
                <th style={{ width: '8rem' }}>Next due</th>
                <th style={{ width: '8rem' }}>Last done</th>
                <th style={{ width: '8rem' }}>Owner</th>
                <th style={{ width: '7rem' }}>Completions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => {
                const cat = categories.find(c => c.id === it.template.categoryId)
                return (
                  <tr key={it.template.id} className="task-row" onClick={() => onSelect(it.template.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      {cat ? (
                        <span className="category-cell">
                          <span className="category-dot" style={{ background: cat.colour ?? 'var(--muted)' }} />
                          <span className="category-name">{cat.name}</span>
                        </span>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="task-title-cell">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className="recurring-icon" title="Recurring">🔁</span>
                        {it.template.title}
                      </span>
                    </td>
                    <td>{ruleLabel(it.template.recurrenceUnit, it.template.recurrenceInterval)}</td>
                    <td>{formatDate(it.nextOpenDue)}</td>
                    <td>{formatDate(it.lastCompleted)}</td>
                    <td>{it.template.primaryOwner ?? <span className="muted">—</span>}</td>
                    <td>
                      {it.doneOccurrences}/{it.totalOccurrences}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialogOpen && (
        <RecurrenceDialog
          mode="create"
          categories={categories}
          assignees={assignees}
          tagSuggestions={tagSuggestions}
          onCancel={() => setDialogOpen(false)}
          onSubmit={async (input) => {
            const r = await window.frame.db.createRecurrenceTemplate(input)
            if (!r.ok) throw new Error(r.error ?? 'Create failed')
            setDialogOpen(false)
            await reload()
          }}
        />
      )}
    </div>
  )
}
