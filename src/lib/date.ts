import type { Status } from '../types'

export type DueRange = 'all' | 'overdue' | 'today' | 'this-week' | 'no-date'

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isOverdue(dueDate: string | null, status: Status): boolean {
  if (!dueDate) return false
  if (status === 'DONE' || status === 'CANCELLED') return false
  return dueDate < todayIso()
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return iso
}

// Relative-time formatter for activity feeds. Input: SQLite "YYYY-MM-DD HH:MM:SS"
// (UTC, since SQLite's datetime('now') returns UTC) or any value parseable by Date.
// Returns short forms like "just now", "5m ago", "2h ago", "yesterday", "3d ago",
// or the date for anything older than ~7 days.
export function formatRelativeTime(input: string | null): string {
  if (!input) return ''
  const stamp = input.includes('T') ? input : input.replace(' ', 'T') + 'Z'
  const t = new Date(stamp).getTime()
  if (Number.isNaN(t)) return input
  const diffMs = Date.now() - t
  const sec = Math.round(diffMs / 1000)
  if (sec < 30)    return 'just now'
  if (sec < 90)    return '1m ago'
  const min = Math.round(sec / 60)
  if (min < 60)    return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24)     return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day === 1)   return 'yesterday'
  if (day < 7)     return `${day}d ago`
  return new Date(t).toISOString().slice(0, 10)
}

export function isInDueRange(dueDate: string | null, status: Status, range: DueRange): boolean {
  if (range === 'all')     return true
  if (range === 'no-date') return dueDate === null
  if (range === 'overdue') return isOverdue(dueDate, status)
  if (!dueDate) return false
  const today = todayIso()
  if (range === 'today') return dueDate === today
  if (range === 'this-week') {
    const end = new Date(today)
    end.setDate(end.getDate() + 7)
    const endIso = end.toISOString().slice(0, 10)
    return dueDate >= today && dueDate <= endIso
  }
  return true
}
