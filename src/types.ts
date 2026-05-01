// FRAME shared renderer types

export type ViewId = 'tasks' | 'workflows' | 'recurring' | 'my-work' | 'dashboard' | 'calendar' | 'planning' | 'settings'

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year'
export const RECURRENCE_UNITS: RecurrenceUnit[] = ['day', 'week', 'month', 'year']

export type ViewDef = {
  id:             ViewId
  label:          string
  iterationNote?: string
}

// ─── Domain ─────────────────────────────────────────────────────────────────

export type TaskType = 'one-off' | 'feature' | 'repeating' | 'workflow'

// Types selectable from the generic "Add task" dialog. Recurring lives in
// the Recurring view; workflow steps live in their workflow instance.
export const CREATABLE_TASK_TYPES: Array<{ value: TaskType; label: string }> = [
  { value: 'one-off', label: 'Task' },
  { value: 'feature', label: 'Feature' },
]
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
  id:                   number
  type:                 TaskType
  categoryId:           number | null
  categoryName:         string | null
  parentTaskId:         number | null
  workflowInstanceId:   number | null
  workflowStepNumber:   number | null
  recurrenceTemplateId: number | null
  recurrenceUnit:       RecurrenceUnit | null
  recurrenceInterval:   number | null
  autoCreateNext:       boolean | null
  sortOrder:            number | null
  blockedByTaskId:      number | null
  blockedReason:        string | null
  periodIds:            number[]
  title:                string
  description:        string | null
  status:             Status
  priority:           Priority | null
  primaryOwner:       string | null
  assignees:          string[]
  tags:               string[]
  dueDate:            string | null
  completedDate:      string | null
  percentComplete:    number
  percentManual:      boolean
  notes:              string | null
  createdAt:          string
  updatedAt:          string
}

export type TaskInput = {
  title:            string
  type?:            TaskType        // 'one-off' (default) | 'feature' for the generic dialog
  categoryId:       number | null
  parentTaskId?:    number | null
  primaryOwner:     string | null
  assignees:        string[]
  tags:             string[]
  status:           Status
  priority:         Priority | null
  dueDate:          string | null
  percentComplete:  number
  percentManual:    boolean
  description:      string | null
  notes:            string | null
  blockedByTaskId?: number | null
  blockedReason?:   string | null
}

export type TaskPatch = Partial<TaskInput> & {
  completedDate?: string | null
}

export type TaskHistoryEntry = {
  id:         number
  action:     string
  changedBy:  string | null
  oldValues:  Record<string, unknown> | null
  newValues:  Record<string, unknown> | null
  createdAt:  string
}

export type OverdueTrendPoint = {
  date:          string
  overdueCount:  number
  openCount:     number
}

// ─── Workflows ──────────────────────────────────────────────────────────────

export type WorkflowTemplate = {
  id:           number
  name:         string
  gateType:     string | null
  description:  string | null
  categoryId:   number | null
  categoryName?: string | null   // present from get-workflow-template; absent from list
  isArchived:   boolean
  stepCount:    number
  createdAt?:   string
}

export type WorkflowTemplateStep = {
  id:           number
  templateId:   number
  stepNumber:   number
  title:        string
  description:  string | null
  defaultOwner: string | null
  offsetDays:   number | null
  isOptional:   boolean
}

export type NewWorkflowTemplateInput = {
  name:         string
  gateType?:    string | null
  description?: string | null
  categoryId?:  number | null
}

export type WorkflowTemplatePatch = Partial<NewWorkflowTemplateInput> & {
  isArchived?: boolean
}

export type NewWorkflowTemplateStepInput = {
  title:         string
  description?:  string | null
  defaultOwner?: string | null
  offsetDays?:   number | null
  isOptional?:   boolean
}

export type WorkflowTemplateStepPatch = Partial<NewWorkflowTemplateStepInput>

