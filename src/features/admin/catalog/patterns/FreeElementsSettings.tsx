// Impostazioni dei loghi e sponsor liberi del prodotto: numero massimo, prezzo per elemento,
// limiti di larghezza e zone consentite. Richiedono un cartamodello con taglia di riferimento.
// In fondo: attivazione e prezzo della grafica all-over scelta dal cliente.

import { useState } from 'react'
import type { ProductDetail } from '@/types/db'
import type { PrintZone } from '@/types/config'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { ZONE_LABEL } from '@/lib/patterns/placement'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Display'
import { Field, FormError, Input, Switch } from '@/components/ui/Form'
import { useUi } from '@/components/ui/Toast'

const ZONES = Object.keys(ZONE_LABEL) as PrintZone[]

export function FreeElementsSettings({ product, onSaved }: { product: ProductDetail; onSaved: () => void }) {
  const { toast } = useUi()
  const [v, setV] = useState({
    max: String(product.free_elements_max ?? 0),
    logo: String(product.free_logo_price ?? 0),
    sponsor: String(product.free_sponsor_price ?? 0),
    minW: String(product.free_min_width_cm ?? 2),
    maxW: String(product.free_max_width_cm ?? 40),
    zones: (product.free_zones ?? ZONES) as PrintZone[],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const n = (s: string) => Number(s.replace(',', '.'))

  const save = async () => {
    const max = Math.round(n(v.max)), minW = n(v.minW), maxW = n(v.maxW)
    if (!(max >= 0 && max <= 30)) return setError('Il numero massimo deve essere tra 0 e 30.')
    if (!(minW > 0 && maxW >= minW)) return setError('Controlla le larghezze: la minima deve essere positiva e non superiore alla massima.')
    if (max > 0 && !v.zones.length) return setError('Scegli almeno una zona.')
    setSaving(true)
    setError(null)
    try {
      const { error: e } = await supabase.from('products').update({
        free_elements_max: max, free_logo_price: Math.max(0, n(v.logo) || 0), free_sponsor_price: Math.max(0, n(v.sponsor) || 0),
        free_min_width_cm: minW, free_max_width_cm: maxW, free_zones: v.zones,
      }).eq('id', product.id)
      if (e) throw e
      toast('Impostazioni salvate')
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Loghi e sponsor liberi" description="Il cliente aggiunge loghi e sponsor e li posiziona dove vuole sulle zone scelte, sui pezzi della taglia di riferimento. 0 = funzione disattivata." />
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Numero massimo"><Input inputMode="numeric" value={v.max} onChange={(e) => setV({ ...v, max: e.target.value })} /></Field>
        <Field label="Prezzo per logo (€)"><Input inputMode="decimal" value={v.logo} onChange={(e) => setV({ ...v, logo: e.target.value })} /></Field>
        <Field label="Prezzo per sponsor (€)"><Input inputMode="decimal" value={v.sponsor} onChange={(e) => setV({ ...v, sponsor: e.target.value })} /></Field>
        <Field label="Larghezza minima (cm)"><Input inputMode="decimal" value={v.minW} onChange={(e) => setV({ ...v, minW: e.target.value })} /></Field>
        <Field label="Larghezza massima (cm)"><Input inputMode="decimal" value={v.maxW} onChange={(e) => setV({ ...v, maxW: e.target.value })} /></Field>
        <fieldset className="sm:col-span-2 lg:col-span-5">
          <legend className="text-sm font-medium text-ink-800">Zone consentite</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ZONES.map((z) => {
              const on = v.zones.includes(z)
              return (
                <label key={z} className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ${on ? 'bg-ink-900 text-white ring-ink-900' : 'ring-ink-200'}`}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => setV({ ...v, zones: on ? v.zones.filter((x) => x !== z) : [...v.zones, z] })} />
                  {ZONE_LABEL[z]}
                </label>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-ink-500">Nel configuratore compaiono solo le zone che hanno un pezzo nel cartamodello (per le maniche servono sinistra e destra).</p>
        </fieldset>
        <div className="sm:col-span-2 lg:col-span-5"><FormError message={error} /></div>
        <div className="flex justify-end sm:col-span-2 lg:col-span-5"><Button loading={saving} onClick={() => void save()}>Salva</Button></div>
      </div>
    </Card>
  )
}

/** Grafica all-over scelta dal cliente: attivazione e prezzo per capo (o per componente del kit). */
export function AllOverSettings({ product, onSaved }: { product: ProductDetail; onSaved: () => void }) {
  const { toast } = useUi()
  const [enabled, setEnabled] = useState(!!product.all_over_enabled)
  const [price, setPrice] = useState(String(product.all_over_price ?? 0))
  const isKit = product.product_type === 'kit' && product.kit_items.length > 0
  // componenti del kit su cui è consentita (es. solo la maglia, non il pantaloncino)
  const [kitOn, setKitOn] = useState<Record<string, boolean>>(() => Object.fromEntries(product.kit_items.map((k) => [k.id, k.all_over_enabled !== false])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const p = Number(price.replace(',', '.'))
    if (!(p >= 0)) return setError('Il prezzo deve essere un numero maggiore o uguale a 0.')
    if (enabled && isKit && !Object.values(kitOn).some(Boolean)) return setError('Scegli almeno un componente del kit, oppure disattiva la grafica all-over.')
    setSaving(true)
    setError(null)
    try {
      const { error: e } = await supabase.from('products').update({ all_over_enabled: enabled, all_over_price: p }).eq('id', product.id)
      if (e) throw e
      for (const k of product.kit_items) {
        if ((k.all_over_enabled !== false) === kitOn[k.id]) continue
        const { error: ke } = await supabase.from('kit_items').update({ all_over_enabled: kitOn[k.id] }).eq('id', k.id)
        if (ke) throw ke
      }
      toast('Impostazioni salvate')
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Grafica all-over"
        description="Il cliente carica una grafica che copre tutto il capo (per i kit: ogni componente) e può sostituirla su singoli pezzi. Collo e polsini restano nel colore dei profili. Con il cartamodello la grafica riempie ogni pezzo nel file di stampa e la risoluzione viene controllata sulle misure reali."
      />
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch checked={enabled} onChange={setEnabled} label="Consenti grafica all-over" />
          <span className="text-sm font-medium text-ink-800">Consenti grafica all-over</span>
        </div>
        <Field label="Prezzo all-over (€ per capo)" hint="Per i kit si applica a ogni componente con grafica all-over.">
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        {isKit && enabled && (
          <fieldset className="sm:col-span-2 lg:col-span-5">
            <legend className="text-sm font-medium text-ink-800">Componenti con grafica all-over</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {product.kit_items.map((k) => {
                const on = !!kitOn[k.id]
                return (
                  <label key={k.id} className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ${on ? 'bg-ink-900 text-white ring-ink-900' : 'ring-ink-200'}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => setKitOn({ ...kitOn, [k.id]: !on })} />
                    {k.label}
                  </label>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-ink-500">Es. per una divisa da calcio solo la maglia. Gli altri componenti restano in tinta unita con loghi, nomi e numeri.</p>
          </fieldset>
        )}
        <div className="sm:col-span-2 lg:col-span-5"><FormError message={error} /></div>
        <div className="flex justify-end sm:col-span-2 lg:col-span-5"><Button loading={saving} onClick={() => void save()}>Salva</Button></div>
      </div>
    </Card>
  )
}
