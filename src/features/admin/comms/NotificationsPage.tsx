import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Send, X } from 'lucide-react'
import type { AppNotification, NotificationType, Profile } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { useDebounce } from '@/hooks/useDebounce'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, Card, CardHeader, EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/Form'
import { Tabs } from '@/components/ui/Tabs'
import { useUi } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { listMyNotifications, NOTIFICATION_TYPE_LABEL } from '@/features/notifications/api'
import { NotificationList } from '@/features/account/NotificationsPage'

const COMPOSE_TYPES: NotificationType[] = ['admin_message', 'notice', 'discount', 'sale', 'tip', 'warning', 'custom']

function Composer() {
  const { toast, confirm } = useUi()
  const [audience, setAudience] = useState<'all' | 'selected'>('all')
  const [selected, setSelected] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search.trim(), 300)
  const { data: results } = useQuery(debounced.length >= 2 ? `admin:user-search:${debounced}` : null, async () => {
    const s = debounced.replace(/[,()%*\\]/g, ' ')
    const { data, error } = await supabase.from('profiles').select('*').or(`username.ilike.%${s}%,email.ilike.%${s}%,full_name.ilike.%${s}%`).limit(8)
    if (error) throw error
    return data as Profile[]
  })
  const [form, setForm] = useState({ type: 'admin_message' as NotificationType, title: '', message: '', link: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    setError(null)
    if (!form.title.trim() || !form.message.trim()) return setError('Titolo e messaggio sono obbligatori.')
    if (form.link && !form.link.startsWith('/')) return setError('Il link deve essere un percorso interno, es. /catalogo')
    if (audience === 'selected' && !selected.length) return setError('Seleziona almeno un destinatario.')
    if (audience === 'all' && !(await confirm({ title: 'Inviare a tutti i clienti?', message: 'La notifica comparirà nell’area personale di tutti i clienti attivi.', confirmLabel: 'Invia' }))) return
    setSending(true)
    try {
      const { data, error: e } = await supabase.rpc('admin_send_notification', {
        p_user_ids: audience === 'all' ? null : selected.map((s) => s.id),
        p_type: form.type, p_title: form.title.trim(), p_message: form.message.trim(), p_link: form.link.trim() || null,
      })
      if (e) throw e
      toast(`Notifica inviata a ${data} ${data === 1 ? 'utente' : 'utenti'}`)
      setForm({ ...form, title: '', message: '', link: '' })
      setSelected([])
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Nuova comunicazione" description="Notifica interna visibile nell’area personale dei clienti (nessuna email o push)." />
      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Destinatari">
            <Select value={audience} onChange={(e) => setAudience(e.target.value as 'all' | 'selected')}>
              <option value="all">Tutti i clienti attivi</option>
              <option value="selected">Utenti selezionati</option>
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as NotificationType })}>
              {COMPOSE_TYPES.map((t) => <option key={t} value={t}>{NOTIFICATION_TYPE_LABEL[t]}</option>)}
            </Select>
          </Field>
        </div>
        {audience === 'selected' && (
          <div className="space-y-2">
            <div className="relative">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca per email o nome" aria-label="Cerca destinatari" />
              {!!results?.length && search && (
                <ul className="absolute inset-x-0 top-12 z-10 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop">
                  {results.filter((r) => !selected.some((s) => s.id === r.id)).map((p) => (
                    <li key={p.id}><button type="button" className="w-full px-4 py-2.5 text-left text-sm hover:bg-ink-50" onClick={() => { setSelected([...selected, p]); setSearch('') }}>{p.full_name ?? '—'} · {p.email ?? `@${p.username}`}</button></li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-ink-100 py-1 pl-3 pr-1 text-xs font-medium">
                  {p.full_name ?? p.username ?? p.email}
                  <button type="button" onClick={() => setSelected(selected.filter((s) => s.id !== p.id))} className="rounded-full p-1 hover:bg-ink-200" aria-label={`Rimuovi ${p.full_name ?? p.username ?? p.email}`}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          </div>
        )}
        <Field label="Titolo" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={160} /></Field>
        <Field label="Messaggio" required><Textarea rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={4000} /></Field>
        <Field label="Link (facoltativo)" hint="Percorso interno, es. /catalogo o /prodotti/nome-prodotto"><Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} maxLength={300} /></Field>
        <FormError message={error} />
        <Button icon={<Send className="h-4 w-4" />} loading={sending} onClick={() => void send()}>Invia notifica</Button>
      </div>
    </Card>
  )
}

function SentList() {
  const { data, loading } = useQuery('admin:notifications:sent', async () => {
    const { data: rows, error } = await supabase
      .from('notifications').select('*,profiles:user_id(full_name,email)').not('created_by', 'is', null)
      .order('created_at', { ascending: false }).limit(100)
    if (error) throw error
    return rows as (AppNotification & { profiles: { full_name: string | null; email: string | null } | null })[]
  })
  if (loading && !data) return <Skeleton className="h-40" />
  if (!data?.length) return <EmptyState title="Nessuna notifica inviata" />
  return (
    <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white">
      {data.map((n) => (
        <li key={n.id} className="px-5 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{n.title}</span>
            <Badge>{NOTIFICATION_TYPE_LABEL[n.type]}</Badge>
            {n.is_read && <Badge tone="success">Letta</Badge>}
          </div>
          <p className="text-ink-600">{n.message}</p>
          <p className="text-xs text-ink-400">{n.profiles?.full_name ?? n.profiles?.email} · {formatDateTime(n.created_at)}</p>
        </li>
      ))}
    </ul>
  )
}

function MyList() {
  const { user } = useAuth()
  const { data, loading, setData } = useQuery(`notifications:all:${user?.id}`, () => listMyNotifications(200))
  if (loading && !data) return <Skeleton className="h-40" />
  if (!data?.length) return <EmptyState title="Nessuna notifica" description="Qui arrivano i nuovi ordini e le richieste di aggiornamento dei clienti." />
  return (
    <NotificationList
      items={data}
      onRead={(id) => setData((d) => (d ?? []).map((n) => (n.id === id ? { ...n, is_read: true } : n)))}
      onDelete={(id) => setData((d) => (d ?? []).filter((n) => n.id !== id))}
    />
  )
}

export default function AdminNotificationsPage() {
  useMeta({ title: 'Notifiche', noindex: true })
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as 'invia' | 'inviate' | 'mie') ?? 'invia'
  return (
    <div className="space-y-6">
      <PageHeader title="Notifiche" description="Comunicazioni interne ai clienti e avvisi per lo staff." />
      <Tabs ariaLabel="Sezione notifiche" value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} items={[{ value: 'invia', label: 'Invia' }, { value: 'inviate', label: 'Inviate' }, { value: 'mie', label: 'Le mie notifiche' }]} />
      {tab === 'invia' && <Composer />}
      {tab === 'inviate' && <SentList />}
      {tab === 'mie' && <MyList />}
    </div>
  )
}
