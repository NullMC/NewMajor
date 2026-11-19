import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import type { Address, Order, Profile, UserRole } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatPrice } from '@/lib/format'
import { invalidate, useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, Card, CardHeader, DataList, EmptyState } from '@/components/ui/Display'
import { Select, Switch } from '@/components/ui/Form'
import { PageLoader } from '@/components/ui/Spinner'
import { useUi } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { AddressBlock, PaymentBadge, StatusBadge } from '@/features/orders/components'
import { toSnapshot } from '@/features/account/api'

export default function UserDetailPage() {
  const { id = '' } = useParams()
  const { user: me } = useAuth()
  const { toast, confirm } = useUi()
  const { data: profile, loading, setData } = useQuery(`admin:user:${id}`, async () => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data as Profile | null
  })
  const { data: orders } = useQuery(`admin:user-orders:${id}`, async () => {
    const { data, error } = await supabase.from('orders').select('*,order_statuses(*)').eq('user_id', id).order('created_at', { ascending: false })
    if (error) throw error
    return data as Order[]
  })
  const { data: addresses } = useQuery(`admin:user-addresses:${id}`, async () => {
    const { data, error } = await supabase.from('addresses').select('*').eq('user_id', id)
    if (error) throw error
    return data as Address[]
  })
  useMeta({ title: profile?.full_name ?? 'Utente', noindex: true })

  if (loading && !profile) return <PageLoader />
  if (!profile) return <EmptyState title="Utente non trovato" />
  const isMe = me?.id === profile.id

  const update = async (patch: Partial<Profile>, message: string) => {
    const prev = profile
    setData({ ...profile, ...patch })
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id)
    if (error) {
      setData(prev)
      return toast(errorMessage(error), 'error')
    }
    invalidate('admin:users')
    toast(message)
  }

  const changeRole = async (role: UserRole) => {
    if (role === profile.role) return
    const ok = await confirm({
      title: role === 'admin' ? 'Concedere i permessi di amministratore?' : 'Rimuovere i permessi di amministratore?',
      message: role === 'admin' ? 'L’utente avrà accesso completo al backoffice, a ordini, clienti e impostazioni.' : undefined,
      confirmLabel: 'Conferma',
      danger: role === 'admin',
    })
    if (ok) await update({ role }, 'Ruolo aggiornato')
  }

  const total = (orders ?? []).filter((o) => o.kind === 'order' && !o.order_statuses?.is_cancelled).reduce((s, o) => s + Number(o.total), 0)

  return (
    <div className="space-y-6">
      <Link to="/admin/utenti" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-900"><ArrowLeft className="h-4 w-4" /> Utenti</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{profile.full_name ?? profile.email}</h1>
        {profile.role === 'admin' && <Badge tone="dark">Admin</Badge>}
        {!profile.is_active && <Badge tone="danger">Disattivato</Badge>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Dati" />
            <div className="p-5">
              <DataList items={[
                { label: 'Email', value: profile.email ? <a href={`mailto:${profile.email}`} className="inline-flex items-center gap-1.5 hover:underline"><Mail className="h-4 w-4 text-ink-400" />{profile.email}</a> : '—' },
                { label: 'Telefono', value: profile.phone ? <a href={`tel:${profile.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 hover:underline"><Phone className="h-4 w-4 text-ink-400" />{profile.phone}</a> : '—' },
                { label: 'Società', value: profile.company_name ?? '—' },
                { label: 'Partita IVA', value: profile.vat_number ?? '—' },
                { label: 'Codice fiscale', value: profile.fiscal_code ?? '—' },
                { label: 'Registrato', value: formatDate(profile.created_at) },
                { label: 'Totale ordini', value: formatPrice(total) },
              ]} />
            </div>
          </Card>
          <Card>
            <CardHeader title={`Ordini (${orders?.length ?? 0})`} />
            <ul className="divide-y divide-ink-100">
              {(orders ?? []).map((o) => (
                <li key={o.id}>
                  <Link to={`/admin/ordini/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50">
                    <span><span className="font-mono text-sm font-semibold">{o.reference}</span><span className="ml-2 text-xs text-ink-500">{formatDate(o.created_at)}</span></span>
                    <span className="flex items-center gap-2"><StatusBadge status={o.order_statuses} /><PaymentBadge status={o.payment_status} /><span className="text-sm font-semibold">{formatPrice(o.total)}</span></span>
                  </Link>
                </li>
              ))}
              {!orders?.length && <li className="px-5 py-4 text-sm text-ink-500">Nessun ordine.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Indirizzi" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {(addresses ?? []).map((a) => <div key={a.id} className="rounded-xl bg-ink-50 p-4">{a.label && <p className="mb-1 text-xs font-semibold uppercase text-ink-500">{a.label}</p>}<AddressBlock a={toSnapshot(a)} /></div>)}
              {!addresses?.length && <p className="text-sm text-ink-500">Nessun indirizzo salvato.</p>}
            </div>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Gestione account" />
          <div className="space-y-5 p-5">
            <label className="block">
              <span className="text-sm font-medium">Ruolo</span>
              <Select className="mt-1.5" value={profile.role} disabled={isMe} onChange={(e) => void changeRole(e.target.value as UserRole)}>
                <option value="customer">Cliente</option>
                <option value="admin">Amministratore</option>
              </Select>
              {isMe && <span className="mt-1 block text-xs text-ink-500">Non puoi modificare il tuo ruolo.</span>}
            </label>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Account attivo</p>
                <p className="text-xs text-ink-500">Se disattivato, l’utente viene disconnesso e non può ordinare.</p>
              </div>
              <Switch label="Account attivo" checked={profile.is_active} disabled={isMe} onChange={(v) => void update({ is_active: v }, v ? 'Account riattivato' : 'Account disattivato')} />
            </div>
            <Link to="/admin/notifiche" className="block text-sm font-semibold underline underline-offset-4">Invia una notifica</Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
