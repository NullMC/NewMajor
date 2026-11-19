import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'

export function Logo({ className, to = '/', withText = true }: { className?: string; to?: string; withText?: boolean }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2.5 rounded-lg', className)} aria-label="New Major — Home">
      <img src="/brand/logo.png" alt="" width={36} height={44} className="h-10 w-auto" />
      {withText && (
        <span className="font-display text-[15px] font-extrabold uppercase leading-none tracking-tight" style={{ fontStretch: '120%' }}>
          New Major
        </span>
      )}
    </Link>
  )
}
