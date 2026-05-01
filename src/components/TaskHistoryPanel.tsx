import { useEffect, useState } from 'react'
import type { TaskHistoryEntry } from '../types'
import { formatRelativeTime } from '../lib/date'

type Props = {
  taskId: number
}

const FIELD_LABEL: Record<string, string> = {
  title:                'Title',
  status:               'Status',
  priority:             'Priority',
  primary_owner:        'Owner',
  due_date:             'Due',
  completed_date:       'Completed',
  percent_complete:     '%',
  percent_manual:       'Manual %',
  description:          'Description',
  notes:                'Notes',
  blocked_reason:       'Blocker reason',
  blocked_by_task_id:   'Blocked by',
  parent_task_id:       'Parent',
  category_id:          'Category',
  is_deleted:           'Deleted',
  recurrence_unit:      'Repeats',
  recurrence_interval:  'Repeat interval',
  auto_create_next:     'Auto-create next',
}

const ARRAY_FIELD_LABEL: Record<string, string> = {
  assignees: 'Team',
  tags:      'Tags',
}

const ACTION_LABEL: Record<string, string> = {
  INSERT:                          'Created',
  UPDATE:                          'Updated',
  SOFT_DELETE:                     'Archived',
  COMPLETE_RECURRING:              'Marked done (recurring)',
  INSERT_RECURRENCE_TEMPLATE:      'Created recurrence template',
  UPDATE_RECURRENCE_TEMPLATE:      'Updated recurrence template',
  SOFT_DELETE_RECURRENCE_TEMPLATE: 'Archived recurrence template',
}

function formatValue(v: unknown): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number')  return String(v)
  return String(v)
}

type Diff = { label: string; from: string; to: string }

function diffEntries(oldV: Record<string, unknown> | null, newV: Record<string, unknown> | null): Diff[] {
  if (!newV) return []
  const out: Diff[] = []
  // For an INSERT we have only newV — show every populated field as a "set" op.
  if (!oldV) {
    for (const [key, label] of Object.entries(FIELD_LABEL)) {
      const v = newV[key]
      if (v != null && v !== '' && v !== 0 && v !== false) {
        out.push({ label, from: '—', to: formatValue(v) })
      }
    }
    for (const [key, label] of Object.entries(ARRAY_FIELD_LABEL)) {
      const arr = (newV[key] as unknown[]) ?? []
      if (arr.length > 0) out.push({ label, from: '—', to: arr.join(', ') })
    }
    return out
  }
  for (const [key, label] of Object.entries(FIELD_LABEL)) {
    const a = oldV[key], b = newV[key]
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push({ label, from: formatValue(a), to: formatValue(b) })
    }
  }
  for (const [key, label] of Object.entries(ARRAY_FIELD_LABEL)) {
    const a = (oldV[key] as unknown[]) ?? []
    const b = (newV[key] as unknown[]) ?? []
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push({
        label,
        from: a.length === 0 ? '—' : (a as string[]).join(', '),
        to:   b.length === 0 ? '—' : (b as string[]).join(', '),
      })
    }
  }
  return out
}

export function TaskHistoryPanel({ taskId }: Props) {
  const [entries, setEntries] = useState<TaskHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await window.frame.db.listTaskHistory(taskId)
        if (!cancelled) setEntries(r)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [taskId])

  return (
    <details className="task-history" open={false}>
      <summary>
        History {loading ? '…' : `(${entries.length})`}
      </summary>
      {error && <div className="setup-error">{error}</div>}
      {!loading && entries.length === 0 && (
        <p className="muted compact">No history yet.</p>
      )}
      <ul className="task-history-list">
        {entries.map(e => {
          const diffs = diffEntries(e.oldValues, e.newValues)
          const actionLabel = ACTION_LABEL[e.action] ?? e.action
          return (
            <li key={e.id} className="task-history-entry">
              <div className="task-history-meta">
                <strong>{actionLabel}</strong>
                <span className="muted compact">
                  {' · '}{e.changedBy ?? 'unknown'}{' · '}{formatRelativeTime(e.createdAt)}
                </span>
              </div>
              {diffs.length > 0 && (
                <ul className="task-history-diff">
                  {diffs.map((d, i) => (
                    <li key={i}>
                      <span className="muted compact">{d.label}: </span>
                      <span className="task-history-from">{d.from}</span>
                      <span className="muted compact"> → </span>
                      <span className="task-history-to">{d.to}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
