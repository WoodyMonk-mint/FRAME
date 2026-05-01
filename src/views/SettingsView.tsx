import { useState } from 'react'
import { AssigneesPanel } from '../components/AssigneesPanel'
import { CategoriesPanel } from '../components/CategoriesPanel'
import { DatabasePanel } from '../components/DatabasePanel'
import { GeneralPanel } from '../components/GeneralPanel'
import { TagsPanel } from '../components/TagsPanel'
import { WorkflowTemplatesPanel } from '../components/WorkflowTemplatesPanel'

type SettingsTab = 'general' | 'categories' | 'assignees' | 'tags' | 'workflows' | 'database'

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'general',    label: 'General' },
  { id: 'categories', label: 'Categories' },
  { id: 'assignees',  label: 'Assignees' },
  { id: 'tags',       label: 'Tags' },
  { id: 'workflows',  label: 'Workflow templates' },
  { id: 'database',   label: 'Database' },
]

export function SettingsView() {
  const [tab, setTab] = useState<SettingsTab>('general')

  return (
    <div className="task-view">
      <header className="view-header">
        <h1>Settings</h1>
        <p className="muted compact">App preferences, taxonomy, and database tools.</p>
      </header>

      <nav className="settings-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`settings-tab ${tab === t.id ? 'settings-tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </nav>

      <div className="settings-panel">
        {tab === 'general'    && <GeneralPanel />}
        {tab === 'categories' && <CategoriesPanel />}
        {tab === 'assignees'  && <AssigneesPanel />}
        {tab === 'tags'       && <TagsPanel />}
        {tab === 'workflows'  && <WorkflowTemplatesPanel />}
        {tab === 'database'   && <DatabasePanel />}
      </div>
    </div>
  )
}
