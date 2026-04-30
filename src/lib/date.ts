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
