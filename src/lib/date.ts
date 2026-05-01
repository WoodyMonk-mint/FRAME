import type { RecurrenceUnit, Status } from '../types'

export type DueRange = 'all' | 'overdue' | 'today' | 'this-week' | 'no-date'

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// Weekend-aware "today" for overdue calculations: on a Saturday or Sunday
// we step back to Friday so a task due Friday isn't flagged "overdue" until
// Monday rolls around.
function effectiveTodayForOverdue(): string {
  const d = new Date()
  const day = d.getDay() // 0 = Sunday, 6 = Saturday
  if (day === 6) d.setDate(d.getDate() - 1) // Sat → Fri
  if (day === 0) d.setDate(d.getDate() - 2) // Sun → Fri
  return d.toISOString().slice(0, 10)
}

export function isOverdue(dueDate: string | null, status: Status): boolean {
  if (!dueDate) return false
  if (status === 'DONE' || status === 'CANCELLED') return false
  return dueDate < effectiveTodayForOverdue()
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

// Step a YYYY-MM-DD date forward by a recurrence rule. Returns null if the
// inputs are missing or invalid. Mirrors the backend's addRecurrence helper.
export function addRecurrence(iso: string | null, unit: RecurrenceUnit | null, interval: number | null): string | null {
  if (!iso || !unit) return null
  const n = Math.max(1, interval ?? 1)
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  switch (unit) {
    case 'day':   d.setUTCDate(d.getUTCDate()       + n);     break
    case 'week':  d.setUTCDate(d.getUTCDate()       + n * 7); break
    case 'month': d.setUTCMonth(d.getUTCMonth()     + n);     break
    case 'year':  d.setUTCFullYear(d.getUTCFullYear() + n);   break
    default: return null
  }
  return d.toISOString().slice(0, 10)
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
