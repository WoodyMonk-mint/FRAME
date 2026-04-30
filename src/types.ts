// FRAME shared renderer types

export type ViewId = 'tasks' | 'my-work' | 'dashboard' | 'calendar' | 'settings'

export type ViewDef = {
  id:             ViewId
  label:          string
  iterationNote?: string
}

// ─── Domain ─────────────────────────────────────────────────────────────────

export type TaskType = 'one-off' | 'repeating' | 'workflow'
export type Status   = 'PLANNING' | 'WIP' | 'BLOCKED' | 'ON_HOLD' | 'DONE' | 'CANCELLED'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3'

export const ALL_STATUSES:   Status[]   = ['PLANNING', 'WIP', 'BLOCKED', 'ON_HOLD', 'DONE', 'CANCELLED']
export const ALL_PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3']

export type Category = {
  id:          number
  name:        string
  sortOrder:   number | null
  colour:      string | null
  isArchived:  boolean
}

export type Assignee = {
  id:          number
  name:        string
  isActive:    boolean
  sortOrder:   number | null
}

export type Task = {
  id:                 number
  type:               TaskType
  categoryId:         number | null
  categoryName:       string | null
  title:              string
  description:        string | null
  status:             Status
  priority:           Priority | null
  primaryOwner:       string | null
  assignees:          string[]
  dueDate:            string | null
  completedDate:      string | null
  percentComplete:    number
  notes:              string | null
  createdAt:          string
  updatedAt:          string
}

// Used when creating a task — only iteration-1 fields are exposed.
export type TaskInput = {
  title:           string
  categoryId:      number | null
  primaryOwner:    string | null
  assignees:       string[]
  status:          Status
  priority:        Priority | null
  dueDate:         string | null
  percentComplete: number
  description:     string | null
  notes:           string | null
}

export type TaskPatch = Partial<TaskInput> & {
  completedDate?: string | null
}
