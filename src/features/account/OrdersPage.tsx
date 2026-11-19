import { Link } from 'react-router-dom'
import { ChevronRight, Package } from 'lucide-react'
import { formatDate, formatPrice, ORDER_KIND_LABEL } from '@/lib/format'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, EmptyState, ProgressBar, Skeleton } from '@/components/ui/Display'
import { ButtonLink } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/AuthProvider'
import { listMyOrders } from '@/features/orders/api'
import { PaymentBadge, StatusBadge } from '@/features/orders/components'

export default function OrdersPage() {
  const { user } = useAuth()
  const { data: orders, loading } = useQuery(`orders:mine:${user?.id}`, listMyOrders)
  useMeta({ title: 'I miei ordini', noindex: true })

  if (loading && !orders) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
  if (!orders?.length) {
    return <EmptyState icon={<Package className="h-6 w-6" />} title="Non hai ancora effettuato ordini" action={<ButtonLink to="/catalogo">Vai al catalogo</ButtonLink>} />
  }
  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Storico ordini</h2>
      <ul className="space-y-3">
        {orders.map((o) => (
          <li key={o.id}>
            <Link to={`/account/ordini/${o.id}`} className="surface block p-5 transition-colors hover:border-ink-400">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono font-semibold">{o.reference}</p>
                  <p className="text-sm text-ink-500">{formatDate(o.created_at)} · {formatPrice(o.total)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {o.kind !== 'order' && <Badge tone="dark">{ORDER_KIND_LABEL[o.kind]}</Badge>}
                  <StatusBadge status={o.order_statuses} />
                  <PaymentBadge status={o.payment_status} />
                  <ChevronRight className="h-4 w-4 text-ink-400" aria-hidden />
                </div>
              </div>
              {o.order_statuses && !o.order_statuses.is_cancelled && (
                <ProgressBar value={o.order_statuses.progress} label={`Avanzamento ${o.reference}`} className="mt-4" />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
