import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Bell, ClipboardList, ExternalLink, FileText, FolderTree, Gauge, HelpCircle, Image, Images, Inbox, LayoutTemplate,
  ListChecks, LogOut, Menu, Package, Settings, Shirt, ShoppingCart, Users, Workflow,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { Drawer } from '@/components/ui/Overlay'
import { PageLoader } from '@/components/ui/Spinner'
import { useAuth } from '@/features/auth/AuthProvider'
import { useUnreadCount } from '@/features/notifications/api'

const GROUPS = [
  { label: null, items: [{ to: '/admin', label: 'Dashboard', icon: Gauge, end: true }] },
  {
    label: 'Vendite',
    items: [
      { to: '/admin/ordini', label: 'Ordini', icon: ShoppingCart },
      { to: '/admin/promemoria', label: 'Promemoria', icon: ListChecks, badge: 'reminders' },
      { to: '/admin/richieste', label: 'Richieste contatto', icon: Inbox, badge: 'contacts' },
    ],
  },
  {
    label: 'Catalogo',
    items: [
      { to: '/admin/prodotti', label: 'Prodotti', icon: Package },
      { to: '/admin/categorie', label: 'Categorie', icon: FolderTree },
      { to: '/admin/tipologie', label: 'Tipologie capo', icon: Shirt },
      { to: '/admin/libreria', label: 'Libreria grafiche', icon: Images },
    ],
  },
  {
    label: 'Contenuti',
    items: [
      { to: '/admin/contenuti', label: 'Home e banner', icon: LayoutTemplate },
      { to: '/admin/pagine', label: 'Pagine', icon: FileText },
      { to: '/admin/faq', label: 'FAQ', icon: HelpCircle },
      { to: '/admin/media', label: 'Media', icon: Image },
    ],
  },
  {
    label: 'Clienti',
    items: [
      { to: '/admin/utenti', label: 'Utenti', icon: Users },
      { to: '/admin/notifiche', label: 'Notifiche', icon: Bell },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/admin/stati', label: 'Stati ordine', icon: Workflow },
      { to: '/admin/impostazioni', label: 'Impostazioni', icon: Settings },
      { to: '/admin/registro', label: 'Registro attività', icon: ClipboardList },
    ],
  },
] as const

function useBadges() {
  const [badges, setBadges] = useState({ reminders: 0, contacts: 0 })
  const { pathname } = useLocation()
  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('admin_reminders').select('id', { count: 'exact', head: true }).eq('is_done', false),
      supabase.from('contact_requests').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    ]).then(([r, c]) => { if (!cancelled) setBadges({ reminders: r.count ?? 0, contacts: c.count ?? 0 }) })
    return () => { cancelled = true }
  }, [pathname])
  return badges
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const badges = useBadges()
  return (
    <nav aria-label="Backoffice" className="space-y-5 p-3">
      {GROUPS.map((g) => (
        <div key={g.label ?? 'root'}>
          {g.label && <p className="px-3 pb-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500">{g.label}</p>}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = it.icon
              const count = 'badge' in it ? badges[it.badge] : 0
              return (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={'end' in it ? it.end : false}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                        isActive ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{it.label}</span>
                    {count > 0 && <span className="rounded-full bg-gold-500 px-1.5 text-2xs font-bold text-ink-950">{count}</span>}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const unread = useUnreadCount()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])

  return (
    <div className="min-h-dvh bg-ink-50 lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto bg-ink-900 lg:flex">
        <Link to="/admin" className="flex items-center gap-3 px-5 py-5">
          <span className="rounded-lg bg-white p-1"><img src="/brand/logo.png" alt="" className="h-8 w-auto" /></span>
          <span className="text-sm font-bold text-white">New Major<span className="block text-2xs font-medium text-ink-400">Backoffice</span></span>
        </Link>
        <div className="flex-1"><Nav /></div>
        <div className="border-t border-white/10 p-3">
          <a href="/" target="_blank" rel="noopener" className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-ink-300 hover:bg-white/5 hover:text-white">
            <ExternalLink className="h-4 w-4" aria-hidden /> Vai al sito
          </a>
          <button type="button" onClick={() => void signOut()} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-ink-300 hover:bg-white/5 hover:text-white">
            <LogOut className="h-4 w-4" aria-hidden /> Esci
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button type="button" className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-ink-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Apri menu">
            <Menu className="h-5 w-5" />
          </button>
          <p className="truncate text-sm text-ink-500 lg:hidden">Backoffice</p>
          <div className="ml-auto flex items-center gap-1">
            <Link to="/admin/notifiche?tab=mie" className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-600 hover:bg-ink-100" aria-label={`Notifiche${unread ? ` (${unread})` : ''}`}>
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-gold-500" />}
            </Link>
            <span className="hidden max-w-[12rem] truncate pl-2 text-sm font-medium md:inline">{profile?.full_name || profile?.username || profile?.email}</span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <Suspense fallback={<PageLoader />}><Outlet /></Suspense>
        </main>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} title="Backoffice" side="left">
        <div className="min-h-full bg-ink-900"><Nav onNavigate={() => setOpen(false)} /></div>
      </Drawer>
    </div>
  )
}
