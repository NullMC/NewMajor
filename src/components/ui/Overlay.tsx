import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input:not([disabled]),select,[tabindex]:not([tabindex="-1"])'

/** Gestisce Esc, focus trap, blocco scroll e ripristino del focus. */
function useOverlay(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const node = ref.current
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? node)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'Tab' && node) {
        const els = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
        if (!els.length) return
        const [a, b] = [els[0], els[els.length - 1]]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus() }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      prev?.focus?.()
    }
  }, [open, onClose])
  return ref
}

interface OverlayProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: OverlayProps) {
  const ref = useOverlay(open, onClose)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-ink-950/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full animate-slide-up flex-col rounded-t-2xl bg-white shadow-pop sm:rounded-2xl',
          { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div>
            <h2 className="font-sans text-lg font-semibold" style={{ fontStretch: '100%' }}>{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
          </div>
          <button onClick={onClose} className="-mr-2 rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Chiudi">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 px-5 py-4 pb-safe">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({
  open, onClose, title, children, footer, side = 'right',
}: Omit<OverlayProps, 'size' | 'description'> & { side?: 'left' | 'right' }) {
  const ref = useOverlay(open, onClose)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 animate-fade-in bg-ink-950/50" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          'absolute top-0 flex h-full w-[min(100%,26rem)] flex-col bg-white shadow-pop',
          side === 'right' ? 'right-0 animate-slide-in-right' : 'left-0 animate-fade-in',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-ink-100 px-5">
          <h2 className="font-sans text-lg font-semibold" style={{ fontStretch: '100%' }}>{title}</h2>
          <button onClick={onClose} className="-mr-2 rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Chiudi">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-ink-100 p-5 pb-safe">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