export type WorkflowInstance = {
  id:            number
  templateId:    number | null
  templateName:  string | null
  categoryId:    number | null
  categoryName:  string | null
  name:          string
  gateType:      string | null
  projectRef:    string | null
  startDate:     string | null
  targetDate:    string | null
  status:        Status
  priority:      Priority | null
  primaryOwner:  string | null
  assignees:     string[]
  notes:         string | null
  tags:          string[]
  periodIds:     number[]
  totalSteps:    number
  doneSteps:     number
  percentDone:   number
  createdAt:     string
  updatedAt:     string
}

export type NewWorkflowInput = {
  templateId:           number
  name:                 string
  gateType?:            string | null
  projectRef?:          string | null
  startDate?:           string | null
  targetDate?:          string | null
  status?:              Status
  priority?:            Priority | null
  primaryOwner?:        string | null
  assignees?:           string[]
  tags?:                string[]
  applyTagsToSteps?:    boolean
  applyOffsets?:        boolean
  applyPriorityToSteps?: boolean
  applyOwnerToSteps?:    boolean
  applyTeamToSteps?:     boolean
}

export type WorkflowPatch = {
  name?:         string
  gateType?:     string | null
  projectRef?:   string | null
  startDate?:    string | null
  targetDate?:   string | null
  status?:       Status
  priority?:     Priority | null
  primaryOwner?: string | null
  assignees?:    string[]
  tags?:         string[]
  notes?:        string | null
}

export type WorkflowStep = {
  stepId:             number
  stepNumber:         number
  templateStepId:     number | null
  templateStepNumber: number | null
  templateTitle:      string | null
  isDeviation:        boolean
  deviationReason:    string | null
  task:               Task | null
}

export type NewWorkflowStepInput = {
  title:            string
  deviationReason?: string | null
  description?:     string | null
  primaryOwner?:    string | null
  priority?:        Priority | null
  dueDate?:         string | null
}

export type WorkflowNote = {
  id:         number
  instanceId: number
  note:       string
  author:     string | null
  createdAt:  string
}

// ─── Planning periods ──────────────────────────────────────────────────────

export type PlanningPeriodKind = 'sprint' | 'quarter' | 'custom'

export type PlanningPeriod = {
  id:             number
  name:           string
  kind:           PlanningPeriodKind
  startDate:      string
  endDate:        string
  isArchived:     boolean
  notes:          string | null
  createdAt:      string
  totalCommitted: number
  doneCommitted:  number
  hitRate:        number
}

export type NewPlanningPeriodInput = {
  name:       string
  kind:       PlanningPeriodKind
  startDate:  string
  endDate:    string
  notes?:     string | null
}

export type PlanningPeriodPatch = Partial<NewPlanningPeriodInput> & {
  isArchived?: boolean
}

// ─── Recurring tasks ────────────────────────────────────────────────────────

export type RecurrenceTemplateSummary = {
  template:         Task            // the template row (recurrence_template_id IS NULL)
  totalOccurrences: number
  doneOccurrences:  number
  nextOpenDue:      string | null   // earliest due date among open occurrences
  lastCompleted:    string | null   // most recent completed_date
}

export type RecurrenceTemplateDetail = {
  template:    Task
  occurrences: Task[]
}

export type NewSubtaskTemplateInput = {
  title:         string
  description?:  string | null
  priority?:     Priority | null
  primaryOwner?: string | null
}

export type NewRecurrenceInput = {
  title:               string
  description?:        string | null
  categoryId?:         number | null
  priority?:           Priority | null
  primaryOwner?:       string | null
  assignees?:          string[]
  tags?:               string[]
  dueDate:             string         // first occurrence due date — required
  recurrenceUnit:      RecurrenceUnit
  recurrenceInterval:  number
  recurrenceAnchor?:   string | null
  recurrenceType?:     string | null
  autoCreateNext?:     boolean
  notes?:              string | null
  subtasks?:           NewSubtaskTemplateInput[]
}

export type RecurrencePatch = Partial<NewRecurrenceInput>

export type WorkflowInstanceDetail = {
  instance: WorkflowInstance
  steps:    WorkflowStep[]
}
