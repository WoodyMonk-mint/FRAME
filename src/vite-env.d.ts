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
  }

  interface FrameApi {
    version:      string
    openExternal: (url: string) => Promise<void>
    db:           FrameDb
  }

  interface Window {
    frame: FrameApi
  }
}

export {}
