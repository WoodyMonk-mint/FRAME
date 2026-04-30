import { useMemo, useRef, useState } from 'react'

type Props = {
  value:        string[]
  onChange:     (tags: string[]) => void
  suggestions?: string[]
  placeholder?: string
}

export function TagInput({ value, onChange, suggestions = [], placeholder = 'Add a tag…' }: Props) {
  const [draft, setDraft] = useState('')
  const [open, setOpen]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const lowerExisting = useMemo(
    () => new Set(value.map(v => v.toLowerCase())),
    [value]
  )

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase()
    return suggestions
      .filter(s => !lowerExisting.has(s.toLowerCase()))
      .filter(s => q === '' || s.toLowerCase().includes(q))
      .slice(0, 6)
  }, [draft, suggestions, lowerExisting])

  const commit = (raw: string) => {
    const clean = raw.trim().replace(/,$/, '').trim()
    if (!clean) return
    if (lowerExisting.has(clean.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...value, clean])
    setDraft('')
  }

  const remove = (tag: string) => {
    onChange(value.filter(v => v !== tag))
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault()
      remove(value[value.length - 1])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="tag-input">
      <div className="tag-input-chips">
        {value.map(tag => (
          <span key={tag} className="tag-chip">
            {tag}
            <button
              type="button"
              className="tag-chip-x"
              onClick={() => remove(tag)}
              aria-label={`Remove tag ${tag}`}
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={e => { setDraft(e.target.value); setOpen(true) }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => { setTimeout(() => setOpen(false), 120); if (draft.trim()) commit(draft) }}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="tag-input-suggestions">
          {filtered.map(s => (
            <button
              type="button"
              key={s}
              className="tag-input-suggestion"
              onMouseDown={e => { e.preventDefault(); commit(s) }}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}
