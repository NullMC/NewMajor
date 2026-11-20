import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Bell, Menu, ShoppingBag, User, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCart } from '@/features/cart/CartProvider'
import { useUnreadCount } from '@/features/notifications/api'
import { Drawer } from '@/components/ui/Overlay'
import { ButtonLink } from '@/components/ui/Button'
import { Logo } from './Logo'
import { LiquidGlass } from '@/components/fx/LiquidGlass'

export const NAV = [
  { to: '/catalogo', label: 'Catalogo' },
  { to: '/chi-siamo', label: 'Chi siamo' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contatti', label: 'Contattaci' },
]

function IconLink({ to, label, count, dark, children }: { to: string; label: string; count?: number; dark?: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        'relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors',
        dark ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-ink-700 hover:bg-ink-900/[.06] hover:text-ink-900',
      )}
      aria-label={count ? `${label} (${count})` : label}
    >
      {children}
      {!!count && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold-500 px-1 font-mono text-[10px] font-bold text-ink-950">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}

/** Vero se sotto l'intestazione c'è una superficie scura (data-surface="dark"). */
function useDarkSurface(header: React.RefObject<HTMLElement | null>, pathname: string) {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    let raf = 0
    const check = () => {
      const h = header.current
      if (!h) return
      const y = h.getBoundingClientRect().bottom - 12
      const under = document.elementsFromPoint(window.innerWidth / 2, Math.max(1, y)).find((el) => !h.contains(el))
      setDark(under?.closest('[data-surface]')?.getAttribute('data-surface') === 'dark')
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(check)
    }
    check()
    // pagine caricate in lazy: ricontrolla mentre il contenuto compare
    const timers = [120, 400, 900, 1800, 3500].map((ms) => window.setTimeout(check, ms))
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    // anche quando il contenuto della pagina arriva dopo (dati caricati in ritardo)
    const ro = new ResizeObserver(schedule)
    ro.observe(document.body)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
      timers.forEach((t) => window.clearTimeout(t))
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [header, pathname])
  return dark
}

export function SiteHeader() {
  const { user, isAdmin } = useAuth()
  const { count } = useCart()
  const unread = useUnreadCount()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const ref = useRef<HTMLElement>(null)
  const dark = useDarkSurface(ref, location.pathname)

  useEffect(() => setOpen(false), [location.pathname])

  return (
    <header ref={ref} className="sticky top-0 z-40 px-2 pt-2 sm:px-3">
      <LiquidGlass
        tone={dark ? 'clear' : 'light'}
        bezel={14}
        className={cn(
          'mx-auto flex h-14 max-w-[1360px] items-center gap-3 rounded-full pl-2 pr-2 transition-[background,color] duration-500 sm:pl-4',
          dark ? 'text-white' : 'text-ink-900',
        )}
      >
        <button
          className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full lg:hidden', dark ? 'hover:bg-white/10' : 'hover:bg-ink-900/[.06]')}
          onClick={() => setOpen(true)}
          aria-label="Apri menu"
          aria-expanded={open}
        >
          <Menu className="h-5 w-5" />
        </button>
        <Logo className="mr-auto lg:mr-4" dark={dark} />
        <nav aria-label="Navigazione principale" className="mr-auto hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? dark ? 'bg-white/[.12] text-white' : 'bg-ink-900/[.06] text-ink-900'
                    : dark ? 'text-white/70 hover:text-white' : 'text-ink-500 hover:text-ink-900',
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-0.5">
          {user && (
            <IconLink dark={dark} to={isAdmin ? '/admin/notifiche?tab=mie' : '/account/notifiche'} label="Notifiche" count={unread}>
              <Bell className="h-[18px] w-[18px]" />
            </IconLink>
          )}
          {isAdmin ? (
            <IconLink dark={dark} to="/admin" label="Backoffice">
              <LayoutDashboard className="h-[18px] w-[18px]" />
            </IconLink>
          ) : (
            <IconLink dark={dark} to={user ? '/account' : '/accedi'} label={user ? 'Area personale' : 'Accedi'}>
              <User className="h-[18px] w-[18px]" />
            </IconLink>
          )}
          <IconLink dark={dark} to="/carrello" label="Carrello" count={count}>
            <ShoppingBag className="h-[18px] w-[18px]" />
          </IconLink>
          <ButtonLink to="/catalogo" variant={dark ? 'accent' : 'primary'} size="sm" className="ml-1.5 hidden h-10 rounded-full px-5 sm:inline-flex">
            Personalizza
          </ButtonLink>
        </div>
      </LiquidGlass>
      <Drawer open={open} onClose={() => setOpen(false)} title="Menu" side="left">
        <nav aria-label="Navigazione mobile" className="flex flex-col p-3">
          {[{ to: '/', label: 'Home' }, ...NAV].map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cn('rounded-xl px-4 py-3.5 text-base font-semibold', isActive ? 'bg-ink-900 text-white' : 'text-ink-800 hover:bg-ink-100')
              }
            >
              {n.label}
            </NavLink>
          ))}
          <div className="my-3 h-px bg-ink-100" />
          {isAdmin ? (
            <NavLink to="/admin" className="rounded-xl px-4 py-3.5 text-base font-semibold text-ink-800 hover:bg-ink-100">
              Backoffice
            </NavLink>
          ) : (
            <NavLink to={user ? '/account' : '/accedi'} className="rounded-xl px-4 py-3.5 text-base font-semibold text-ink-800 hover:bg-ink-100">
              {user ? 'Area personale' : 'Accedi / Registrati'}
            </NavLink>
          )}
        </nav>
      </Drawer>
    </header>
  )
}
