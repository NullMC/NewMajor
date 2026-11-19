import { useState } from 'react'
import { Mail, Phone } from 'lucide-react'
import type { ContactRequest, ContactStatus } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { Field, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { DataTable } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { useUi } from '@/components/ui/Toast'

const LABEL: Record<ContactStatus, string> = { new: 'Nuova', in_progress: 'In gestione', closed: 'Chiusa' }
const TONE = { new: 'gold', in_progress: 'warning', closed: 'neutral' } as const

export default function ContactRequestsPage() {
  useMeta({ title: 'Richieste di contatto', noindex: true })
  const { toast } = useUi()
  const [tab, setTab] = useState<ContactStatus | 'all'>('new')
  const { data, loading, reload } = useQuery(`admin:contacts:${tab}`, async () => {
    let q = supabase.from('contact_requests').select('*').order('created_at', { ascending: false }).limit(300)
    if (tab !== 'all') q = q.eq('status', tab)
    const { data: rows, error } = await q
    if (error) throw error
    return rows as ContactRequest[]
  })
  const [open, setOpen] = useState<ContactRequest | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!open) return
    setSaving(true)
    const { error } = await supabase.from('contact_requests').update({ status: open.status, admin_notes: open.admin_notes || null }).eq('id', open.id)
    setSaving(false)
    if (error) return toast(errorMessage(error), 'error')
    toast('Richiesta aggiornata')
    setOpen(null)
    void reload()
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Richieste di contatto" description="Messaggi inviati dal modulo Contattaci." />
      <Tabs ariaLabel="Stato richieste" value={tab} onChange={setTab} items={[{ value: 'new', label: 'Nuove' }, { value: 'in_progress', label: 'In gestione' }, { value: 'closed', label: 'Chiuse' }, { value: 'all', label: 'Tutte' }]} />
      {loading && !data ? <Skeleton className="h-48" /> : (
        <DataTable
          caption="Richieste"
          rows={data ?? []}
          rowKey={(r) => r.id}
          onRowClick={(r) => setOpen(r)}
          empty={<EmptyState title="Nessuna richiesta" />}
          columns={[
            { key: 'date', header: 'Data', hideBelow: 'sm', cell: (r) => formatDateTime(r.created_at) },
            { key: 'name', header: 'Mittente', cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-ink-500">{r.email}</p></div> },
            { key: 'subject', header: 'Oggetto', hideBelow: 'md', cell: (r) => <span className="line-clamp-1">{r.subject || r.message}</span> },
            { key: 'status', header: 'Stato', cell: (r) => <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge> },
          ]}
        />
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.subject || 'Richiesta di contatto'} size="lg" footer={<><Button variant="secondary" onClick={() => setOpen(null)}>Chiudi</Button><Button loading={saving} onClick={() => void save()}>Salva</Button></>}>
        {open && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <p className="font-semibold">{open.name}</p>
              <a href={`mailto:${open.email}`} className="inline-flex items-center gap-1.5 hover:underline"><Mail className="h-4 w-4 text-ink-400" />{open.email}</a>
              {open.phone && <a href={`tel:${open.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 hover:underline"><Phone className="h-4 w-4 text-ink-400" />{open.phone}</a>}
              <p className="text-ink-500">{formatDateTime(open.created_at)}</p>
            </div>
            <p className="whitespace-pre-line rounded-xl bg-ink-50 p-4 text-sm">{open.message}</p>
            <Field label="Stato">
              <Select value={open.status} onChange={(e) => setOpen({ ...open, status: e.target.value as ContactStatus })}>
                {Object.entries(LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Note interne"><Textarea rows={3} value={open.admin_notes ?? ''} onChange={(e) => setOpen({ ...open, admin_notes: e.target.value })} maxLength={4000} /></Field>
          </div>
        )}
      </Modal>
    </div>
  )
}
