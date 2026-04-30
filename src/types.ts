// FRAME shared renderer types — Iteration 0
// Domain types (Task, Category, Assignee, Workflow*) land in Iteration 1+.

export type ViewId = 'tasks' | 'my-work' | 'dashboard' | 'calendar' | 'settings'

export type ViewDef = {
  id:             ViewId
  label:          string
  iterationNote:  string
}
