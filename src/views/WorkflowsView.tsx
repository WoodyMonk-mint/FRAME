import { useEffect, useState } from 'react'
import type { Assignee, WorkflowInstance, WorkflowTemplate } from '../types'
import { formatDate } from '../lib/date'
import { WorkflowDialog } from '../components/WorkflowDialog'
import { WorkflowDetailView } from './WorkflowDetailView'

export function WorkflowsView() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  if (selectedId !== null) {
    return <WorkflowDetailView instanceId={selectedId} onBack={() => setSelectedId(null)} />
  }
  return <WorkflowsList onSelect={setSelectedId} />
}

function WorkflowsList({ onSelect }: { onSelect: (id: number) => void }) {
  const [instances, setInstances] = useState<WorkflowInstance[]>([])
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const reload = async () => {
    setError(null)
    try {
      const [insts, tpls, asn, tags] = await Promise.all([
        window.frame.db.listWorkflowInstances(),
        window.frame.db.listWorkflowTemplates(),
        window.frame.db.listAssignees(),
        window.frame.db.listTags(),
      ])
      setInstances(insts)
      setTemplates(tpls)
      setAssignees(asn)
      setTagSuggestions(tags)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

  const handleCreate = async (input: Parameters<typeof window.frame.db.createWorkflowInstance>[0]) => {
    const r = await window.frame.db.createWorkflowInstance(input)
    if (!r.ok) throw new Error(r.error ?? 'Create failed')
    setDialogOpen(false)
    await reload()
  }

  if (loading) {
    return <div className="view-empty"><p className="muted">Loading…</p></div>
  }

  return (
    <div className="task-view">
      <header className="view-header view-header-row">
        <div>
          <h1>Workflows</h1>
          <p className="muted compact">{instances.length} workflow{instances.length === 1 ? '' : 's'}</p>
        </div>
        <div className="header-actions">
          <button
            className="primary-button"
            onClick={() => setDialogOpen(true)}
            disabled={templates.length === 0}
            title={templates.length === 0 ? 'No templates available' : undefined}
          >+ New workflow</button>
        </div>
      </header>

      {error && <div className="setup-error" style={{ margin: '1rem 2rem 0' }}>{error}</div>}

      {instances.length === 0 ? (
        <div className="view-empty">
          <p className="muted">
            No workflows yet. Click "New workflow" to start a Gate Review or Production Analysis from a template.
          </p>
        </div>
      ) : (
        <div className="task-table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: '11rem' }}>Template</th>
                <th>Name</th>
                <th style={{ width: '5rem' }}>Gate</th>
                <th style={{ width: '10rem' }}>Project</th>
                <th style={{ width: '7rem' }}>Status</th>
                <th style={{ width: '4rem' }}>Pri</th>
                <th style={{ width: '8rem' }}>Owner</th>
                <th style={{ width: '8rem' }}>Target</th>
                <th style={{ width: '7rem' }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {instances.map(i => (
                <tr key={i.id} className="task-row" onClick={() => onSelect(i.id)} style={{ cursor: 'pointer' }}>
                  <td>{i.templateName ?? <span className="muted">—</span>}</td>
                  <td className="task-title-cell">{i.name}</td>
                  <td>{i.gateType ?? <span className="muted">—</span>}</td>
                  <td>{i.projectRef ?? <span className="muted">—</span>}</td>
                  <td>{i.status}</td>
                  <td>{i.priority ?? <span className="muted">—</span>}</td>
                  <td>{i.primaryOwner ?? <span className="muted">—</span>}</td>
                  <td>{formatDate(i.targetDate)}</td>
                  <td>
                    <span className="percent-cell">
                      <span className="percent-bar">
                        <span
                          className={`percent-bar-fill ${i.percentDone === 100 ? 'is-done' : ''}`}
                          style={{ width: `${i.percentDone}%` }}
                        />
                      </span>
                      <span className="percent-cell-num">{i.percentDone}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialogOpen && (
        <WorkflowDialog
          mode="create"
          templates={templates}
          assignees={assignees}
          tagSuggestions={tagSuggestions}
          onCancel={() => setDialogOpen(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  )
}
