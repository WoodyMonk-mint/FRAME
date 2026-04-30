import type { Task } from '../types'

const HEADERS = [
  'id',
  'type',
  'category',
  'parent_task_id',
  'title',
  'status',
  'priority',
  'primary_owner',
  'assignees',
  'tags',
  'due_date',
  'completed_date',
  'percent_complete',
  'percent_manual',
  'description',
  'notes',
  'created_at',
] as const

function escape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/["\n,]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function tasksToCsv(tasks: Task[]): string {
  const lines: string[] = [HEADERS.join(',')]
  for (const t of tasks) {
    lines.push([
      t.id,
      t.type,
      t.categoryName ?? '',
      t.parentTaskId ?? '',
      t.title,
      t.status,
      t.priority ?? '',
      t.primaryOwner ?? '',
      t.assignees.join('; '),
      t.tags.join('; '),
      t.dueDate ?? '',
      t.completedDate ?? '',
      t.percentComplete,
      t.percentManual ? '1' : '0',
      t.description ?? '',
      t.notes ?? '',
      t.createdAt,
    ].map(escape).join(','))
  }
  return lines.join('\n') + '\n'
}
