import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'

/** Su fondo scuro il marchio (con lettering nero) sta su una piastrina chiara. */
export function Logo({ className, to = '/', withText = true, dark }: { className?: string; to?: string; withText?: boolean; dark?: boolean }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2.5 rounded-full', className)} aria-label="New Major — Home">
      <span className={cn('flex h-10 items-center justify-center rounded-full transition-colors duration-500', dark ? 'bg-white/90 px-1.5' : 'px-0')}>
        <img src="/brand/logo.png" alt="" width={36} height={44} className={cn('w-auto transition-all duration-500', dark ? 'h-8' : 'h-10')} />
      </span>
      {withText && (
        <span className="font-display text-[15px] font-extrabold uppercase leading-none tracking-tight" style={{ fontStretch: '120%' }}>
          New Major
        </span>
      )}
    </Link>
  )
}
