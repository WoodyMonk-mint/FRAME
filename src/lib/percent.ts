import type { Task } from '../types'

// Auto-computed % complete for a parent task: average of its children's
// effective progress. DONE counts as 100; CANCELLED is excluded from the
// denominator entirely; everything else uses the child's stored
// percent_complete.
export function computeAutoPercent(children: Task[]): number {
  if (children.length === 0) return 0
  const valid = children.filter(c => c.status !== 'CANCELLED')
  if (valid.length === 0) return 0
  const sum = valid.reduce((acc, c) => acc + (c.status === 'DONE' ? 100 : c.percentComplete), 0)
  return Math.round(sum / valid.length)
}

// What % to display for a task, given its children. Auto by default; manual
// override returns the stored value. Tasks with no children always show stored.
export function effectivePercent(task: Task, children: Task[]): number {
  if (children.length === 0) return task.percentComplete
  if (task.percentManual)   return task.percentComplete
  return computeAutoPercent(children)
}
