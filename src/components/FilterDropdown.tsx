import { useEffect, useRef } from 'react'

type Option = { value: string; label: string }

type Props = {
  label:      string
  options:    Option[]
  excluded:   string[]
  isOpen:     boolean
  onOpen:     () => void
  onClose:    () => void
  onToggle:   (value: string) => void
  onShowAll:  () => void
}

// One filter dimension. Renders a dropdown button whose label is highlighted
// when any options are excluded (i.e. unticked). Mirrors PRISM's
// dash-filter-dropdown-wrap pattern so the inherited CSS styles it without
// extra rules.
export function FilterDropdown({
  label, options, excluded, isOpen, onOpen, onClose, onToggle, onShowAll,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [isOpen, onClose])

  const hasExclusions = excluded.length > 0

  return (
    <div
      ref={wrapRef}
      className="dash-filter-dropdown-wrap"
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        className={`dash-filter-btn${hasExclusions ? ' has-exclusions' : ''}`}
        onClick={() => isOpen ? onClose() : onOpen()}
      >
        {label}
        {hasExclusions && <span className="dash-filter-badge">{excluded.length}</span>}
        <span className="dash-filter-chevron">{isOpen ? '▴' : '▾'}</span>
      </button>
      {isOpen && (
        <div className="dash-filter-dropdown">
          {options.map(o => (
            <label key={o.value} className="dash-filter-option">
              <input
                type="checkbox"
                checked={!excluded.includes(o.value)}
                onChange={() => onToggle(o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
          {hasExclusions && (
            <div className="dash-filter-dropdown-footer">
              <button
                type="button"
                className="dash-filter-clear-all"
                onClick={onShowAll}
              >Show all</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
