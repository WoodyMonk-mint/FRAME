import { useEffect, useState } from 'react'
import type {
  Assignee, Category, RecurrenceUnit, Task, TaskInput,
} from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MarkDoneDialog } from '../components/MarkDoneDialog'
import { RecurrenceDialog } from '../components/RecurrenceDialog'
import { TaskModal } from '../components/TaskModal'
import { PriorityPill, StatusPill } from '../components/Pills'
import { formatDate, isOverdue, todayIso } from '../lib/date'

const UNIT_LABEL: Record<RecurrenceUnit, string> = {
  day: 'day', week: 'week', month: 'month', year: 'year',
}
function ruleLabel(unit: RecurrenceUnit | null, interval: number | null): string {
  if (!unit) return '—'
  const n = interval ?? 1
  return n === 1 ? `every ${UNIT_LABEL[unit]}` : `every ${n} ${UNIT_LABEL[unit]}s`
}

type Props = {
  templateId: number
  onBack:     () => void
}

export function RecurringDetailView({ templateId, onBack }: Props) {
  const [template, setTemplate]   = useState<Task | null>(null)
  const [occurrences, setOccurrences] = useState<Task[]>([])
  const [subtasks, setSubtasks]       = useState<Task[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [assignees, setAssignees]   = useState<Assignee[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [allTasks, setAllTasks]     = useState<Task[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  const [editing, setEditing]                       = useState<Task | null>(null)
  const [confirmDelete, setConfirmDelete]           = useState<Task | null>(null)
  const [confirmDone, setConfirmDone]               = useState<Task | null>(null)
  const [editTemplateOpen, setEditTemplateOpen]     = useState(false)
  const [confirmDeleteTpl, setConfirmDeleteTpl]     = useState(false)
  const [addingChecklistItem, setAddingChecklistItem] = useState(false)
  const [dragIndex, setDragIndex]         = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const reload = async () => {
    setError(null)
    try {
      const [r, cats, asn, tags, allT] = await Promise.all([
        window.frame.db.getRecurrenceTemplate(templateId),
        window.frame.db.listCategories(),
        window.frame.db.listAssignees(),
        window.frame.db.listTags(),
        window.frame.db.listTasks(),
      ])
      if (!r.ok) { setError(r.error); return }
      setTemplate(r.template)
      setOccurrences(r.occurrences)
      setSubtasks(r.subtasks)
      setCategories(cats)
      setAssignees(asn)
      setTagSuggestions(tags)
      setAllTasks(allT)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [templateId])

  // ─── Occurrence mutations ────────────────────────────────────────────────

  const saveOccurrence = async (input: TaskInput, opts: { setCompletedToToday: boolean }) => {
    if (!editing) return
    const patch = { ...input } as Parameters<typeof window.frame.db.updateTask>[1]
    if (opts.setCompletedToToday) patch.completedDate = todayIso()
    if (input.status !== 'DONE' && editing.status === 'DONE') patch.completedDate = null
    const r = await window.frame.db.updateTask(editing.id, patch)
    if (!r.ok) throw new Error(r.error ?? 'Update failed')
    setEditing(null)
    await reload()
  }

  const doDeleteOccurrence = async (task: Task) => {
    setConfirmDelete(null)
    const r = await window.frame.db.softDeleteTask(task.id)
    if (!r.ok) { setError(r.error ?? 'Delete failed'); return }
    setEditing(null)
    await reload()
  }

  const completeOccurrence = async (
    task: Task, completedDate: string, note: string, createNext: boolean,
  ) => {
    const r = await window.frame.db.completeRecurringOccurrence(
      task.id, completedDate || null, note || null, createNext,
    )
    setConfirmDone(null)
    if (!r.ok) { setError(r.error ?? 'Completion failed'); return }
    await reload()
  }

  if (loading || !template) {
    return <div className="view-empty"><p className="muted">{error ?? 'Loading…'}</p></div>
  }

  // Group subtasks by parent_task_id for quick lookup.
  const subtasksByParent = new Map<number, Task[]>()
  for (const s of subtasks) {
    if (s.parentTaskId == null) continue
    const arr = subtasksByParent.get(s.parentTaskId) ?? []
    arr.push(s)
    subtasksByParent.set(s.parentTaskId, arr)
  }
  const templateSubtasks = subtasksByParent.get(template.id) ?? []
  const subtaskCountFor = (occId: number) => {
    const subs = subtasksByParent.get(occId) ?? []
    const done = subs.filter(s => s.status === 'DONE').length
    return { done, total: subs.length }
  }

  const totalOccurrences = occurrences.length
  const doneOccurrences  = occurrences.filter(o => o.status === 'DONE').length
  const nextOpen = occurrences
    .filter(o => o.status !== 'DONE' && o.status !== 'CANCELLED' && o.dueDate)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))[0]
  const lastCompleted = occurrences
    .filter(o => o.completedDate)
    .sort((a, b) => (b.completedDate ?? '').localeCompare(a.completedDate ?? ''))[0]

  const overdue = isOverdue(nextOpen?.dueDate ?? null, nextOpen?.status ?? 'PLANNING')

  return (
    <div className="task-view">
      <header className="view-header view-header-row">
        <div>
          <button className="chip" onClick={onBack} style={{ marginBottom: '0.5rem' }}>← Recurring</button>
          <h1>
            <span style={{ marginRight: '0.4rem' }}>🔁</span>
            {template.title}
          </h1>
          <p className="muted compact">
            {template.categoryName ?? 'No category'}
            {' · '}
            {ruleLabel(template.recurrenceUnit, template.recurrenceInterval)}
            {template.primaryOwner && ` · owner: ${template.primaryOwner}`}
            {template.priority   && ` · ${template.priority}`}
            {' · '}
            <span className={overdue ? 'overdue' : ''}>
              next due: {formatDate(nextOpen?.dueDate ?? null)}
            </span>
            {lastCompleted && ` · last done: ${formatDate(lastCompleted.completedDate)}`}
            {' · '}
            {doneOccurrences}/{totalOccurrences} completed
          </p>
          {template.tags.length > 0 && (
            <div style={{ marginTop: '0.4rem' }}>
              <span className="muted compact">{template.tags.map(t => `#${t}`).join(' ')}</span>
            </div>
          )}
        </div>
        <div className="header-actions">
          <button className="chip" onClick={() => setEditTemplateOpen(true)}>Edit recurring</button>
          <button
            type="button"
            className="delete-icon-btn"
            onClick={() => setConfirmDeleteTpl(true)}
            aria-label="Delete recurring task"
            title="Delete recurring task"
          >×</button>
        </div>
      </header>

      {error && <div className="setup-error" style={{ margin: '1rem 2rem 0' }}>{error}</div>}

      <section className="recurring-checklist-section">
        <div className="recurring-checklist-header">
          <h2 className="workflow-notes-heading">Checklist</h2>
          <button className="chip" onClick={() => setAddingChecklistItem(true)}>+ Add to checklist</button>
        </div>
        <p className="muted compact" style={{ fontSize: '0.75rem', marginTop: 0 }}>
          Adding a checklist item here also drops it into every open occurrence so you don't have
          to add it twice. Past completions are left as-is. Each occurrence then keeps its own copy.
        </p>
        {templateSubtasks.length === 0 ? (
          <p className="muted compact">No checklist items yet.</p>
        ) : (
          <ul className="recurring-checklist-list">
            {templateSubtasks.map((s, i) => {
              const isDragging  = dragIndex === i
              const isDragOver  = dragOverIndex === i && dragIndex !== null && dragIndex !== i
              return (
                <li
                  key={s.id}
                  className={[
                    'recurring-checklist-item',
                    isDragging  ? 'recurring-checklist-item-dragging' : '',
                    isDragOver  ? 'recurring-checklist-item-drag-over' : '',
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
                    setDragIndex(null)
                    setDragOverIndex(null)
                    if (from === null || from === i) return
                    const next = [...templateSubtasks]
                    const [moved] = next.splice(from, 1)
                    next.splice(i, 0, moved)
                    setSubtasks(prev =>
                      prev.filter(x => x.parentTaskId !== template.id)
                        .concat(next))
                    const orderedIds = next.map(x => x.id)
                    const r = await window.frame.db.reorderChecklist(template.id, orderedIds)
                    if (!r.ok) setError(r.error ?? 'Reorder failed')
                    void reload()
                  }}
                  onClick={() => setEditing(s)}
                >
                  <span className="recurring-drag-handle" onClick={e => e.stopPropagation()} title="Drag to reorder">⋮⋮</span>
                  <span style={{ flex: 1 }}>{s.title}</span>
                  {s.primaryOwner && <span className="muted compact">{s.primaryOwner}</span>}
                  {s.priority && <PriorityPill priority={s.priority} />}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="task-table-wrap">
        <table className="task-table">
          <thead>
            <tr>
              <th>Title</th>
              <th style={{ width: '7rem' }}>Status</th>
              <th style={{ width: '4rem' }}>Pri</th>
              <th style={{ width: '8rem' }}>Due</th>
              <th style={{ width: '8rem' }}>Completed</th>
              <th style={{ width: '8rem' }}>Owner</th>
              <th style={{ width: '7rem' }}>Checklist</th>
            </tr>
          </thead>
          <tbody>
            {occurrences.map(o => {
              const isOver = isOverdue(o.dueDate, o.status)
              const { done, total } = subtaskCountFor(o.id)
              return (
                <tr
                  key={o.id}
                  className={`task-row ${o.status === 'DONE' ? 'task-row-done' : ''}`}
                  onClick={() => setEditing(o)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="task-title-cell">{o.title}</td>
                  <td><StatusPill status={o.status} /></td>
                  <td><PriorityPill priority={o.priority} /></td>
                  <td className={isOver ? 'overdue' : ''}>{formatDate(o.dueDate)}</td>
                  <td>{formatDate(o.completedDate)}</td>
                  <td>{o.primaryOwner ?? <span className="muted">—</span>}</td>
                  <td>
                    {total === 0
                      ? <span className="muted">—</span>
                      : <span>{done}/{total}</span>}
                  </td>
                </tr>
              )
            })}
            {occurrences.length === 0 && (
              <tr><td colSpan={7} className="muted compact" style={{ padding: '1rem' }}>No occurrences yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <TaskModal
          mode="edit"
          task={editing}
          childCount={0}
          autoChildren={[]}
          allTasks={allTasks}
          categories={categories}
          assignees={assignees}
          tagSuggestions={tagSuggestions}
          onCancel={() => setEditing(null)}
          onSave={saveOccurrence}
          onDelete={() => setConfirmDelete(editing)}
        />
      )}

      {addingChecklistItem && (
        <TaskModal
          mode="add"
          parent={template}
          childCount={0}
          autoChildren={[]}
          allTasks={allTasks}
          categories={categories}
          assignees={assignees}
          tagSuggestions={tagSuggestions}
          onCancel={() => setAddingChecklistItem(false)}
          onSave={async (input) => {
            // Add to the template (canonical definition).
            const r = await window.frame.db.createTask({ ...input, parentTaskId: template.id })
            if (!r.ok) throw new Error(r.error ?? 'Add failed')

            // Also propagate to every still-open occurrence so the user
            // doesn't have to add it twice. DONE / CANCELLED occurrences
            // are skipped — they're frozen records of past cycles.
            const open = occurrences.filter(o => o.status !== 'DONE' && o.status !== 'CANCELLED')
            for (const o of open) {
              const r2 = await window.frame.db.createTask({ ...input, parentTaskId: o.id })
              if (!r2.ok) throw new Error(r2.error ?? 'Propagation failed')
            }
            setAddingChecklistItem(false)
            await reload()
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          label="Delete occurrence"
          title={`Delete "${confirmDelete.title}"?`}
          body="This single occurrence will be archived. The recurring template and other occurrences are unaffected."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => doDeleteOccurrence(confirmDelete)}
        />
      )}

      {confirmDone && (
        <MarkDoneDialog
          taskTitle={confirmDone.title}
          autoCreateNext={template.autoCreateNext ?? true}
          onCancel={() => setConfirmDone(null)}
          onConfirm={(date, note, createNext) => completeOccurrence(confirmDone, date, note, !!createNext)}
        />
      )}

      {editTemplateOpen && (
        <RecurrenceDialog
          mode="edit"
          template={template}
          categories={categories}
          assignees={assignees}
          tagSuggestions={tagSuggestions}
          onCancel={() => setEditTemplateOpen(false)}
          onSubmit={async (patch) => {
            const r = await window.frame.db.updateRecurrenceTemplate(template.id, patch)
            if (!r.ok) throw new Error(r.error ?? 'Update failed')
            setEditTemplateOpen(false)
            await reload()
          }}
        />
      )}

      {confirmDeleteTpl && (
        <ConfirmDialog
          label="Delete recurring task"
          title={`Delete "${template.title}"?`}
          body={`The recurring template and all ${totalOccurrences} occurrence${totalOccurrences === 1 ? '' : 's'} will be archived. The audit log retains the full record.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDeleteTpl(false)}
          onConfirm={async () => {
            const r = await window.frame.db.softDeleteRecurrenceTemplate(template.id)
            setConfirmDeleteTpl(false)
            if (!r.ok) { setError(r.error ?? 'Delete failed'); return }
            onBack()
          }}
        />
      )}
    </div>
  )
}
