import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import type { Order, OrderKind, PaymentStatus } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { formatDate, formatPrice, ORDER_KIND_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/format'
import { useDebounce } from '@/hooks/useDebounce'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Form'
import { DataTable } from '@/components/ui/Table'
import { listStatuses } from '@/features/orders/api'
import { PaymentBadge, StatusBadge } from '@/features/orders/components'

const PAGE = 50

export default function OrdersPage() {
  useMeta({ title: 'Ordini', noindex: true })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const search = useDebounce(q.trim(), 300)
  const status = params.get('stato') ?? ''
  const payment = params.get('pagamento') ?? ''
  const kind = params.get('tipo') ?? 'order'
  const from = params.get('dal') ?? ''
  const to = params.get('al') ?? ''
  const [limit, setLimit] = useState(PAGE)
  const { data: statuses } = useQuery('order-statuses', listStatuses)

  const key = `admin:orders:${JSON.stringify({ search, status, payment, kind, from, to, limit })}`
  const { data, loading } = useQuery(key, async () => {
    let query = supabase.from('orders').select('*,order_statuses(*)', { count: 'exact' }).order('created_at', { ascending: false }).limit(limit)
    if (status) query = query.eq('status_id', status)
    if (payment) query = query.eq('payment_status', payment as PaymentStatus)
    if (kind) query = query.eq('kind', kind as OrderKind)
    if (from) query = query.gte('created_at', `${from}T00:00:00`)
    if (to) query = query.lte('created_at', `${to}T23:59:59`)
    if (search) {
      const s = search.replace(/[,()%*\\]/g, ' ')
      query = query.or(`reference.ilike.%${s}%,customer_name.ilike.%${s}%,customer_email.ilike.%${s}%,customer_phone.ilike.%${s}%`)
    }
    const { data: rows, error, count } = await query
    if (error) throw error
    return { rows: rows as Order[], count: count ?? 0 }
  })

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params)
    if (v) n.set(k, v)
    else n.delete(k)
    setParams(n, { replace: true })
    setLimit(PAGE)
  }
  const rows = useMemo(() => data?.rows ?? [], [data])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ordini"
        description={data ? `${data.count} risultati` : undefined}
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/admin/ordini/nuovo')}>Ordine / preventivo manuale</Button>}
      />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_11rem_11rem_9rem_9.5rem_9.5rem]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} placeholder="Riferimento, cliente, email, telefono" className="pl-10" aria-label="Cerca ordini" />
        </div>
        <Select value={status} onChange={(e) => set('stato', e.target.value)} aria-label="Stato">
          <option value="">Tutti gli stati</option>
          {(statuses ?? []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        <Select value={payment} onChange={(e) => set('pagamento', e.target.value)} aria-label="Pagamento">
          <option value="">Tutti i pagamenti</option>
          <option value="awaiting_transfer">In attesa di bonifico</option>
          <option value="pending">Alla consegna</option>
          <option value="paid">Pagato</option>
          <option value="refunded">Rimborsato</option>
        </Select>
        <Select value={kind} onChange={(e) => set('tipo', e.target.value)} aria-label="Tipo">
          <option value="order">Ordini</option>
          <option value="quote">Preventivi</option>
          <option value="test">Test</option>
          <option value="">Tutti</option>
        </Select>
        <Input type="date" value={from} onChange={(e) => set('dal', e.target.value)} aria-label="Dal" />
        <Input type="date" value={to} onChange={(e) => set('al', e.target.value)} aria-label="Al" />
      </div>

      {loading && !data ? <Skeleton className="h-72" /> : (
        <DataTable
          caption="Ordini"
          rows={rows}
          rowKey={(o) => o.id}
          onRowClick={(o) => navigate(`/admin/ordini/${o.id}`)}
          empty={<EmptyState title="Nessun ordine" description="Nessun ordine corrisponde ai filtri." />}
          columns={[
            { key: 'ref', header: 'Riferimento', cell: (o) => <span className="font-mono text-[13px] font-semibold">{o.reference}</span> },
            { key: 'date', header: 'Data', hideBelow: 'md', cell: (o) => formatDate(o.created_at) },
            { key: 'customer', header: 'Cliente', cell: (o) => <div className="min-w-0"><p className="truncate font-medium">{o.customer_name}</p><p className="truncate text-xs text-ink-500">{o.customer_phone ?? o.customer_email}</p></div> },
            { key: 'status', header: 'Stato', cell: (o) => <span className="flex flex-wrap gap-1"><StatusBadge status={o.order_statuses} />{o.kind !== 'order' && <Badge tone="dark">{ORDER_KIND_LABEL[o.kind]}</Badge>}</span> },
            { key: 'pay', header: 'Pagamento', hideBelow: 'lg', cell: (o) => <div className="space-y-1"><PaymentBadge status={o.payment_status} /><p className="text-xs text-ink-500">{PAYMENT_METHOD_LABEL[o.payment_method]}</p></div> },
            { key: 'total', header: 'Totale', className: 'text-right', cell: (o) => <span className="font-semibold">{formatPrice(o.total)}</span> },
          ]}
        />
      )}
      {data && data.count > rows.length && (
        <div className="flex justify-center"><Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>Carica altri</Button></div>
      )}
    </div>
  )
}
