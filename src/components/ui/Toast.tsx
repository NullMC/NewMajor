import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'
import { Modal } from './Overlay'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem { id: number; kind: ToastKind; message: string }

interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  danger?: boolean
}

interface UiContextValue {
  toast: (message: string, kind?: ToastKind) => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

const UiContext = createContext<UiContextValue | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const counter = useRef(0)

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++counter.current
    setToasts((t) => [...t.slice(-3), { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000)
  }, [])

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    [],
  )

  const close = (v: boolean) => {
    confirmState?.resolve(v)
    setConfirmState(null)
  }

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm])

  return (
    <UiContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 pb-safe sm:items-end"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? AlertTriangle : Info
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-pop',
                t.kind === 'error' ? 'bg-danger-700 text-white' : 'bg-ink-900 text-white',
              )}
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', t.kind === 'success' && 'text-gold-400')} />
              <p className="flex-1">{t.message}</p>
              <button
                onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
                className="-m-1 rounded p-1 text-white/70 hover:text-white"
                aria-label="Chiudi notifica"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
      <Modal
        open={!!confirmState}
        onClose={() => close(false)}
        title={confirmState?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>Annulla</Button>
            <Button variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => close(true)} data-autofocus>
              {confirmState?.confirmLabel ?? 'Conferma'}
            </Button>
          </>
        }
      >
        <div className="text-sm text-ink-600">{confirmState?.message}</div>
      </Modal>
    </UiContext.Provider>
  )
}

export function useUi() {
  const ctx = useContext(UiContext)
  if (!ctx) throw new Error('useUi deve essere usato dentro UiProvider')
  return ctx
}
