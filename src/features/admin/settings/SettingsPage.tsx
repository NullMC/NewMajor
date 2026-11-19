import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { SettingsMap } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { slugify } from '@/lib/slug'
import { invalidate, useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, PageHeader, Skeleton } from '@/components/ui/Display'
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Form'
import { useUi } from '@/components/ui/Toast'
import { DEFAULT_SETTINGS, useSettings } from '@/features/settings/SettingsProvider'

type K = keyof SettingsMap

export default function SettingsPage() {
  useMeta({ title: 'Impostazioni', noindex: true })
  const { toast } = useUi()
  const { reload: reloadPublic } = useSettings()
  const { data, loading } = useQuery('admin:settings', async () => {
    const { data: rows, error } = await supabase.from('settings').select('key,value')
    if (error) throw error
    return Object.fromEntries((rows ?? []).map((r) => [r.key, r.value])) as Partial<SettingsMap>
  })
  const [s, setS] = useState<SettingsMap | null>(null)
  const [saving, setSaving] = useState<K | null>(null)

  useEffect(() => {
    if (!data) return
    const merged = {} as SettingsMap
    for (const k of Object.keys(DEFAULT_SETTINGS) as K[]) (merged as unknown as Record<string, unknown>)[k] = { ...DEFAULT_SETTINGS[k], ...(data[k] as object) }
    setS(merged)
  }, [data])

  if (loading || !s) return <Skeleton className="h-96" />

  const set = <T extends K>(k: T, patch: Partial<SettingsMap[T]>) => setS({ ...s, [k]: { ...s[k], ...patch } })

  const save = async (k: K) => {
    setSaving(k)
    try {
      if (k === 'bank_transfer' && s.bank_transfer.iban && !/^[A-Z]{2}\d{2}[A-Z0-9 ]{10,32}$/i.test(s.bank_transfer.iban.trim())) {
        throw new Error('IBAN non valido.')
      }
      const { error } = await supabase.from('settings').upsert({ key: k, value: s[k], is_public: true })
      if (error) throw error
      invalidate('settings:')
      void reloadPublic()
      toast('Impostazioni salvate')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSaving(null)
    }
  }

  const SaveBtn = ({ k }: { k: K }) => <div className="flex justify-end border-t border-ink-100 px-5 py-3"><Button size="sm" loading={saving === k} onClick={() => void save(k)}>Salva</Button></div>
  const inp = (label: string, value: string | number | null | undefined, onChange: (v: string) => void, props: Record<string, unknown> = {}) => (
    <Field label={label}><Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...props} /></Field>
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Impostazioni" description="Dati aziendali, pagamenti, spedizioni, qualità grafiche, catalogo e cookie." />

      <Card>
        <CardHeader title="Dati aziendali" description="Mostrati nel footer, nella pagina contatti e nelle pagine legali." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {inp('Ragione sociale / nome', s.company.name, (v) => set('company', { name: v }))}
          {inp('Sede legale', s.company.legal_address, (v) => set('company', { legal_address: v }))}
          {inp('Partita IVA', s.company.vat_number, (v) => set('company', { vat_number: v }))}
          {inp('REA', s.company.rea, (v) => set('company', { rea: v }))}
          {inp('Telefono info e ordini', s.company.phone, (v) => set('company', { phone: v }))}
          {inp('Telefono alternativo', s.company.phone_alt, (v) => set('company', { phone_alt: v }))}
          {inp('Email', s.company.email, (v) => set('company', { email: v }), { type: 'email' })}
          {inp('Indirizzo alternativo', s.company.alt_address, (v) => set('company', { alt_address: v }))}
          <div className="flex items-center gap-3 sm:col-span-2"><Switch label="Mostra indirizzo alternativo" checked={!!s.company.show_alt_address} onChange={(v) => set('company', { show_alt_address: v })} /><span className="text-sm">Mostra indirizzo alternativo sul sito</span></div>
        </div>
        <SaveBtn k="company" />
      </Card>

      <Card>
        <CardHeader title="Bonifico bancario" description="Coordinate mostrate al cliente dopo l’ordine con pagamento tramite bonifico." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {inp('Intestatario', s.bank_transfer.account_holder, (v) => set('bank_transfer', { account_holder: v }))}
          {inp('IBAN', s.bank_transfer.iban, (v) => set('bank_transfer', { iban: v.toUpperCase() }), { className: 'font-mono' })}
          {inp('Banca', s.bank_transfer.bank_name, (v) => set('bank_transfer', { bank_name: v }))}
          {inp('BIC / SWIFT', s.bank_transfer.bic, (v) => set('bank_transfer', { bic: v.toUpperCase() }))}
          <Field label="Istruzioni aggiuntive" className="sm:col-span-2"><Textarea rows={2} value={s.bank_transfer.instructions ?? ''} onChange={(e) => set('bank_transfer', { instructions: e.target.value })} /></Field>
        </div>
        <SaveBtn k="bank_transfer" />
      </Card>

      <Card>
        <CardHeader title="Metodi di pagamento" />
        <div className="space-y-4 p-5">
          {(['cash_on_delivery', 'bank_transfer'] as const).map((m) => (
            <div key={m} className="grid gap-3 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div className="flex items-center gap-3">
                <Switch label={m} checked={s.payments[m]?.enabled !== false} onChange={(v) => set('payments', { [m]: { ...s.payments[m], enabled: v } })} />
                <span className="text-sm font-medium">{m === 'bank_transfer' ? 'Bonifico bancario' : 'Pagamento alla consegna'}</span>
              </div>
              <Input value={s.payments[m]?.note ?? ''} onChange={(e) => set('payments', { [m]: { ...s.payments[m], note: e.target.value } })} placeholder="Nota mostrata al checkout (facoltativa)" aria-label={`Nota ${m}`} />
            </div>
          ))}
        </div>
        <SaveBtn k="payments" />
      </Card>

      <Card>
        <CardHeader title="Spedizione" />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Modalità">
            <Select value={s.shipping.mode} onChange={(e) => set('shipping', { mode: e.target.value as 'quote' | 'flat' })}>
              <option value="quote">Da definire alla conferma</option>
              <option value="flat">Costo fisso</option>
            </Select>
          </Field>
          {s.shipping.mode === 'flat' && (
            <>
              {inp('Costo (€)', s.shipping.amount, (v) => set('shipping', { amount: v === '' ? null : Number(v) }), { type: 'number', step: '0.01', min: 0 })}
              {inp('Gratuita sopra (€)', s.shipping.free_over, (v) => set('shipping', { free_over: v === '' ? null : Number(v) }), { type: 'number', step: '0.01', min: 0 })}
            </>
          )}
          <Field label="Nota per il cliente" className="sm:col-span-3"><Input value={s.shipping.note ?? ''} onChange={(e) => set('shipping', { note: e.target.value })} /></Field>
        </div>
        <SaveBtn k="shipping" />
      </Card>

      <Card>
        <CardHeader title="Controllo qualità grafiche" description="Soglie usate dal configuratore per avvisare i clienti." />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          {inp('DPI minimi consigliati', s.quality.min_dpi, (v) => set('quality', { min_dpi: Number(v) || 300 }), { type: 'number', min: 72 })}
          {inp('Soglia qualità insufficiente (DPI)', s.quality.warn_dpi, (v) => set('quality', { warn_dpi: Number(v) || 150 }), { type: 'number', min: 36 })}
          {inp('Dimensione massima file (MB)', s.quality.max_file_mb, (v) => set('quality', { max_file_mb: Math.min(50, Number(v) || 50) }), { type: 'number', min: 1, max: 50 })}
        </div>
        <SaveBtn k="quality" />
      </Card>

      <Card>
        <CardHeader title="Filtri del catalogo" description="Attributi aggiuntivi filtrabili (es. Sport, Genere). Il valore per prodotto si imposta nella scheda prodotto." />
        <div className="space-y-2 p-5">
          {s.catalog.filters.map((f, i) => (
            <div key={i} className="flex gap-2">
              <Input value={f.label} onChange={(e) => set('catalog', { filters: s.catalog.filters.map((x, j) => (j === i ? { label: e.target.value, key: x.key || slugify(e.target.value).replace(/-/g, '_') } : x)) })} placeholder="Etichetta" aria-label="Etichetta filtro" />
              <Input value={f.key} onChange={(e) => set('catalog', { filters: s.catalog.filters.map((x, j) => (j === i ? { ...x, key: e.target.value.replace(/[^a-z0-9_]/g, '') } : x)) })} placeholder="chiave" className="max-w-[10rem] font-mono" aria-label="Chiave filtro" />
              <button type="button" onClick={() => set('catalog', { filters: s.catalog.filters.filter((_, j) => j !== i) })} className="rounded-lg p-2 text-ink-400 hover:text-danger-600" aria-label="Rimuovi filtro"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => set('catalog', { filters: [...s.catalog.filters, { key: '', label: '' }] })}>Aggiungi filtro</Button>
        </div>
        <SaveBtn k="catalog" />
      </Card>

      <Card>
        <CardHeader title="Banner cookie" />
        <div className="grid gap-4 p-5">
          <Field label="Testo del banner"><Textarea rows={3} value={s.cookie.text} onChange={(e) => set('cookie', { text: e.target.value })} /></Field>
          {inp('Link alla cookie policy', s.cookie.policy_link, (v) => set('cookie', { policy_link: v }))}
        </div>
        <SaveBtn k="cookie" />
      </Card>
    </div>
  )
}
