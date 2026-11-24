import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Inbox, Landmark, ListChecks, Package, ShoppingCart, Users } from 'lucide-react'
import type { AdminReminder, Order } from '@/types/db'
import { fetchAuthSettings, supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
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

function Stat({ label, value, icon, to, dim }: { label: string; value: string | number; icon: React.ReactNode; to: string; dim?: boolean }) {
  return (
    <Link to={to} className={cn('surface flex items-center gap-4 p-5 transition-[border-color,opacity] hover:border-ink-400', dim && 'opacity-50')}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-gold-400">{icon}</span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold tabular-nums">{value}</span>
        <span className="block truncate text-sm text-ink-500">{label}</span>
      </span>
    </Link>
  )
}

type Bucket = 'day' | 'week' | 'month'

interface PeriodStats {
  days: number; bucket: Bucket; orders: number; revenue: number
  orders_by_status: { label: string; count: number }[]
  series: { start: string; count: number }[]
}

/** Periodi selezionabili per il riepilogo (in giorni di calendario). */
const PERIODS = [
  { days: 7, label: '7 giorni' },
  { days: 30, label: '30 giorni' },
  { days: 90, label: '3 mesi' },
  { days: 180, label: '6 mesi' },
  { days: 365, label: '12 mesi' },
  { days: 730, label: '24 mesi' },
] as const
const PERIOD_KEY = 'nm:dashboard-days'

function readPeriod(): number {
  try {
    const v = Number(localStorage.getItem(PERIOD_KEY))
    return PERIODS.some((p) => p.days === v) ? v : 30
  } catch {
    return 30
  }
}

const asDate = (iso: string) => new Date(`${iso}T12:00:00`)
const shortLabel = (iso: string, b: Bucket) =>
  b === 'month'
    ? asDate(iso).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })
    : asDate(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
const longLabel = (iso: string, b: Bucket) =>
  b === 'month' ? asDate(iso).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  : b === 'week' ? `Settimana dal ${formatDate(iso)}`
  : formatDate(iso)

/** Grafico a barre leggero (SVG) degli ordini nel periodo, per giorno, settimana o mese. */
function OrdersChart({ data, bucket, label }: { data: { start: string; count: number }[]; bucket: Bucket; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  const w = 600
  const h = 140
  const bw = w / Math.max(1, data.length)
  const every = Math.max(1, Math.ceil(data.length / 7)) // circa 7 etichette, a qualunque scala
  const gap = Math.min(4, bw * 0.25)
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h + 18}`} className="h-44 w-full" role="img" aria-label={`Ordini · ${label}`}>
        {data.map((d, i) => {
          const bh = (d.count / max) * h
          return (
            <g key={d.start}>
              <rect x={i * bw + gap / 2} y={h - bh} width={Math.max(1, bw - gap)} height={Math.max(bh, d.count ? 2 : 0)} rx={Math.min(3, bw / 4)} className="fill-ink-900">
                <title>{`${longLabel(d.start, bucket)}: ${d.count} ordini`}</title>
              </rect>
              {i % every === 0 && <text x={i * bw + bw / 2} y={h + 14} textAnchor="middle" className="fill-ink-400 text-[10px]">{shortLabel(d.start, bucket)}</text>}
            </g>
          )
        })}
        <line x1="0" x2={w} y1={h} y2={h} className="stroke-ink-200" />
      </svg>
      <figcaption className="sr-only">{data.map((d) => `${longLabel(d.start, bucket)}: ${d.count}`).join(', ')}</figcaption>
    </figure>
  )
}

function PeriodPicker({ value, onChange, disabled }: { value: number; onChange: (d: number) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Periodo del riepilogo" className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full bg-ink-100 p-1 text-sm font-semibold">
      {PERIODS.map((p) => (
        <button
          key={p.days}
          type="button"
          role="radio"
          aria-checked={value === p.days}
          disabled={disabled}
          onClick={() => onChange(p.days)}
          className={cn('shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 transition disabled:opacity-50', value === p.days ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900')}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  useMeta({ title: 'Dashboard', noindex: true })
  const { data: stats, loading } = useQuery('admin:stats', async () => {
    const { data, error } = await supabase.rpc('admin_dashboard_stats')
    if (error) throw error
    return data as Stats
  })
  const [days, setDaysState] = useState(readPeriod)
  const setDays = (d: number) => {
    setDaysState(d)
    try { localStorage.setItem(PERIOD_KEY, String(d)) } catch { /* preferenza non salvata: nessun problema */ }
  }
  const { data: period, loading: periodLoading, error: periodError } = useQuery(`admin:stats:period:${days}`, async () => {
    const { data, error } = await supabase.rpc('admin_dashboard_period', { p_days: days })
    if (error) throw error
    return data as PeriodStats
  })
  const periodLabel = PERIODS.find((p) => p.days === days)?.label ?? `${days} giorni`
  // Finché la migration del periodo non è applicata si usano i 30 giorni del riepilogo generale
  const fallback = !!periodError && !period
  const shown: PeriodStats | null = period ?? (fallback && stats
    ? { days: 30, bucket: 'day', orders: stats.orders_last_30d, revenue: stats.revenue_last_30d, orders_by_status: stats.orders_by_status, series: stats.orders_by_day.map((d) => ({ start: d.day, count: d.count })) }
    : null)
  const shownLabel = fallback ? '30 giorni' : periodLabel
  // mentre arriva il nuovo periodo restano visibili i dati precedenti, attenuati
  const stale = periodLoading && !!period && period.days !== days

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

  const maxStatus = Math.max(1, ...(shown?.orders_by_status ?? []).map((s) => s.count))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Panoramica di ordini, clienti e attività da svolgere."
        actions={<PeriodPicker value={fallback ? 30 : days} onChange={setDays} disabled={fallback} />}
      />
      {fallback && (
        <p role="status" className="rounded-xl bg-warning-50 p-4 text-sm text-warning-700">
          Per scegliere il periodo del riepilogo applica la migration <code className="font-mono">20261124000009_dashboard_period.sql</code> (vedi README). Nel frattempo i dati si riferiscono agli ultimi 30 giorni.
        </p>
      )}
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
          <Stat label={`Ordini · ${shownLabel}`} value={shown ? shown.orders : '—'} icon={<ShoppingCart className="h-5 w-5" />} to="/admin/ordini" dim={stale} />
          <Stat label={`Valore ordini · ${shownLabel}`} value={shown ? formatPrice(shown.revenue) : '—'} icon={<Landmark className="h-5 w-5" />} to="/admin/ordini" dim={stale} />
          <Stat label="Clienti registrati" value={stats.customers} icon={<Users className="h-5 w-5" />} to="/admin/utenti" />
          <Stat label="Prodotti pubblicati" value={stats.products_published} icon={<Package className="h-5 w-5" />} to="/admin/prodotti" />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={`Ordini · ultimi ${shownLabel}`} description={shown ? { day: 'Per giorno', week: 'Per settimana', month: 'Per mese' }[shown.bucket] : undefined} />
          <div className={cn('p-5 transition-opacity', stale && 'opacity-50')} aria-busy={stale}>
            {shown ? <OrdersChart data={shown.series} bucket={shown.bucket} label={`ultimi ${shownLabel}`} /> : <Skeleton className="h-44" />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Ordini per stato" description={`Creati negli ultimi ${shownLabel}`} />
          <ul className={cn('space-y-3 p-5 transition-opacity', stale && 'opacity-50')}>
            {(shown?.orders_by_status ?? []).map((s) => (
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
