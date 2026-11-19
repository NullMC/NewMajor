import { cn } from '@/lib/cn'

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      className={cn('animate-spin', className ?? 'h-5 w-5')}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-ink-400">
      <Spinner className="h-7 w-7" label="Caricamento" />
    </div>
  )
}
