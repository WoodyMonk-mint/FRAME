import type { Status } from '../types'

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
