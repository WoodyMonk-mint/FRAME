/// <reference types="vite/client" />

declare global {
  type DbStatus = 'checking' | 'first-run' | 'ready' | 'missing' | 'corrupt'

  interface DbStatusInfo {
    status:      DbStatus
    dbPath:      string | null
    defaultPath: string
    hasBackup:   boolean
    backupPath?: string
    error?:      string
  }

  interface SetupResult { ok: boolean; cancelled?: boolean; error?: string; dbPath?: string }

  interface FrameDb {
    getStatus:       () => Promise<DbStatusInfo>
    setup:           (opts: { action: 'use-default' | 'choose-folder' | 'import' }) => Promise<SetupResult>
    wipeAndReset:    () => Promise<{ ok: boolean; error?: string; dbPath?: string }>
    moveDb:          () => Promise<{ ok: boolean; cancelled?: boolean; error?: string; dbPath?: string; backupsDir?: string }>
    getPaths:        () => Promise<{ dbPath: string | null; backupPath: string | null; backupsDir: string | null }>
    exportDb:        () => Promise<{ ok: boolean; cancelled?: boolean; error?: string; path?: string }>
    importDb:        () => Promise<{ ok: boolean; cancelled?: boolean; error?: string }>
    restoreBackup:   () => Promise<{ ok: boolean; error?: string }>
    listBackups:     () => Promise<Array<{ filename: string; path: string; size: number; isoDate: string }>>
    restoreSpecific: (filePath: string) => Promise<{ ok: boolean; error?: string }>

    // Domain — Iteration 1+
    listTasks:       () => Promise<import('./types').Task[]>
    listCategories:  () => Promise<import('./types').Category[]>
    listAssignees:   () => Promise<import('./types').Assignee[]>
    listTags:        () => Promise<string[]>
    createTask:      (input: import('./types').TaskInput) => Promise<{ ok: boolean; task?: import('./types').Task; error?: string }>
    updateTask:      (id: number, patch: import('./types').TaskPatch) => Promise<{ ok: boolean; task?: import('./types').Task; error?: string }>
    softDeleteTask:  (id: number) => Promise<{ ok: boolean; error?: string }>

    // Workflows — Iteration 3
    listWorkflowTemplates:  () => Promise<import('./types').WorkflowTemplate[]>
    listWorkflowInstances:  () => Promise<import('./types').WorkflowInstance[]>
    createWorkflowInstance: (input: import('./types').NewWorkflowInput) =>
      Promise<{ ok: boolean; instanceId?: number; error?: string }>
    getWorkflowInstance:    (id: number) => Promise<
      | { ok: true; instance: import('./types').WorkflowInstance; steps: import('./types').WorkflowStep[] }
      | { ok: false; error: string }
    >
    updateWorkflowInstance: (id: number, patch: import('./types').WorkflowPatch) =>
      Promise<{ ok: boolean; error?: string }>
    softDeleteWorkflowInstance: (id: number) =>
      Promise<{ ok: boolean; error?: string }>

    // Recurring tasks — Iteration 4
    listRecurrenceTemplates:  () => Promise<import('./types').RecurrenceTemplateSummary[]>
    getRecurrenceTemplate:    (id: number) => Promise<
      | {
          ok: true
          template:    import('./types').Task
          occurrences: import('./types').Task[]
          subtasks:    import('./types').Task[]
        }
      | { ok: false; error: string }
    >
    createRecurrenceTemplate: (input: import('./types').NewRecurrenceInput) =>
      Promise<{ ok: boolean; templateId?: number; firstOccurrenceId?: number; error?: string }>
    updateRecurrenceTemplate: (id: number, patch: import('./types').RecurrencePatch) =>
      Promise<{ ok: boolean; error?: string }>
    softDeleteRecurrenceTemplate: (id: number) =>
      Promise<{ ok: boolean; error?: string }>
    completeRecurringOccurrence: (
      taskId: number, completedDate: string | null, note: string | null, createNext: boolean
    ) => Promise<{ ok: boolean; nextTaskId?: number | null; error?: string }>
    reorderChecklist:         (parentId: number | null, orderedTaskIds: number[]) =>
      Promise<{ ok: boolean; error?: string }>
    addWorkflowStep:        (instanceId: number, input: import('./types').NewWorkflowStepInput) =>
      Promise<{ ok: boolean; stepId?: number; taskId?: number; error?: string }>
    listWorkflowNotes:      (instanceId: number) =>
      Promise<import('./types').WorkflowNote[]>
    addWorkflowNote:        (instanceId: number, note: string, author?: string | null) =>
      Promise<{ ok: boolean; noteId?: number; error?: string }>
    reorderWorkflowSteps:   (instanceId: number, orderedTaskIds: number[], reason?: string | null) =>
      Promise<{ ok: boolean; flippedStepIds?: number[]; error?: string }>
  }

  interface FrameAppApi {
    saveCsv: (content: string, suggestedName?: string) =>
      Promise<{ ok: boolean; cancelled?: boolean; error?: string; path?: string }>
  }

  interface FrameApi {
    version:      string
    openExternal: (url: string) => Promise<void>
    app:          FrameAppApi
    db:           FrameDb
  }

  interface Window {
    frame: FrameApi
  }
}

export {}
