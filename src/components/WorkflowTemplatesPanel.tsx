import { useEffect, useState } from 'react'
import type {
  Assignee, Category, NewWorkflowTemplateInput, NewWorkflowTemplateStepInput,
  WorkflowTemplate, WorkflowTemplateStep,
} from '../types'

export function WorkflowTemplatesPanel() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  if (selectedId !== null) {
    return <TemplateEditor id={selectedId} onBack={() => setSelectedId(null)} />
  }
  return <TemplateList onSelect={setSelectedId} />
}

// ─── List ───────────────────────────────────────────────────────────────────

function TemplateList({ onSelect }: { onSelect: (id: number) => void }) {
  const [items, setItems]         = useState<WorkflowTemplate[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError]         = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [dialog, setDialog]       = useState<'create' | null>(null)

  const reload = async () => {
    setError(null)
    try {
      const [list, cats] = await Promise.all([
        window.frame.db.listWorkflowTemplates(),
        window.frame.db.listCategories(),
      ])
      setItems(list)
      setCategories(cats)
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
      <div className="settings-section-header">
        <p className="muted compact">
          Workflow templates define a reusable sequence of steps. Each new workflow instance
          clones the steps. Editing a template only affects future instances.
        </p>
        <button className="chip" onClick={() => setDialog('create')}>+ Add template</button>
      </div>

      {error && <div className="setup-error">{error}</div>}

      <table className="task-table settings-table">
        <thead>
          <tr>
            <th>Name</th>
            <th style={{ width: '12rem' }}>Category</th>
            <th style={{ width: '6rem' }}>Steps</th>
            <th style={{ width: '7rem' }}>Status</th>
            <th style={{ width: '8rem', textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={5} className="muted compact" style={{ padding: '0.75rem' }}>No templates yet.</td></tr>
          )}
          {items.map(t => {
            const cat = categories.find(c => c.id === t.categoryId)
            return (
              <tr key={t.id} className="task-row">
                <td><strong>{t.name}</strong></td>
                <td>
                  {cat ? (
                    <span className="category-cell">
                      <span className="category-dot" style={{ background: cat.colour ?? 'var(--muted)' }} />
                      <span className="category-name">{cat.name}</span>
                    </span>
                  ) : <span className="muted">—</span>}
                </td>
                <td>{t.stepCount}</td>
                <td>{t.isArchived ? <span className="muted compact">Archived</span> : <span>Active</span>}</td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="chip" onClick={() => onSelect(t.id)}>Edit</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {dialog === 'create' && (
        <TemplateMetaDialog
          mode="create"
          categories={categories}
          onCancel={() => setDialog(null)}
          onSubmit={async (input) => {
            const r = await window.frame.db.createWorkflowTemplate(input)
            if (!r.ok) throw new Error(r.error ?? 'Create failed')
            setDialog(null)
            if (r.id != null) {
              onSelect(r.id)
            } else {
              await reload()
            }
          }}
        />
      )}
    </div>
  )
}

// ─── Editor ─────────────────────────────────────────────────────────────────

function TemplateEditor({ id, onBack }: { id: number; onBack: () => void }) {
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null)
  const [steps, setSteps]       = useState<WorkflowTemplateStep[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [assignees, setAssignees]   = useState<Assignee[]>([])
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)
  const [editMeta, setEditMeta] = useState(false)
  const [editStep, setEditStep] = useState<{ kind: 'create' } | { kind: 'edit'; step: WorkflowTemplateStep } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<WorkflowTemplateStep | null>(null)
  const [dragIndex, setDragIndex]         = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const reload = async () => {
    setError(null)
    try {
      const [r, cats, asn] = await Promise.all([
        window.frame.db.getWorkflowTemplate(id),
        window.frame.db.listCategories(),
        window.frame.db.listAssignees(),
      ])
      if (!r.ok) { setError(r.error); return }
      setTemplate(r.template)
      setSteps(r.steps)
      setCategories(cats)
      setAssignees(asn)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [id])

  if (loading || !template) return <p className="muted compact">{error ?? 'Loading…'}</p>

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <button className="chip" onClick={onBack} style={{ marginBottom: '0.4rem' }}>← Templates</button>
          <h3 className="settings-card-heading">{template.name}</h3>
          <p className="muted compact">
            {template.categoryName ?? 'No category'}
            {' · '}
            {steps.length} step{steps.length === 1 ? '' : 's'}
            {template.isArchived && ' · Archived'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button className="chip" onClick={() => setEditMeta(true)}>Edit details</button>
          <button
            className="chip"
            onClick={async () => {
              const r = await window.frame.db.updateWorkflowTemplate(template.id, { isArchived: !template.isArchived })
              if (!r.ok) { setError(r.error ?? 'Toggle failed'); return }
              await reload()
            }}
          >{template.isArchived ? 'Unarchive' : 'Archive'}</button>
        </div>
      </div>

      {error && <div className="setup-error">{error}</div>}

      <section className="settings-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3 className="settings-card-heading" style={{ margin: 0 }}>Steps</h3>
          <button className="chip" onClick={() => setEditStep({ kind: 'create' })}>+ Add step</button>
        </div>
        {steps.length === 0 ? (
          <p className="muted compact">No steps yet — add one to get started.</p>
        ) : (
          <table className="task-table settings-table">
            <thead>
              <tr>
                <th style={{ width: '2rem' }} aria-label="Drag" />
                <th style={{ width: '3rem' }}>#</th>
                <th>Title</th>
                <th style={{ width: '8rem' }}>Owner</th>
                <th style={{ width: '6rem' }}>Offset</th>
                <th style={{ width: '5rem' }}>Optional</th>
                <th style={{ width: '12rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s, i) => {
                const isDragging = dragIndex === i
                const isDragOver = dragOverIndex === i && dragIndex !== null && dragIndex !== i
                return (
                  <tr
                    key={s.id}
                    className={[
                      'task-row',
                      isDragging ? 'workflow-step-row-dragging'  : '',
                      isDragOver ? 'workflow-step-row-drag-over' : '',
                    ].filter(Boolean).join(' ')}
                    draggable
                    onDragStart={e => {
                      setDragIndex(i)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', String(i))
                    }}
                    onDragOver={e => {
                      if (dragIndex === null) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (dragOverIndex !== i) setDragOverIndex(i)
                    }}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                    onDrop={async e => {
                      e.preventDefault()
                      const from = dragIndex
                      setDragIndex(null); setDragOverIndex(null)
                      if (from === null || from === i) return
                      const next = [...steps]
                      const [moved] = next.splice(from, 1)
                      next.splice(i, 0, moved)
                      setSteps(next)
                      const orderedIds = next.map(x => x.id)
                      const r = await window.frame.db.reorderWorkflowTemplateSteps(template.id, orderedIds)
                      if (!r.ok) setError(r.error ?? 'Reorder failed')
                      await reload()
                    }}
                  >
                    <td className="workflow-drag-handle" title="Drag to reorder">⋮⋮</td>
                    <td className="muted compact">{s.stepNumber}</td>
                    <td>{s.title}</td>
                    <td>{s.defaultOwner ?? <span className="muted">—</span>}</td>
                    <td>{s.offsetDays != null ? `+${s.offsetDays}d` : <span className="muted">—</span>}</td>
                    <td>{s.isOptional ? 'Yes' : 'No'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="chip" onClick={() => setEditStep({ kind: 'edit', step: s })}>Edit</button>
                      {' '}
                      <button type="button" className="chip chip--danger" onClick={() => setConfirmDelete(s)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {editMeta && (
        <TemplateMetaDialog
          mode="edit"
          template={template}
          categories={categories}
          onCancel={() => setEditMeta(false)}
          onSubmit={async (input) => {
            const r = await window.frame.db.updateWorkflowTemplate(template.id, input)
            if (!r.ok) throw new Error(r.error ?? 'Save failed')
            setEditMeta(false)
            await reload()
          }}
        />
      )}

      {editStep?.kind === 'create' && (
        <StepDialog
          mode="create"
          assignees={assignees}
          onCancel={() => setEditStep(null)}
          onSubmit={async (input) => {
            const r = await window.frame.db.createWorkflowTemplateStep(template.id, input)
            if (!r.ok) throw new Error(r.error ?? 'Create failed')
            setEditStep(null)
            await reload()
          }}
        />
      )}

      {editStep?.kind === 'edit' && (
        <StepDialog
          mode="edit"
          step={editStep.step}
          assignees={assignees}
          onCancel={() => setEditStep(null)}
          onSubmit={async (input) => {
            const r = await window.frame.db.updateWorkflowTemplateStep(editStep.step.id, input)
            if (!r.ok) throw new Error(r.error ?? 'Save failed')
            setEditStep(null)
            await reload()
          }}
        />
      )}

      {confirmDelete && (
        <div className="dialog-backdrop">
          <div className="dialog-card">
            <p className="panel-label">Delete step</p>
            <h3>Delete "{confirmDelete.title}"?</h3>
            <p className="muted compact">
              This step will be removed from the template. Existing workflow instances are unaffected — only future instances will lose this step.
            </p>
            <div className="dialog-actions">
              <button type="button" className="chip" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                type="button"
                className="chip chip--danger"
                onClick={async () => {
                  const r = await window.frame.db.deleteWorkflowTemplateStep(confirmDelete.id)
                  setConfirmDelete(null)
                  if (!r.ok) { setError(r.error ?? 'Delete failed'); return }
                  await reload()
                }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Dialogs ────────────────────────────────────────────────────────────────

function TemplateMetaDialog(props:
  | { mode: 'create'; categories: Category[]; onCancel: () => void; onSubmit: (input: NewWorkflowTemplateInput) => Promise<void> }
  | { mode: 'edit';   template: WorkflowTemplate; categories: Category[]; onCancel: () => void; onSubmit: (patch: NewWorkflowTemplateInput) => Promise<void> }
) {
  const isEdit = props.mode === 'edit'
  const initial = isEdit ? props.template : null

  const [name, setName]               = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [categoryId, setCategoryId]   = useState<number | null>(initial?.categoryId ?? null)
  const [error, setError]             = useState<string | null>(null)
  const [saving, setSaving]           = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    try {
      await props.onSubmit({
        name:        name.trim(),
        description: description.trim() || null,
        categoryId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card">
        <p className="panel-label">{isEdit ? 'Edit template' : 'New template'}</p>
        <h3>{isEdit ? `Edit "${initial?.name ?? ''}"` : 'Add a workflow template'}</h3>
        {error && <div className="setup-error">{error}</div>}
        <form onSubmit={submit} className="task-form">
          <label className="form-field">
            <span>Name</span>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus />
          </label>
          <label className="form-field">
            <span>Category</span>
            <select value={categoryId ?? ''} onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— None —</option>
              {props.categories.filter(c => !c.isArchived).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Description <em className="muted compact">(optional)</em></span>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <div className="dialog-actions">
            <button type="button" className="chip" onClick={props.onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Saving…' : (isEdit ? 'Save' : 'Add template')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StepDialog(props:
  | { mode: 'create'; assignees: Assignee[]; onCancel: () => void; onSubmit: (input: NewWorkflowTemplateStepInput) => Promise<void> }
  | { mode: 'edit';   step: WorkflowTemplateStep; assignees: Assignee[]; onCancel: () => void; onSubmit: (input: NewWorkflowTemplateStepInput) => Promise<void> }
) {
  const isEdit  = props.mode === 'edit'
  const initial = isEdit ? props.step : null

  const [title, setTitle]               = useState(initial?.title ?? '')
  const [description, setDescription]   = useState(initial?.description ?? '')
  const [defaultOwner, setDefaultOwner] = useState<string | null>(initial?.defaultOwner ?? null)
  const [offsetDays, setOffsetDays]     = useState<string>(initial?.offsetDays != null ? String(initial.offsetDays) : '')
  const [isOptional, setIsOptional]     = useState<boolean>(initial?.isOptional ?? false)
  const [error, setError]               = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    try {
      await props.onSubmit({
        title:        title.trim(),
        description:  description.trim() || null,
        defaultOwner: defaultOwner || null,
        offsetDays:   offsetDays.trim() === '' ? null : Number(offsetDays),
        isOptional,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card">
        <p className="panel-label">{isEdit ? 'Edit step' : 'New step'}</p>
        <h3>{isEdit ? `Edit "${initial?.title ?? ''}"` : 'Add a step'}</h3>
        {error && <div className="setup-error">{error}</div>}
        <form onSubmit={submit} className="task-form">
          <label className="form-field">
            <span>Title</span>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} required autoFocus />
          </label>
          <div className="form-row">
            <label className="form-field">
              <span>Default owner</span>
              <select value={defaultOwner ?? ''} onChange={e => setDefaultOwner(e.target.value || null)}>
                <option value="">— None —</option>
                {props.assignees.filter(a => a.isActive).map(a => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Offset days <em className="muted compact">(from start)</em></span>
              <input type="number" value={offsetDays} onChange={e => setOffsetDays(e.target.value)} min={0} max={365} />
            </label>
          </div>
          <label className="form-field">
            <span>Description <em className="muted compact">(optional)</em></span>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <label className="inherit-tickbox">
            <input type="checkbox" checked={isOptional} onChange={e => setIsOptional(e.target.checked)} />
            <span>Optional step (can be skipped on instances)</span>
          </label>
          <div className="dialog-actions">
            <button type="button" className="chip" onClick={props.onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Saving…' : (isEdit ? 'Save' : 'Add step')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
