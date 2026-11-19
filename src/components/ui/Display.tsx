import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

// Badge ---------------------------------------------------------------------------
type Tone = 'neutral' | 'gold' | 'success' | 'warning' | 'danger' | 'dark'
const tones: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  gold: 'bg-gold-100 text-gold-800',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  dark: 'bg-ink-900 text-white',
}
export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>
      {children}
    </span>
  )
}

// Card ----------------------------------------------------------------------------
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('surface', className)} {...rest} />
}
export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
      <div className="min-w-0">
        <h2 className="font-sans text-base font-semibold" style={{ fontStretch: '100%' }}>{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

// Progress ------------------------------------------------------------------------
export function ProgressBar({
  value, label, tone = 'dark', className,
}: { value: number; label: string; tone?: 'dark' | 'gold' | 'danger'; className?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-ink-100', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-out', {
          'bg-ink-900': tone === 'dark',
          'bg-gold-500': tone === 'gold',
          'bg-danger-600': tone === 'danger',
        })}
        style={{ width: `${v}%` }}
      />
    </div>
  )
}

// Skeleton ------------------------------------------------------------------------
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-ink-100', className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  )
}

// Empty state ---------------------------------------------------------------------
export function EmptyState({
  icon, title, description, action, className,
}: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-500">{icon}</div>}
      <p className="font-semibold text-ink-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// Section heading -----------------------------------------------------------------
export function PageHeader({
  title, description, actions, className,
}: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

// Description list ----------------------------------------------------------------
export function DataList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(0,10rem)_1fr]">
      {items.map((it) => (
        <div key={it.label} className="contents">
          <dt className="text-ink-500">{it.label}</dt>
          <dd className="min-w-0 break-words font-medium text-ink-900">{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
