import type { Status, Priority } from '../types'

const STATUS_LABEL: Record<Status, string> = {
  PLANNING:  'Planning',
  WIP:       'In progress',
  BLOCKED:   'Blocked',
  ON_HOLD:   'On hold',
  DONE:      'Done',
  CANCELLED: 'Cancelled',
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`pill pill-status pill-status-${status.toLowerCase().replace('_', '-')}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function PriorityPill({ priority }: { priority: Priority | null }) {
  if (!priority) return <span className="muted">—</span>
  return (
    <span className={`pill pill-priority pill-priority-${priority.toLowerCase()}`}>
      {priority}
    </span>
  )
}

export function AssigneePile({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="muted">—</span>
  const visible = names.slice(0, 3)
  const extra   = names.length - visible.length
  return (
    <span className="assignee-pile" title={names.join(', ')}>
      {visible.map(n => <span key={n} className="assignee-chip">{n[0]}</span>)}
      {extra > 0 && <span className="assignee-chip assignee-chip-extra">+{extra}</span>}
    </span>
  )
}

export function TagCellPile({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="muted">—</span>
  const visible = tags.slice(0, 2)
  const extra   = tags.length - visible.length
  return (
    <span className="tag-cell-pile" title={tags.join(', ')}>
      {visible.map(t => <span key={t} className="tag-chip-static">{t}</span>)}
      {extra > 0 && <span className="tag-chip-static tag-chip-extra">+{extra}</span>}
    </span>
  )
}
