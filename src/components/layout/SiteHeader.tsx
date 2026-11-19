import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Bell, Menu, ShoppingBag, User, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCart } from '@/features/cart/CartProvider'
import { useUnreadCount } from '@/features/notifications/api'
import { Drawer } from '@/components/ui/Overlay'
import { ButtonLink } from '@/components/ui/Button'
import { Logo } from './Logo'

export const NAV = [
  { to: '/catalogo', label: 'Catalogo' },
  { to: '/chi-siamo', label: 'Chi siamo' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contatti', label: 'Contattaci' },
]

function IconLink({ to, label, count, children }: { to: string; label: string; count?: number; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900"
      aria-label={count ? `${label} (${count})` : label}
    >
      {children}
      {!!count && (
        <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-ink-950">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}

export function SiteHeader() {
  const { user, isAdmin } = useAuth()
  const { count } = useCart()
  const unread = useUnreadCount()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b bg-ink-50/90 backdrop-blur-md transition-colors',
        scrolled ? 'border-ink-200' : 'border-transparent',
      )}
    >
      <div className="container flex h-16 items-center gap-4">
        <button
          className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink-800 hover:bg-ink-100 lg:hidden"
          onClick={() => setOpen(true)}
          aria-label="Apri menu"
          aria-expanded={open}
        >
          <Menu className="h-5 w-5" />
        </button>
        <Logo className="mr-auto lg:mr-6" />
        <nav aria-label="Navigazione principale" className="mr-auto hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'text-ink-900' : 'text-ink-500 hover:text-ink-900',
                )
              }
            >
              {({ isActive }) => (
                <span className="relative">
                  {n.label}
                  <span className={cn('absolute -bottom-1.5 left-0 h-0.5 rounded bg-gold-500 transition-all', isActive ? 'w-full' : 'w-0')} />
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-0.5">
          {isAdmin && (
            <IconLink to="/admin" label="Backoffice">
              <LayoutDashboard className="h-5 w-5" />
            </IconLink>
          )}
          {user && (
            <IconLink to="/account/notifiche" label="Notifiche" count={unread}>
              <Bell className="h-5 w-5" />
            </IconLink>
          )}
          <IconLink to={user ? '/account' : '/accedi'} label={user ? 'Area personale' : 'Accedi'}>
            <User className="h-5 w-5" />
          </IconLink>
          <IconLink to="/carrello" label="Carrello" count={count}>
            <ShoppingBag className="h-5 w-5" />
          </IconLink>
          <ButtonLink to="/catalogo" variant="primary" size="sm" className="ml-2 hidden sm:inline-flex">
            Personalizza
          </ButtonLink>
        </div>
      </div>

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
          <NavLink to={user ? '/account' : '/accedi'} className="rounded-xl px-4 py-3.5 text-base font-semibold text-ink-800 hover:bg-ink-100">
            {user ? 'Area personale' : 'Accedi / Registrati'}
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className="rounded-xl px-4 py-3.5 text-base font-semibold text-ink-800 hover:bg-ink-100">
              Backoffice
            </NavLink>
          )}
        </nav>
      </Drawer>
    </header>
  )
}
