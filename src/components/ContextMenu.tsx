import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type ContextMenuItem =
  | {
      kind:      'item'
      label:     string
      onSelect:  () => void
      disabled?: boolean
      danger?:   boolean
    }
  | { kind: 'divider' }

type Props = {
  x:       number
  y:       number
  items:   ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y })

  // Selectable indices (skip dividers + disabled). Initial highlight: first selectable.
  const selectable = items
    .map((it, i) => (it.kind === 'item' && !it.disabled ? i : -1))
    .filter(i => i >= 0)
  const [activeIdx, setActiveIdx] = useState<number>(selectable[0] ?? -1)

  // Position after mount: flip if it would overflow the viewport.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = x
    let top  = y
    if (left + rect.width  > vw - 4) left = Math.max(4, vw - rect.width  - 4)
    if (top  + rect.height > vh - 4) top  = Math.max(4, vh - rect.height - 4)
    setPos({ left, top })
  }, [x, y])

  // Close on ESC, click-outside, scroll, resize, window blur.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (selectable.length === 0) return
        const cur = selectable.indexOf(activeIdx)
        const next = selectable[(cur + 1) % selectable.length]
        setActiveIdx(next)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (selectable.length === 0) return
        const cur = selectable.indexOf(activeIdx)
        const prev = selectable[(cur - 1 + selectable.length) % selectable.length]
        setActiveIdx(prev)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const it = items[activeIdx]
        if (it && it.kind === 'item' && !it.disabled) {
          onClose()
          it.onSelect()
        }
      }
    }
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onScrollOrResize = () => onClose()
    document.addEventListener('keydown',   onKey)
    document.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('scroll',      onScrollOrResize, true)
    window.addEventListener('resize',      onScrollOrResize)
    window.addEventListener('blur',        onScrollOrResize)
    return () => {
      document.removeEventListener('keydown',   onKey)
      document.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('scroll',      onScrollOrResize, true)
      window.removeEventListener('resize',      onScrollOrResize)
      window.removeEventListener('blur',        onScrollOrResize)
    }
  }, [items, activeIdx, selectable, onClose])

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      onContextMenu={e => e.preventDefault()}
    >
      {items.map((it, i) => {
        if (it.kind === 'divider') {
          return <div key={`d${i}`} className="context-menu-divider" role="separator" />
        }
        const cls = [
          'context-menu-item',
          it.disabled ? 'context-menu-item-disabled' : '',
          it.danger   ? 'context-menu-item-danger'   : '',
          activeIdx === i && !it.disabled ? 'context-menu-item-active' : '',
        ].filter(Boolean).join(' ')
        return (
          <button
            key={i}
            type="button"
            className={cls}
            role="menuitem"
            disabled={it.disabled}
            onMouseEnter={() => !it.disabled && setActiveIdx(i)}
            onClick={() => {
              if (it.disabled) return
              onClose()
              it.onSelect()
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
