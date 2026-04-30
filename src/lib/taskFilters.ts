import type { Priority, Status, Task } from '../types'
import type { DueRange } from './date'
import { isInDueRange } from './date'

// Exclusion-based model (mirrors PRISM portfolio filters): an empty set means
// "show all"; values listed in the exclusion set are hidden. Status defaults
// to hiding DONE / CANCELLED so the open queue is the natural starting view.

export type TaskFilters = {
  excludedStatuses:    Status[]
  excludedCategoryIds: number[]
  excludedPriorities:  Priority[]
  excludedOwners:      string[]    // assignee names; '' means "(Unassigned)"
  excludedTags:        string[]
  dueRange:            DueRange
}

export const DEFAULT_FILTERS: TaskFilters = {
  excludedStatuses:    ['DONE', 'CANCELLED'],
  excludedCategoryIds: [],
  excludedPriorities:  [],
  excludedOwners:      [],
  excludedTags:        [],
  dueRange:            'all',
}

export type TaskFilterPreset = {
  id:      string
  name:    string
  filters: TaskFilters
}

export const STORAGE_PRESETS_KEY = 'frame.taskFilterPresets'
export const STORAGE_DEFAULT_KEY = 'frame.taskFilterDefault'

export function loadPresets(): TaskFilterPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_PRESETS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function savePresets(presets: TaskFilterPreset[]): void {
  localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(presets))
}

export function getDefaultPresetId(): string | null {
  try { return localStorage.getItem(STORAGE_DEFAULT_KEY) } catch { return null }
}

export function setDefaultPresetId(id: string | null): void {
  if (id === null) localStorage.removeItem(STORAGE_DEFAULT_KEY)
  else             localStorage.setItem(STORAGE_DEFAULT_KEY, id)
}

export function passesFilters(t: Task, f: TaskFilters): boolean {
  if (f.excludedStatuses.includes(t.status)) return false
  if (t.categoryId !== null && f.excludedCategoryIds.includes(t.categoryId)) return false
  if (t.priority !== null && f.excludedPriorities.includes(t.priority)) return false
  const ownerKey = t.primaryOwner ?? ''
  if (f.excludedOwners.includes(ownerKey)) return false
  if (f.excludedTags.length > 0 && t.tags.some(tag => f.excludedTags.includes(tag))) return false
  if (!isInDueRange(t.dueDate, t.status, f.dueRange)) return false
  return true
}

export function activeFilterCount(f: TaskFilters): number {
  let n = 0
  if (f.excludedStatuses.length > 0    && !sameSet(f.excludedStatuses, DEFAULT_FILTERS.excludedStatuses)) n++
  else if (f.excludedStatuses.length === 0 && DEFAULT_FILTERS.excludedStatuses.length > 0) n++
  if (f.excludedCategoryIds.length > 0) n++
  if (f.excludedPriorities.length > 0)  n++
  if (f.excludedOwners.length > 0)      n++
  if (f.excludedTags.length > 0)        n++
  if (f.dueRange !== 'all')             n++
  return n
}

export function isDefault(f: TaskFilters): boolean {
  return sameSet(f.excludedStatuses, DEFAULT_FILTERS.excludedStatuses)
    && f.excludedCategoryIds.length === 0
    && f.excludedPriorities.length === 0
    && f.excludedOwners.length === 0
    && f.excludedTags.length === 0
    && f.dueRange === 'all'
}

function sameSet<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every(v => set.has(v))
}
