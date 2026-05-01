import { useEffect, useState } from 'react'
import type { Assignee } from '../types'

const THEME_KEY        = 'frame.theme'
const ACTIVE_USER_KEY  = 'frame.activeUser'

type Theme = 'dark' | 'light'

function readTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY)
  return v === 'light' ? 'light' : 'dark'
}
function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
}

export function GeneralPanel() {
  const [theme, setTheme]           = useState<Theme>(() => readTheme())
  const [assignees, setAssignees]   = useState<Assignee[]>([])
  const [activeUser, setActiveUser] = useState<string>(() => localStorage.getItem(ACTIVE_USER_KEY) ?? '')

  useEffect(() => {
    void window.frame.db.listAssignees().then(setAssignees)
  }, [])

  const onPickTheme = (next: Theme) => {
    setTheme(next)
    localStorage.setItem(THEME_KEY, next)
    applyTheme(next)
  }

  const onPickUser = (name: string) => {
    setActiveUser(name)
    if (name) localStorage.setItem(ACTIVE_USER_KEY, name)
    else      localStorage.removeItem(ACTIVE_USER_KEY)
  }

  const version = window.frame.version

  return (
    <div className="settings-section">
      <p className="muted compact">
        App-wide preferences, stored locally on this machine.
      </p>

      <section className="settings-card">
        <p className="settings-card-heading">Appearance</p>
        <div className="settings-prefs">
          <div className="settings-pref-row">
            <div className="settings-pref-label">
              <span>Theme</span>
              <span className="settings-pref-hint">
                Light theme is partially styled — full polish lands in Iteration 10.
              </span>
            </div>
            <div className="settings-pref-options">
              <label className="settings-pref-option">
                <input type="radio" name="theme" checked={theme === 'dark'}  onChange={() => onPickTheme('dark')} />
                Dark
              </label>
              <label className="settings-pref-option">
                <input type="radio" name="theme" checked={theme === 'light'} onChange={() => onPickTheme('light')} />
                Light
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <p className="settings-card-heading">Active user</p>
        <div className="settings-prefs">
          <div className="settings-pref-row">
            <div className="settings-pref-label">
              <span>Who am I?</span>
              <span className="settings-pref-hint">
                Used by the upcoming My Work view to filter to your tasks. Pick from the assignees list.
              </span>
            </div>
            <div className="settings-pref-options">
              <select value={activeUser} onChange={e => onPickUser(e.target.value)}>
                <option value="">— Not set —</option>
                {assignees.filter(a => a.isActive).map(a => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <p className="settings-card-heading">About</p>
        <div className="settings-prefs">
          <div className="settings-pref-row">
            <div className="settings-pref-label">
              <span>FRAME version</span>
            </div>
            <div className="settings-pref-options">
              <span className="muted compact">{version}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
