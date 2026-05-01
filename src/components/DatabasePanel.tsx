import { useEffect, useState } from 'react'

type Backup = { filename: string; path: string; size: number; isoDate: string }

export function DatabasePanel() {
  const [paths, setPaths] = useState<{ dbPath: string | null; backupPath: string | null; backupsDir: string | null } | null>(null)
  const [backups, setBackups] = useState<Backup[]>([])
  const [error, setError]     = useState<string | null>(null)
  const [info, setInfo]       = useState<string | null>(null)
  const [busy, setBusy]       = useState<string | null>(null)

  const reload = async () => {
    setError(null)
    try {
      const [p, b] = await Promise.all([
        window.frame.db.getPaths(),
        window.frame.db.listBackups(),
      ])
      setPaths(p)
      setBackups(b)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => { void reload() }, [])

  const wrap = async (label: string, fn: () => Promise<{ ok?: boolean; error?: string; cancelled?: boolean; path?: string; snapshotDate?: string; taskCount?: number }>) => {
    setBusy(label)
    setError(null)
    setInfo(null)
    try {
      const r = await fn()
      if (r.cancelled) {
        setInfo(`${label}: cancelled`)
      } else if (r.ok === false) {
        setError(r.error ?? `${label} failed`)
      } else if (label === 'Take snapshot now') {
        setInfo(`Snapshot saved (${r.taskCount ?? 0} tasks · ${r.snapshotDate ?? 'today'})`)
      } else {
        setInfo(`${label}: done${r.path ? ` (${r.path})` : ''}`)
      }
      await reload()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="settings-section">
      <p className="muted compact">
        Database location, backups, and snapshot tools. Every app launch writes a session backup
        and an idempotent daily snapshot automatically — these controls are for ad-hoc actions.
      </p>

      {error && <div className="setup-error">{error}</div>}
      {info  && <p className="muted compact">{info}</p>}

      <section className="settings-card">
        <p className="settings-card-heading">Paths</p>
        <div className="settings-prefs">
          <div className="settings-pref-row">
            <div className="settings-pref-label"><span>Active DB</span></div>
            <div className="settings-pref-options">
              <code className="settings-path">{paths?.dbPath ?? '—'}</code>
            </div>
          </div>
          <div className="settings-pref-row">
            <div className="settings-pref-label"><span>Session backup</span></div>
            <div className="settings-pref-options">
              <code className="settings-path">{paths?.backupPath ?? '—'}</code>
            </div>
          </div>
          <div className="settings-pref-row">
            <div className="settings-pref-label"><span>Backups directory</span></div>
            <div className="settings-pref-options">
              <code className="settings-path">{paths?.backupsDir ?? '—'}</code>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <p className="settings-card-heading">Maintenance</p>
        <div className="settings-prefs">
          <div className="settings-pref-row">
            <div className="settings-pref-label">
              <span>Snapshot</span>
              <span className="settings-pref-hint">Capture today's state for the trend charts.</span>
            </div>
            <div className="settings-pref-options">
              <button
                className="chip"
                disabled={busy !== null}
                onClick={() => wrap('Take snapshot now', () => window.frame.db.takeSnapshot())}
              >{busy === 'Take snapshot now' ? 'Working…' : 'Take snapshot now'}</button>
            </div>
          </div>
          <div className="settings-pref-row">
            <div className="settings-pref-label">
              <span>Move database</span>
              <span className="settings-pref-hint">Pick a different folder; FRAME copies the DB and re-points to the new path.</span>
            </div>
            <div className="settings-pref-options">
              <button
                className="chip"
                disabled={busy !== null}
                onClick={() => wrap('Move database', () => window.frame.db.moveDb())}
              >{busy === 'Move database' ? 'Working…' : 'Move database'}</button>
            </div>
          </div>
          <div className="settings-pref-row">
            <div className="settings-pref-label">
              <span>Export</span>
              <span className="settings-pref-hint">Save a copy of the current DB to a file.</span>
            </div>
            <div className="settings-pref-options">
              <button
                className="chip"
                disabled={busy !== null}
                onClick={() => wrap('Export', () => window.frame.db.exportDb())}
              >{busy === 'Export' ? 'Working…' : 'Export'}</button>
            </div>
          </div>
          <div className="settings-pref-row">
            <div className="settings-pref-label">
              <span>Import</span>
              <span className="settings-pref-hint">Replace the current DB with a chosen file. Backed up first.</span>
            </div>
            <div className="settings-pref-options">
              <button
                className="chip"
                disabled={busy !== null}
                onClick={() => wrap('Import', () => window.frame.db.importDb())}
              >{busy === 'Import' ? 'Working…' : 'Import'}</button>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <p className="settings-card-heading">Backups</p>
        {backups.length === 0 ? (
          <p className="muted compact">No backups yet.</p>
        ) : (
          <table className="task-table settings-table">
            <thead>
              <tr>
                <th>Filename</th>
                <th style={{ width: '8rem' }}>Size</th>
                <th style={{ width: '12rem' }}>Created</th>
                <th style={{ width: '10rem', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {backups.map(b => (
                <tr key={b.path} className="task-row">
                  <td><code className="settings-path">{b.filename}</code></td>
                  <td>{(b.size / 1024).toFixed(0)} KB</td>
                  <td>{b.isoDate.replace('T', ' ').slice(0, 19)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="chip"
                      disabled={busy !== null}
                      onClick={() => wrap('Restore', () => window.frame.db.restoreSpecific(b.path))}
                    >Restore</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
