import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'

/** Marchio senza sfondo; su fondo scuro il lettering nero diventa bianco (variante "light"). */
export function Logo({ className, to = '/', withText = true, dark }: { className?: string; to?: string; withText?: boolean; dark?: boolean }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2.5 rounded-full', className)} aria-label="New Major — Home">
      <span className="relative block h-10 w-[33px] shrink-0">
        <img src="/brand/logo-mark.png" alt="" width={33} height={40} className={cn('absolute inset-0 h-10 w-auto transition-opacity duration-500', dark && 'opacity-0')} />
        <img src="/brand/logo-mark-light.png" alt="" width={33} height={40} className={cn('absolute inset-0 h-10 w-auto transition-opacity duration-500', !dark && 'opacity-0')} />
      </span>
      {withText && (
        <span className="font-display text-[15px] font-extrabold uppercase leading-none tracking-tight" style={{ fontStretch: '120%' }}>
          New Major
        </span>
      )}
    </Link>
  )
}
