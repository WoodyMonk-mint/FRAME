import { useEffect, useState } from 'react'
import type {
  Assignee, Category, Task, TaskInput,
  WorkflowInstance, WorkflowStep,
} from '../types'
import { AddStepDialog } from '../components/AddStepDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MarkDoneDialog } from '../components/MarkDoneDialog'
import { TaskModal } from '../components/TaskModal'
import { WorkflowDialog } from '../components/WorkflowDialog'
import { WorkflowNotesFeed } from '../components/WorkflowNotesFeed'
import { PriorityPill, StatusPill } from '../components/Pills'
import { formatDate, isOverdue, todayIso } from '../lib/date'

type Props = {
  instanceId: number
  onBack:     () => void
}

export function WorkflowDetailView({ instanceId, onBack }: Props) {
  const [instance, setInstance]   = useState<WorkflowInstance | null>(null)
  const [steps, setSteps]         = useState<WorkflowStep[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [assignees, setAssignees]   = useState<Assignee[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const [editing, setEditing]         = useState<Task | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null)
  const [confirmDone, setConfirmDone]     = useState<Task | null>(null)
  const [editWorkflowOpen, setEditWorkflowOpen] = useState(false)
  const [addStepOpen, setAddStepOpen]     = useState(false)
  const [confirmDeleteWorkflow, setConfirmDeleteWorkflow] = useState(false)

  const [dragIndex, setDragIndex]         = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const reload = async () => {
    setError(null)
    try {
      const [r, c, a, tg] = await Promise.all([
        window.frame.db.getWorkflowInstance(instanceId),
        window.frame.db.listCategories(),
        window.frame.db.listAssignees(),
        window.frame.db.listTags(),
      ])
      if (!r.ok) {
        setError(r.error)
        return
      }
      setInstance(r.instance)
      setSteps(r.steps)
      setCategories(c)
      setAssignees(a)
      setTagSuggestions(tg)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [instanceId])

  // ─── Drag-reorder ────────────────────────────────────────────────────────

  const onDragStart = (i: number) => (e: React.DragEvent) => {
    setDragIndex(i)
    e.dataTransfer.effectAllowed = 'move'
    // Firefox needs some payload to fire drop events.
    e.dataTransfer.setData('text/plain', String(i))
  }

  const onDragOver = (i: number) => (e: React.DragEvent) => {
    if (dragIndex === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndex !== i) setDragOverIndex(i)
  }

  const onDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const onDrop = (i: number) => async (e: React.DragEvent) => {
    e.preventDefault()
    const from = dragIndex
    setDragIndex(null)
    setDragOverIndex(null)
    if (from === null || from === i) return

    const next = [...steps]
    const [moved] = next.splice(from, 1)
    next.splice(i, 0, moved)
    setSteps(next)  // optimistic

    const orderedTaskIds = next
      .map(s => s.task?.id)
      .filter((x): x is number => x != null)
    if (orderedTaskIds.length !== next.length) {
      setError('Cannot reorder: one or more steps are missing their task.')
      void reload()
      return
    }

    const r = await window.frame.db.reorderWorkflowSteps(instanceId, orderedTaskIds, null)
    if (!r.ok) setError(r.error ?? 'Reorder failed')
    void reload()
  }

  // ─── Task mutations on a step ────────────────────────────────────────────

  const saveStep = async (input: TaskInput, opts: { setCompletedToToday: boolean }) => {
    if (!editing) return
    const patch = { ...input } as Parameters<typeof window.frame.db.updateTask>[1]
    if (opts.setCompletedToToday) patch.completedDate = todayIso()
    if (input.status !== 'DONE' && editing.status === 'DONE') patch.completedDate = null
    const r = await window.frame.db.updateTask(editing.id, patch)
    if (!r.ok) throw new Error(r.error ?? 'Update failed')
    setEditing(null)
    await reload()
  }

  const markDone = async (task: Task, completedDate: string, note: string) => {
    const patch: Parameters<typeof window.frame.db.updateTask>[1] = {
      status:          'DONE',
      completedDate,
      percentComplete: 100,
    }
    if (note) {
      const stamped = `[${completedDate}] Done — ${note}`
      patch.notes = task.notes && task.notes.trim()
        ? `${stamped}\n\n${task.notes}`
        : stamped
    }
    const r = await window.frame.db.updateTask(task.id, patch)
    setConfirmDone(null)
    if (!r.ok) { setError(r.error ?? 'Update failed'); return }
    await reload()
  }

  const doDelete = async (task: Task) => {
    setConfirmDelete(null)
    const r = await window.frame.db.softDeleteTask(task.id)
    if (!r.ok) { setError(r.error ?? 'Delete failed'); return }
    setEditing(null)
    await reload()
  }

  if (loading || !instance) {
    return <div className="view-empty"><p className="muted">{error ?? 'Loading…'}</p></div>
  }

  const overdue = isOverdue(instance.targetDate, 'WIP')

  return (
    <div className="task-view">
      <header className="view-header view-header-row">
        <div>
          <button className="chip" onClick={onBack} style={{ marginBottom: '0.5rem' }}>← Workflows</button>
          <h1>{instance.name}</h1>
          <p className="muted compact">
            {instance.templateName ?? 'No template'}
            {instance.gateType   && ` · ${instance.gateType}`}
            {instance.projectRef && ` · ${instance.projectRef}`}
            {instance.primaryOwner && ` · owner: ${instance.primaryOwner}`}
            {instance.priority   && ` · ${instance.priority}`}
            {' · '}
            <span className={overdue ? 'overdue' : ''}>
              {instance.startDate ? formatDate(instance.startDate) : '—'}
              {' → '}
              {formatDate(instance.targetDate)}
            </span>
          </p>
          <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <StatusPill status={instance.status} />
            {instance.priority && <PriorityPill priority={instance.priority} />}
            {instance.tags.length > 0 && (
              <span className="muted compact">
                {instance.tags.map(t => `#${t}`).join(' ')}
              </span>
            )}
          </div>
        </div>
        <div className="header-actions">
          <div className="workflow-progress">
            <span className="percent-cell">
              <span className="percent-bar" style={{ width: '6rem' }}>
                <span
                  className={`percent-bar-fill ${instance.percentDone === 100 ? 'is-done' : ''}`}
                  style={{ width: `${instance.percentDone}%` }}
                />
              </span>
              <span className="percent-cell-num">{instance.percentDone}%</span>
            </span>
            <span className="muted compact" style={{ marginLeft: '0.5rem' }}>
              {instance.doneSteps}/{instance.totalSteps} steps
            </span>
          </div>
          <button className="chip" onClick={() => setAddStepOpen(true)}>+ Add step</button>
          <button className="chip" onClick={() => setEditWorkflowOpen(true)}>Edit workflow</button>
          <button
            type="button"
            className="delete-icon-btn"
            onClick={() => setConfirmDeleteWorkflow(true)}
            aria-label="Delete workflow"
            title="Delete workflow"
          >×</button>
        </div>
      </header>

      {error && <div className="setup-error" style={{ margin: '1rem 2rem 0' }}>{error}</div>}

      <div className="task-table-wrap">
        <table className="task-table">
          <thead>
            <tr>
              <th style={{ width: '2rem' }} aria-label="Drag" />
              <th style={{ width: '3rem' }}>#</th>
              <th>Title</th>
              <th style={{ width: '7rem' }}>Status</th>
              <th style={{ width: '7.5rem' }}>%</th>
              <th style={{ width: '8rem' }}>Owner</th>
              <th style={{ width: '8rem' }}>Due</th>
              <th style={{ width: '4rem' }} aria-label="Deviation" />
            </tr>
          </thead>
          <tbody>
            {steps.map((s, i) => {
              const t = s.task
              if (!t) return null
              const overdue = isOverdue(t.dueDate, t.status)
              const isDragOver = dragOverIndex === i && dragIndex !== null && dragIndex !== i
              const isDragging = dragIndex === i
              return (
                <tr
                  key={s.stepId}
                  className={[
                    'task-row',
                    'workflow-step-row',
                    isDragging   ? 'workflow-step-row-dragging' : '',
                    isDragOver   ? 'workflow-step-row-drag-over' : '',
                    t.status === 'DONE' ? 'task-row-done' : '',
                  ].filter(Boolean).join(' ')}
                  draggable
                  onDragStart={onDragStart(i)}
                  onDragOver={onDragOver(i)}
                  onDragEnd={onDragEnd}
                  onDrop={onDrop(i)}
                  onClick={() => setEditing(t)}
                >
                  <td className="workflow-drag-handle" onClick={e => e.stopPropagation()} title="Drag to reorder">⋮⋮</td>
                  <td className="muted compact">{s.stepNumber}</td>
                  <td className="task-title-cell">{t.title}</td>
                  <td><StatusPill status={t.status} /></td>
                  <td>
                    <span className="percent-cell">
                      <span className="percent-bar">
                        <span
                          className={`percent-bar-fill ${t.percentComplete === 100 ? 'is-done' : ''}`}
                          style={{ width: `${t.percentComplete}%` }}
                        />
                      </span>
                      <span className="percent-cell-num">{t.percentComplete}</span>
                    </span>
                  </td>
                  <td>{t.primaryOwner ?? <span className="muted">—</span>}</td>
                  <td className={overdue ? 'overdue' : ''}>{formatDate(t.dueDate)}</td>
                  <td style={{ textAlign: 'center' }}>
                    {s.isDeviation && (
                      <span
                        title={
                          s.templateStepNumber != null
                            ? `Out of template order (was step ${s.templateStepNumber})`
                            : 'Ad-hoc step (not in template)'
                        }
                        className="workflow-deviation-flag"
                      >⚠</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <WorkflowNotesFeed instanceId={instanceId} />

      {editing && (
        <TaskModal
          mode="edit"
          task={editing}
          childCount={0}
          autoChildren={[]}
          categories={categories}
          assignees={assignees}
          tagSuggestions={tagSuggestions}
          onCancel={() => setEditing(null)}
          onSave={saveStep}
          onDelete={() => setConfirmDelete(editing)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          label="Delete step"
          title={`Delete "${confirmDelete.title}"?`}
          body="This step will be archived (soft-deleted). The audit log retains the full record. The workflow's other steps stay intact."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => doDelete(confirmDelete)}
        />
      )}

      {confirmDone && (
        <MarkDoneDialog
          taskTitle={confirmDone.title}
          onCancel={() => setConfirmDone(null)}
          onConfirm={(date, note) => markDone(confirmDone, date, note)}
        />
      )}

      {editWorkflowOpen && instance && (
        <WorkflowDialog
          mode="edit"
          instance={instance}
          assignees={assignees}
          tagSuggestions={tagSuggestions}
          onCancel={() => setEditWorkflowOpen(false)}
          onSubmit={async (patch) => {
            const r = await window.frame.db.updateWorkflowInstance(instance.id, patch)
            if (!r.ok) throw new Error(r.error ?? 'Update failed')
            setEditWorkflowOpen(false)
            await reload()
          }}
        />
      )}

      {addStepOpen && (
        <AddStepDialog
          assignees={assignees}
          onCancel={() => setAddStepOpen(false)}
          onSubmit={async (input) => {
            const r = await window.frame.db.addWorkflowStep(instanceId, input)
            if (!r.ok) throw new Error(r.error ?? 'Add step failed')
            setAddStepOpen(false)
            await reload()
          }}
        />
      )}

      {confirmDeleteWorkflow && instance && (
        <ConfirmDialog
          label="Delete workflow"
          title={`Delete "${instance.name}"?`}
          body={`The workflow and all ${instance.totalSteps} of its step task${instance.totalSteps === 1 ? '' : 's'} will be archived. The audit log retains the full record.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDeleteWorkflow(false)}
          onConfirm={async () => {
            const r = await window.frame.db.softDeleteWorkflowInstance(instance.id)
            setConfirmDeleteWorkflow(false)
            if (!r.ok) { setError(r.error ?? 'Delete failed'); return }
            onBack()
          }}
        />
      )}
    </div>
  )
}
