import { useEffect, useRef } from 'react'

type Option = { value: string; label: string }

type Props = {
  label:        string
  options:      Option[]
  selected:     string
  defaultValue?: string
  isOpen:       boolean
  onOpen:       () => void
  onClose:      () => void
  onChange:     (value: string) => void
}

// Visual sibling of FilterDropdown for single-select fields like Due range
// and Group-by. Same .dash-filter-btn / .dash-filter-dropdown shell, but
// renders radio-style mutually exclusive options. Highlights blue when the
// selected value differs from defaultValue (so "Group: None" / "Due: All"
// don't show as active filters).
export function SingleSelectDropdown({
  label, options, selected, defaultValue, isOpen, onOpen, onClose, onChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [isOpen, onClose])

  const selectedOption = options.find(o => o.value === selected)
  const isFiltered = defaultValue !== undefined && selected !== defaultValue

  return (
    <div
      ref={wrapRef}
      className="dash-filter-dropdown-wrap"
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        className={`dash-filter-btn${isFiltered ? ' has-exclusions' : ''}`}
        onClick={() => isOpen ? onClose() : onOpen()}
      >
        <span className="dash-filter-label-prefix">{label}:</span>
        <span className="dash-filter-label-value">{selectedOption?.label ?? selected}</span>
        <span className="dash-filter-chevron">{isOpen ? '▴' : '▾'}</span>
      </button>
      {isOpen && (
        <div className="dash-filter-dropdown">
          {options.map(o => (
            <label key={o.value} className="dash-filter-option">
              <input
                type="radio"
                checked={selected === o.value}
                onChange={() => { onChange(o.value); onClose() }}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
