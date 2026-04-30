import { useEffect, useState } from 'react'
import type { WorkflowInstance, WorkflowTemplate } from '../types'
import { formatDate } from '../lib/date'
import { NewWorkflowDialog } from '../components/NewWorkflowDialog'

export function WorkflowsView() {
  const [instances, setInstances] = useState<WorkflowInstance[]>([])
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const reload = async () => {
    setError(null)
    try {
      const [insts, tpls] = await Promise.all([
        window.frame.db.listWorkflowInstances(),
        window.frame.db.listWorkflowTemplates(),
      ])
      setInstances(insts)
      setTemplates(tpls)
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
                <th style={{ width: '8rem' }}>Start</th>
                <th style={{ width: '8rem' }}>Target</th>
                <th style={{ width: '6rem' }}>Status</th>
                <th style={{ width: '7rem', textAlign: 'right' }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {instances.map(i => (
                <tr key={i.id} className="task-row">
                  <td>{i.templateName ?? <span className="muted">—</span>}</td>
                  <td className="task-title-cell">{i.name}</td>
                  <td>{i.gateType ?? <span className="muted">—</span>}</td>
                  <td>{i.projectRef ?? <span className="muted">—</span>}</td>
                  <td>{formatDate(i.startDate)}</td>
                  <td>{formatDate(i.targetDate)}</td>
                  <td>{i.status}</td>
                  <td style={{ textAlign: 'right' }}>
                    {i.doneSteps}/{i.totalSteps}
                    <span className="muted compact" style={{ marginLeft: '0.4rem' }}>({i.percentDone}%)</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialogOpen && (
        <NewWorkflowDialog
          templates={templates}
          onCancel={() => setDialogOpen(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  )
}
