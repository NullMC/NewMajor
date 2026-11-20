import { Link } from 'react-router-dom'
import { ArrowRight, Inbox, Landmark, ListChecks, Package, ShoppingCart, Users } from 'lucide-react'
import type { AdminReminder, Order } from '@/types/db'
import { fetchAuthSettings, supabase } from '@/lib/supabase'
import { formatDate, formatDateTime, formatPrice } from '@/lib/format'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Card, CardHeader, PageHeader, Skeleton } from '@/components/ui/Display'
import { StatusBadge } from '@/features/orders/components'

interface Stats {
  orders_total: number; orders_open: number; orders_last_30d: number; revenue_last_30d: number
  awaiting_transfer: number; customers: number; contact_new: number; reminders_open: number; products_published: number
  orders_by_status: { label: string; count: number }[]
  orders_by_day: { day: string; count: number }[]
}

function Stat({ label, value, icon, to }: { label: string; value: string | number; icon: React.ReactNode; to: string }) {
  return (
    <Link to={to} className="surface flex items-center gap-4 p-5 transition-colors hover:border-ink-400">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-gold-400">{icon}</span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold tabular-nums">{value}</span>
        <span className="block truncate text-sm text-ink-500">{label}</span>
      </span>
    </Link>
  )
}

/** Grafico a barre leggero (SVG) degli ordini negli ultimi 30 giorni. */
function OrdersChart({ data }: { data: Stats['orders_by_day'] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  const w = 600
  const h = 140
  const bw = w / data.length
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h + 18}`} className="h-44 w-full" role="img" aria-label="Ordini negli ultimi 30 giorni">
        {data.map((d, i) => {
          const bh = (d.count / max) * h
          return (
            <g key={d.day}>
              <rect x={i * bw + 2} y={h - bh} width={bw - 4} height={Math.max(bh, d.count ? 2 : 0)} rx="3" className="fill-ink-900" >
                <title>{`${formatDate(d.day)}: ${d.count} ordini`}</title>
              </rect>
              {i % 7 === 0 && <text x={i * bw + bw / 2} y={h + 14} textAnchor="middle" className="fill-ink-400 text-[10px]">{new Date(d.day).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}</text>}
            </g>
          )
        })}
        <line x1="0" x2={w} y1={h} y2={h} className="stroke-ink-200" />
      </svg>
      <figcaption className="sr-only">{data.map((d) => `${d.day}: ${d.count}`).join(', ')}</figcaption>
    </figure>
  )
}

export default function DashboardPage() {
  useMeta({ title: 'Dashboard', noindex: true })
  const { data: stats, loading } = useQuery('admin:stats', async () => {
    const { data, error } = await supabase.rpc('admin_dashboard_stats')
    if (error) throw error
    return data as Stats
  })
  const { data: recent } = useQuery('admin:orders:recent', async () => {
    const { data, error } = await supabase.from('orders').select('*,order_statuses(*)').eq('kind', 'order').order('created_at', { ascending: false }).limit(8)
    if (error) throw error
    return data as Order[]
  })
  const { data: reminders } = useQuery('admin:reminders:open', async () => {
    const { data, error } = await supabase.from('admin_reminders').select('*,orders(reference)').eq('is_done', false).order('due_at', { ascending: true, nullsFirst: false }).limit(8)
    if (error) throw error
    return data as AdminReminder[]
  })

  const { data: authSettings } = useQuery('auth:settings', fetchAuthSettings, { staleMs: 300_000 })

  const maxStatus = Math.max(1, ...(stats?.orders_by_status ?? []).map((s) => s.count))

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Panoramica di ordini, clienti e attività da svolgere." />
      {authSettings?.mailer_autoconfirm === false && (
        <p role="alert" className="rounded-xl bg-warning-50 p-4 text-sm text-warning-700">
          In Supabase è attiva la conferma email (Authentication → Sign In / Providers → Email → <strong>Confirm email</strong>): finché resta attiva i clienti devono indicare l’email per registrarsi. Disattivala per consentire la registrazione con il solo nome utente.
        </p>
      )}
      {loading && !stats ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : stats && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Ordini in corso" value={stats.orders_open} icon={<ShoppingCart className="h-5 w-5" />} to="/admin/ordini" />
          <Stat label="Bonifici da verificare" value={stats.awaiting_transfer} icon={<Landmark className="h-5 w-5" />} to="/admin/ordini?pagamento=awaiting_transfer" />
          <Stat label="Promemoria aperti" value={stats.reminders_open} icon={<ListChecks className="h-5 w-5" />} to="/admin/promemoria" />
          <Stat label="Nuove richieste di contatto" value={stats.contact_new} icon={<Inbox className="h-5 w-5" />} to="/admin/richieste" />
          <Stat label="Ordini ultimi 30 giorni" value={stats.orders_last_30d} icon={<ShoppingCart className="h-5 w-5" />} to="/admin/ordini" />
          <Stat label="Valore ordini 30 giorni" value={formatPrice(stats.revenue_last_30d)} icon={<Landmark className="h-5 w-5" />} to="/admin/ordini" />
          <Stat label="Clienti registrati" value={stats.customers} icon={<Users className="h-5 w-5" />} to="/admin/utenti" />
          <Stat label="Prodotti pubblicati" value={stats.products_published} icon={<Package className="h-5 w-5" />} to="/admin/prodotti" />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Ordini negli ultimi 30 giorni" />
          <div className="p-5">{stats ? <OrdersChart data={stats.orders_by_day} /> : <Skeleton className="h-44" />}</div>
        </Card>
        <Card>
          <CardHeader title="Ordini per stato" />
          <ul className="space-y-3 p-5">
            {(stats?.orders_by_status ?? []).map((s) => (
              <li key={s.label} className="text-sm">
                <div className="flex justify-between"><span>{s.label}</span><span className="font-semibold tabular-nums">{s.count}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-gold-500" style={{ width: `${(s.count / maxStatus) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Ultimi ordini" action={<Link to="/admin/ordini" className="inline-flex items-center gap-1 text-sm font-semibold hover:underline">Tutti <ArrowRight className="h-4 w-4" /></Link>} />
          <ul className="divide-y divide-ink-100">
            {(recent ?? []).map((o) => (
              <li key={o.id}>
                <Link to={`/admin/ordini/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{o.reference}</p>
                    <p className="truncate text-xs text-ink-500">{o.customer_name} · {formatDateTime(o.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3"><StatusBadge status={o.order_statuses} /><span className="text-sm font-semibold">{formatPrice(o.total)}</span></div>
                </Link>
              </li>
            ))}
            {!recent?.length && <li className="px-5 py-4 text-sm text-ink-500">Nessun ordine.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Promemoria" action={<Link to="/admin/promemoria" className="inline-flex items-center gap-1 text-sm font-semibold hover:underline">Tutti <ArrowRight className="h-4 w-4" /></Link>} />
          <ul className="divide-y divide-ink-100">
            {(reminders ?? []).map((r) => (
              <li key={r.id}>
                <Link to={r.order_id ? `/admin/ordini/${r.order_id}` : '/admin/promemoria'} className="block px-5 py-3 hover:bg-ink-50">
                  <p className="text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-ink-500">{r.due_at ? `Entro ${formatDateTime(r.due_at)}` : 'Senza scadenza'}{r.orders?.reference ? ` · ${r.orders.reference}` : ''}</p>
                </Link>
              </li>
            ))}
            {!reminders?.length && <li className="px-5 py-4 text-sm text-ink-500">Nessun promemoria aperto.</li>}
          </ul>
        </Card>
      </div>
    </div>
  )
}
