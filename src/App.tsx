import { useEffect, useState } from 'react'
import type { ViewDef, ViewId } from './types'
import { DashboardView } from './views/DashboardView'
import { RecurringView } from './views/RecurringView'
import { TaskListView } from './views/TaskListView'
import { WorkflowsView } from './views/WorkflowsView'
import './index.css'

// FRAME — Focus, Resource and Activity Management Engine

const VIEWS: ViewDef[] = [
  { id: 'tasks',     label: 'Task List' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'my-work',   label: 'My Work',   iterationNote: 'Coming in Iteration 9 — personal task view filtered to the active user.' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'calendar',  label: 'Calendar',  iterationNote: 'Coming in Iteration 7 — month/week view with task blocks.' },
  { id: 'settings',  label: 'Settings',  iterationNote: 'Coming in Iteration 9 — taxonomy management with unlock-to-edit.' },
]

function App() {
  const [status, setStatus]         = useState<DbStatusInfo | null>(null)
  const [busy, setBusy]             = useState(false)
  const [activeView, setActiveView] = useState<ViewId>('tasks')
  // Lifted so other views (e.g. Task List) can navigate to a specific
  // workflow by setting both the active view and the selected instance.
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  // Pending filter from the Dashboard cards. Set by DashboardView, consumed
  // and cleared by TaskListView when it mounts / receives the prop.
  const [pendingTaskFilter, setPendingTaskFilter] = useState<
    import('./lib/taskFilters').QuickFilterPreset | null
  >(null)

  const refreshStatus = async () => {
    if (!window.frame?.db) return
    const s = await window.frame.db.getStatus()
    setStatus(s)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!window.frame?.db) return
      const s = await window.frame.db.getStatus()
      if (!cancelled) setStatus(s)
    })()
    return () => { cancelled = true }
  }, [])

  if (!status) {
    return (
      <div className="boot-screen">
        <div className="boot-logo">FRAME</div>
      </div>
    )
  }

  if (status.status !== 'ready') {
    return (
      <SetupScreen
        status={status}
        busy={busy}
        setBusy={setBusy}
        onChange={refreshStatus}
      />
    )
  }

  const view = VIEWS.find(v => v.id === activeView) ?? VIEWS[0]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">FRAME</div>
        <nav className="sidebar-nav">
          {VIEWS.map(v => (
            <button
              key={v.id}
              className={`nav-item ${v.id === activeView ? 'nav-item-active' : ''}`}
              onClick={() => setActiveView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer muted">v{window.frame.version}</div>
      </aside>
      <main className="main-content">
        {view.id === 'tasks' ? (
          <TaskListView
            onOpenWorkflow={(id) => {
              setSelectedWorkflowId(id)
              setActiveView('workflows')
            }}
            pendingFilter={pendingTaskFilter}
            onPendingFilterApplied={() => setPendingTaskFilter(null)}
          />
        ) : view.id === 'workflows' ? (
          <WorkflowsView
            selectedId={selectedWorkflowId}
            onSelect={setSelectedWorkflowId}
            onBack={() => setSelectedWorkflowId(null)}
          />
        ) : view.id === 'recurring' ? (
          <RecurringView />
        ) : view.id === 'dashboard' ? (
          <DashboardView
            onJumpToTasks={(preset) => {
              setPendingTaskFilter(preset)
              setActiveView('tasks')
            }}
          />
        ) : (
          <>
            <header className="view-header">
              <h1>{view.label}</h1>
            </header>
            <div className="view-empty">
              <p className="muted">{view.iterationNote}</p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function SetupScreen({ status, busy, setBusy, onChange }: {
  status:   DbStatusInfo
  busy:     boolean
  setBusy:  (b: boolean) => void
  onChange: () => Promise<void>
}) {
  const [error, setError] = useState<string | null>(status.error ?? null)

  const run = async (action: 'use-default' | 'choose-folder' | 'import') => {
    setBusy(true)
    setError(null)
    try {
      const r = await window.frame.db.setup({ action })
      if (r.ok) await onChange()
      else if (r.error) setError(r.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const wipe = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await window.frame.db.wipeAndReset()
      if (r.ok) await onChange()
      else if (r.error) setError(r.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const restoreBackup = async () => {
    setBusy(true)
    try { await window.frame.db.restoreBackup() }
    finally { setBusy(false) }
  }

  const headlines: Record<DbStatus, string> = {
    'first-run': 'Welcome to FRAME',
    'missing':   'Database not found',
    'corrupt':   'Database failed integrity check',
    'checking':  'Checking…',
    'ready':     '',
  }
  const subtitles: Record<DbStatus, string> = {
    'first-run': 'Choose where to store your FRAME database. You can change this later in Settings.',
    'missing':   `Configured database file not found at: ${status.dbPath ?? '(unknown)'}`,
    'corrupt':   'The database file could not be opened. Choose a recovery option below.',
    'checking':  '',
    'ready':     '',
  }
  const headline = headlines[status.status]
  const subtitle = subtitles[status.status]

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-brand">FRAME</div>
        <h1>{headline}</h1>
        <p className="muted">{subtitle}</p>

        {error && <div className="setup-error">{error}</div>}

        <div className="setup-options">
          {status.status === 'first-run' && (
            <>
              <button className="setup-option" disabled={busy} onClick={() => run('use-default')}>
                <div className="setup-option-title">Use default location</div>
                <div className="setup-option-desc">{status.defaultPath}</div>
              </button>
              <button className="setup-option" disabled={busy} onClick={() => run('choose-folder')}>
                <div className="setup-option-title">Choose a folder</div>
                <div className="setup-option-desc">Pick any folder (e.g. a network drive) — a fresh FRAME database will be created there.</div>
              </button>
              <button className="setup-option" disabled={busy} onClick={() => run('import')}>
                <div className="setup-option-title">Import an existing database</div>
                <div className="setup-option-desc">Copy an existing frame.db into a chosen folder and open it.</div>
              </button>
            </>
          )}

          {status.status === 'missing' && (
            <>
              <button className="setup-option" disabled={busy} onClick={wipe}>
                <div className="setup-option-title">Recreate at this path</div>
                <div className="setup-option-desc">Create a fresh empty FRAME database at {status.dbPath}.</div>
              </button>
              <button className="setup-option" disabled={busy} onClick={() => run('choose-folder')}>
                <div className="setup-option-title">Choose a different folder</div>
                <div className="setup-option-desc">Point FRAME at another location instead.</div>
              </button>
            </>
          )}

          {status.status === 'corrupt' && (
            <>
              <button className="setup-option setup-option-danger" disabled={busy} onClick={wipe}>
                <div className="setup-option-title">Wipe and start fresh</div>
                <div className="setup-option-desc">Delete the file at {status.dbPath} and create a new empty database.</div>
              </button>
              {status.hasBackup && (
                <button className="setup-option" disabled={busy} onClick={restoreBackup}>
                  <div className="setup-option-title">Restore most recent session backup</div>
                  <div className="setup-option-desc">{status.backupPath}</div>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
