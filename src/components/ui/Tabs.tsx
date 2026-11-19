import { useId, useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem<T extends string> { value: T; label: string; count?: number }

/** Tab accessibili (ARIA tablist) con navigazione da tastiera. */
export function Tabs<T extends string>({
  items, value, onChange, className, ariaLabel,
}: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; className?: string; ariaLabel: string }) {
  const id = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % items.length
    if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length
    if (e.key === 'Home') next = 0
    if (e.key === 'End') next = items.length - 1
    if (next >= 0) {
      e.preventDefault()
      refs.current[next]?.focus()
      onChange(items[next].value)
    }
  }
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1', className)}>
      {items.map((t, i) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            ref={(el) => { refs.current[i] = el }}
            role="tab"
            id={`${id}-${t.value}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(t.value)}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors',
              active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn('rounded-full px-1.5 text-2xs', active ? 'bg-white/20' : 'bg-ink-200 text-ink-700')}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
