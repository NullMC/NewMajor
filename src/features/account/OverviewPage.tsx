import { Link } from 'react-router-dom'
import { ArrowRight, Bell, Package } from 'lucide-react'
import { formatDate, formatPrice, formatRelative } from '@/lib/format'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/Display'
import { ButtonLink } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/AuthProvider'
import { listMyNotifications } from '@/features/notifications/api'
import { listMyOrders, listStatuses } from '@/features/orders/api'
import { OrderProgress } from '@/features/orders/components'

export default function OverviewPage() {
  const { user } = useAuth()
  const { data: orders, loading } = useQuery(`orders:mine:${user?.id}`, listMyOrders)
  const { data: statuses } = useQuery('order-statuses', listStatuses, { staleMs: 10 * 60_000 })
  const { data: notifications } = useQuery(`notifications:${user?.id}`, () => listMyNotifications(5))
  useMeta({ title: 'Area personale', noindex: true })

  const active = (orders ?? []).filter((o) => o.kind === 'order' && o.order_statuses && !o.order_statuses.is_final)
  const unread = (notifications ?? []).filter((n) => !n.is_read)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Ordini in corso" action={<Link to="/account/ordini" className="text-sm font-semibold hover:underline">Tutti gli ordini</Link>} />
        <div className="divide-y divide-ink-100">
          {loading && !orders ? (
            <div className="p-5"><Skeleton className="h-20" /></div>
          ) : active.length ? (
            active.slice(0, 3).map((o) => (
              <Link key={o.id} to={`/account/ordini/${o.id}`} className="block p-5 hover:bg-ink-50">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-mono font-semibold">{o.reference}</span>
                  <span className="text-ink-500">{formatDate(o.created_at)} · {formatPrice(o.total)}</span>
                </div>
                {o.order_statuses && statuses && <OrderProgress status={o.order_statuses} statuses={statuses} />}
              </Link>
            ))
          ) : (
            <div className="p-5">
              <EmptyState icon={<Package className="h-6 w-6" />} title="Nessun ordine in corso" action={<ButtonLink to="/catalogo" size="sm">Vai al catalogo</ButtonLink>} />
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Ultime notifiche" description={unread.length ? `${unread.length} da leggere` : undefined} action={<Link to="/account/notifiche" className="text-sm font-semibold hover:underline">Vedi tutte</Link>} />
        {notifications?.length ? (
          <ul className="divide-y divide-ink-100">
            {notifications.map((n) => (
              <li key={n.id}>
                <Link to={n.link || '/account/notifiche'} className="flex items-start gap-3 p-4 hover:bg-ink-50">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-gold-500'}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{n.title}</span>
                    <span className="block truncate text-sm text-ink-500">{n.message}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-400">{formatRelative(n.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-3 p-5 text-sm text-ink-500"><Bell className="h-4 w-4" aria-hidden />Nessuna notifica.</div>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/account/profilo" className="surface flex items-center justify-between p-5 font-semibold hover:border-ink-400">Dati personali <ArrowRight className="h-4 w-4" /></Link>
        <Link to="/account/indirizzi" className="surface flex items-center justify-between p-5 font-semibold hover:border-ink-400">Indirizzi di spedizione <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </div>
  )
}
