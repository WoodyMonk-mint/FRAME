import { useEffect, useRef, useState } from 'react'
import type { TaskFilterPreset } from '../lib/taskFilters'

type Props = {
  presets:           TaskFilterPreset[]
  activeId:          string | null
  defaultId:         string | null
  isOpen:            boolean
  onOpen:            () => void
  onClose:           () => void
  onApply:           (preset: TaskFilterPreset) => void
  onClearActive:     () => void
  onSaveCurrent:     (name: string) => void
  onRename:          (id: string, name: string) => void
  onDelete:          (id: string) => void
  onSetDefault:      (id: string | null) => void
}

export function SavedViewsDropdown({
  presets, activeId, defaultId, isOpen,
  onOpen, onClose, onApply, onClearActive,
  onSaveCurrent, onRename, onDelete, onSetDefault,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [saveName, setSaveName]     = useState('')
  const [renameId, setRenameId]     = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [isOpen, onClose])

  const active = presets.find(p => p.id === activeId)
  const buttonLabel = active ? active.name : 'Saved views'

  const beginRename = (preset: TaskFilterPreset) => {
    setRenameId(preset.id)
    setRenameValue(preset.name)
  }

  const commitRename = () => {
    if (renameId && renameValue.trim()) {
      onRename(renameId, renameValue.trim())
    }
    setRenameId(null)
    setRenameValue('')
  }

  const commitSave = () => {
    if (!saveName.trim()) return
    onSaveCurrent(saveName.trim())
    setSaveName('')
  }

  return (
    <div
      ref={wrapRef}
      className="dash-filter-dropdown-wrap"
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        className={`dash-filter-btn dash-view-btn${active ? ' has-exclusions' : ''}`}
        onClick={() => isOpen ? onClose() : onOpen()}
      >
        {buttonLabel}
        <span className="dash-filter-chevron">{isOpen ? '▴' : '▾'}</span>
      </button>
      {isOpen && (
        <div className="dash-filter-dropdown dash-view-dropdown">
          <button
            type="button"
            className={`dash-view-item${!activeId ? ' is-active' : ''}`}
            onClick={() => { onClearActive(); onClose() }}
          >
            All tasks (default)
          </button>
          {presets.length > 0 && (
            <>
              <div className="dash-view-divider" />
              {presets.map(p => (
                <div key={p.id} className={`dash-view-row${activeId === p.id ? ' is-active' : ''}`}>
                  {renameId === p.id ? (
                    <input
                      autoFocus
                      type="text"
                      className="dash-view-rename-input"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  { e.preventDefault(); commitRename() }
                        if (e.key === 'Escape') { setRenameId(null); setRenameValue('') }
                      }}
                      onBlur={commitRename}
                    />
                  ) : (
                    <button
                      type="button"
                      className="dash-view-row-name"
                      onClick={() => { onApply(p); onClose() }}
                      onDoubleClick={() => beginRename(p)}
                      title="Click to apply, double-click to rename"
                    >
                      {defaultId === p.id && <span className="dash-default-star" title="Default filter">★</span>}
                      {p.name}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`dash-view-row-star${defaultId === p.id ? ' is-default' : ''}`}
                    title={defaultId === p.id ? 'Remove default' : 'Set as default'}
                    onClick={e => { e.stopPropagation(); onSetDefault(defaultId === p.id ? null : p.id) }}
                  >★</button>
                  <button
                    type="button"
                    className="dash-view-row-rename"
                    title="Rename"
                    onClick={e => { e.stopPropagation(); beginRename(p) }}
                  >✎</button>
                  <button
                    type="button"
                    className="dash-view-row-delete"
                    title="Delete filter"
                    onClick={e => { e.stopPropagation(); onDelete(p.id) }}
                  >✕</button>
                </div>
              ))}
            </>
          )}
          <div className="dash-view-divider" />
          <div className="dash-view-save">
            <input
              type="text"
              placeholder="Save current as…"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitSave(); onClose() }
              }}
            />
            <button
              type="button"
              className="map-action-btn"
              disabled={!saveName.trim()}
              onClick={() => { commitSave(); onClose() }}
            >Save</button>
          </div>
        </div>
      )}
    </div>
  )
}
