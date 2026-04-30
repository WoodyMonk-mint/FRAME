import type { Status, Priority } from '../types'

const STATUS_LABEL: Record<Status, string> = {
  PLANNING:  'Planning',
  WIP:       'In progress',
  BLOCKED:   'Blocked',
  DONE:      'Done',
  CANCELLED: 'Cancelled',
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`pill pill-status pill-status-${status.toLowerCase()}`}>
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
