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
