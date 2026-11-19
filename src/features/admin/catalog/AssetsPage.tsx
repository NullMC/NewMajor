import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { AssetKind, CustomizationAsset } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { publicUrl, removePublic, uploadPublic } from '@/lib/storage'
import { ACCEPTED_GRAPHIC_TYPES, readImageInfo } from '@/lib/imageQuality'
import { invalidate, useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Dropzone } from '@/components/ui/Dropzone'
import { Input, Select, Switch } from '@/components/ui/Form'
import { useUi } from '@/components/ui/Toast'

const KINDS: { value: AssetKind; label: string }[] = [
  { value: 'logo', label: 'Logo' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'pattern', label: 'Pattern all-over' },
  { value: 'graphic', label: 'Grafica generica' },
]

/** Libreria grafiche: i file originali NON vengono compressi perché destinati alla stampa. */
export default function AssetsPage() {
  useMeta({ title: 'Libreria grafiche', noindex: true })
  const { toast, confirm } = useUi()
  const { data, loading, setData, reload } = useQuery('admin:customization_assets', async () => {
    const { data: rows, error } = await supabase.from('customization_assets').select('*').order('sort_order').order('created_at', { ascending: false })
    if (error) throw error
    return rows as CustomizationAsset[]
  })
  const [uploading, setUploading] = useState(0)
  const [kind, setKind] = useState<AssetKind>('logo')

  const upload = async (files: File[]) => {
    setUploading(files.length)
    for (const f of files) {
      try {
        const info = await readImageInfo(f)
        const path = await uploadPublic(f, 'assets', info.mime, f.name)
        const { error } = await supabase.from('customization_assets').insert({
          kind, name: f.name.replace(/\.[^.]+$/, '').slice(0, 120), storage_path: path,
          width: info.isVector ? null : info.width, height: info.isVector ? null : info.height,
        })
        if (error) throw error
      } catch (e) {
        toast(`${f.name}: ${errorMessage(e)}`, 'error')
      } finally {
        setUploading((n) => n - 1)
      }
    }
    invalidate('assets:library')
    await reload()
  }

  const update = async (a: CustomizationAsset, p: Partial<CustomizationAsset>) => {
    setData((d) => (d ?? []).map((x) => (x.id === a.id ? { ...x, ...p } : x)))
    const { error } = await supabase.from('customization_assets').update(p).eq('id', a.id)
    if (error) toast(errorMessage(error), 'error')
    invalidate('assets:library')
  }

  const remove = async (a: CustomizationAsset) => {
    if (!(await confirm({ title: 'Eliminare la grafica?', message: 'Il file verrà rimosso. Gli ordini già effettuati conservano il riferimento al percorso, ma il file non sarà più scaricabile.', confirmLabel: 'Elimina', danger: true }))) return
    try {
      const { error } = await supabase.from('customization_assets').delete().eq('id', a.id)
      if (error) throw error
      await removePublic([a.storage_path])
      setData((d) => (d ?? []).filter((x) => x.id !== a.id))
      invalidate('assets:library')
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Libreria grafiche" description="Loghi, sponsor e pattern che i clienti possono scegliere nel configuratore. Carica file ad alta risoluzione (≥ 300 dpi) o vettoriali SVG." />
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <label className="block">
          <span className="text-sm font-medium">Tipo per i nuovi file</span>
          <Select className="mt-1.5" value={kind} onChange={(e) => setKind(e.target.value as AssetKind)}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
        </label>
        <Dropzone multiple accept={ACCEPTED_GRAPHIC_TYPES.join(',')} onFiles={upload} disabled={uploading > 0} label={uploading ? `Caricamento (${uploading})…` : 'Trascina qui le grafiche o selezionale'} hint="I file originali vengono conservati senza compressione" />
      </div>
      {loading && !data ? (
        <Skeleton className="h-48" />
      ) : data?.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {data.map((a) => (
            <li key={a.id} className="surface overflow-hidden">
              <div className="checker flex aspect-square items-center justify-center p-3">
                <img src={publicUrl(a.storage_path) ?? ''} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="space-y-2 p-3">
                <Input value={a.name} onChange={(e) => setData((d) => (d ?? []).map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)))} onBlur={(e) => void update(a, { name: e.target.value || a.name })} aria-label="Nome" className="h-9 text-sm" />
                <Select value={a.kind} onChange={(e) => void update(a, { kind: e.target.value as AssetKind })} aria-label="Tipo" className="h-9 text-sm">
                  {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </Select>
                <p className="text-2xs text-ink-500">{a.width ? `${a.width}×${a.height} px` : 'Vettoriale'}</p>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs"><Switch label="Attiva" checked={a.is_active} onChange={(v) => void update(a, { is_active: v })} />{a.is_active ? 'Attiva' : 'Nascosta'}</span>
                  <button type="button" onClick={() => void remove(a)} className="rounded-lg p-1.5 text-ink-400 hover:bg-danger-50 hover:text-danger-600" aria-label={`Elimina ${a.name}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nessuna grafica in libreria" description="Le grafiche caricate qui saranno selezionabili dai clienti nelle aree che lo consentono." />
      )}
    </div>
  )
}
