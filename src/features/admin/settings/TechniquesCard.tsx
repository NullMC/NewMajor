// Tecniche di stampa: prezzo minimo e massimo per area. Il prezzo di ogni area del cliente va dal
// minimo al massimo in proporzione alla superficie occupata rispetto all'area massima della zona.

import { useEffect, useState } from 'react'
import type { PrintTechnique } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { invalidate, useQuery } from '@/hooks/useQuery'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Display'
import { FormError, Input, Switch } from '@/components/ui/Form'
import { useUi } from '@/components/ui/Toast'
import { listTechniques } from '@/features/catalog/techniques'

type Row = Omit<PrintTechnique, 'min_price' | 'max_price'> & { min_price: string; max_price: string }
const num = (s: string) => Number(s.replace(',', '.'))

export function TechniquesCard() {
  const { toast } = useUi()
  const { data } = useQuery('print-techniques', listTechniques)
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (data) setRows(data.map((t) => ({ ...t, min_price: String(t.min_price), max_price: String(t.max_price) })))
  }, [data])
  const set = (code: string, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.code === code ? { ...x, ...patch } : x)))

  const save = async () => {
    for (const r of rows) {
      const min = num(r.min_price), max = num(r.max_price)
      if (!r.name.trim()) return setError('Ogni tecnica deve avere un nome.')
      if (!(min >= 0) || !(max >= min)) return setError(`${r.name}: il prezzo massimo deve essere maggiore o uguale al minimo (entrambi ≥ 0).`)
    }
    setSaving(true)
    setError(null)
    try {
      for (const r of rows) {
        const { error: e } = await supabase.from('print_techniques')
          .update({ name: r.name.trim(), min_price: num(r.min_price), max_price: num(r.max_price), is_active: r.is_active, updated_at: new Date().toISOString() })
          .eq('code', r.code)
        if (e) throw e
      }
      invalidate('print-techniques')
      toast('Tecniche salvate')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Tecniche di stampa" description="Prezzo per area di stampa, dal minimo (area piccola) al massimo (area che occupa tutta la zona), calcolato in proporzione alla superficie. La sublimazione è proposta solo sugli articoli con grafica all-over." />
      <div className="overflow-x-auto p-5">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-ink-500">
              <th className="pb-2 font-medium">Tecnica</th>
              <th className="pb-2 font-medium">Minimo (€)</th>
              <th className="pb-2 font-medium">Massimo (€)</th>
              <th className="pb-2 font-medium">Attiva</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={r.code}>
                <td className="py-2 pr-3"><Input value={r.name} maxLength={60} onChange={(e) => set(r.code, { name: e.target.value })} aria-label={`Nome ${r.code}`} /></td>
                <td className="py-2 pr-3"><Input inputMode="decimal" value={r.min_price} onChange={(e) => set(r.code, { min_price: e.target.value })} aria-label={`Prezzo minimo ${r.name}`} /></td>
                <td className="py-2 pr-3"><Input inputMode="decimal" value={r.max_price} onChange={(e) => set(r.code, { max_price: e.target.value })} aria-label={`Prezzo massimo ${r.name}`} /></td>
                <td className="py-2"><Switch checked={r.is_active} onChange={(v) => set(r.code, { is_active: v })} label={`${r.name} attiva`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <FormError message={error} />
      </div>
      <div className="flex justify-end border-t border-ink-100 px-5 py-3"><Button size="sm" loading={saving} onClick={() => void save()}>Salva</Button></div>
    </Card>
  )
}
