import { NavLink, Outlet } from 'react-router-dom'
import { Bell, Home, LogOut, MapPin, Package, UserRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuth } from '@/features/auth/AuthProvider'
import { useUnreadCount } from '@/features/notifications/api'

const LINKS = [
  { to: '/account', label: 'Panoramica', icon: Home, end: true },
  { to: '/account/ordini', label: 'Ordini', icon: Package },
  { to: '/account/notifiche', label: 'Notifiche', icon: Bell },
  { to: '/account/profilo', label: 'Dati personali', icon: UserRound },
  { to: '/account/indirizzi', label: 'Indirizzi', icon: MapPin },
]

export default function AccountLayout() {
  const { profile, signOut } = useAuth()
  const unread = useUnreadCount()
  return (
    <div className="container py-8 sm:py-12">
      <div className="mb-6">
        <p className="text-sm text-ink-500">Area personale</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Ciao{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr] lg:gap-10">
        <nav aria-label="Area personale" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'inline-flex h-11 shrink-0 items-center gap-2.5 rounded-xl px-4 text-sm font-semibold transition-colors',
                  isActive ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
              {label === 'Notifiche' && unread > 0 && <span className="ml-auto rounded-full bg-gold-500 px-1.5 text-2xs font-bold text-ink-950">{unread}</span>}
            </NavLink>
          ))}
          <button type="button" onClick={() => void signOut()} className="inline-flex h-11 shrink-0 items-center gap-2.5 rounded-xl px-4 text-sm font-semibold text-ink-600 hover:bg-ink-100 hover:text-ink-900 lg:mt-4">
            <LogOut className="h-4 w-4" aria-hidden /> Esci
          </button>
        </nav>
        <div className="min-w-0"><Outlet /></div>
      </div>
    </div>
  )
}
