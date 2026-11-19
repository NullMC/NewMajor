import { useState } from 'react'
import { Copy, Replace, Trash2 } from 'lucide-react'
import type { MediaItem } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { formatBytes, formatDate } from '@/lib/format'
import { optimizeImage, publicUrl, removePublic, uploadPublic } from '@/lib/storage'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Dropzone } from '@/components/ui/Dropzone'
import { Input } from '@/components/ui/Form'
import { useUi } from '@/components/ui/Toast'

/** Libreria media del sito: immagini da usare nelle pagine (Markdown) e nei contenuti. */
export default function MediaPage() {
  useMeta({ title: 'Media', noindex: true })
  const { toast, confirm } = useUi()
  const { data, loading, setData, reload } = useQuery('admin:media', async () => {
    const { data: rows, error } = await supabase.from('media').select('*').order('created_at', { ascending: false }).limit(500)
    if (error) throw error
    return rows as MediaItem[]
  })
  const [busy, setBusy] = useState(0)

  const upload = async (files: File[]) => {
    setBusy(files.length)
    const { data: u } = await supabase.auth.getUser()
    for (const f of files) {
      try {
        const opt = await optimizeImage(f, 2400)
        const path = await uploadPublic(opt.blob, 'library', opt.mime, f.name)
        const { error } = await supabase.from('media').insert({
          bucket: 'public-media', path, mime_type: opt.mime, size_bytes: opt.blob.size, width: opt.width || null, height: opt.height || null,
          alt: f.name.replace(/\.[^.]+$/, '').slice(0, 200), uploaded_by: u.user?.id,
        })
        if (error) throw error
      } catch (e) {
        toast(`${f.name}: ${errorMessage(e)}`, 'error')
      } finally {
        setBusy((n) => n - 1)
      }
    }
    void reload()
  }

  const replace = async (m: MediaItem, f: File) => {
    try {
      const opt = await optimizeImage(f, 2400)
      const path = await uploadPublic(opt.blob, 'library', opt.mime, f.name)
      const { error } = await supabase.from('media').update({ path, mime_type: opt.mime, size_bytes: opt.blob.size, width: opt.width || null, height: opt.height || null }).eq('id', m.id)
      if (error) throw error
      await removePublic([m.path]).catch(() => undefined)
      toast('Immagine sostituita: aggiorna gli eventuali link nei contenuti')
      void reload()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const remove = async (m: MediaItem) => {
    if (!(await confirm({ title: 'Eliminare l’immagine?', message: 'Le pagine che la usano mostreranno un’immagine mancante.', confirmLabel: 'Elimina', danger: true }))) return
    try {
      const { error } = await supabase.from('media').delete().eq('id', m.id)
      if (error) throw error
      await removePublic([m.path])
      setData((d) => (d ?? []).filter((x) => x.id !== m.id))
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const saveAlt = async (m: MediaItem, alt: string) => {
    const { error } = await supabase.from('media').update({ alt: alt || null }).eq('id', m.id)
    if (error) toast(errorMessage(error), 'error')
  }

  const copy = (m: MediaItem) => {
    const md = `![${m.alt ?? ''}](${publicUrl(m.path)})`
    void navigator.clipboard?.writeText(md).then(() => toast('Codice Markdown copiato: incollalo nel contenuto della pagina'))
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Media" description="Immagini del sito, ottimizzate automaticamente. Copia il codice per inserirle nelle pagine." />
      <Dropzone multiple onFiles={upload} disabled={busy > 0} label={busy ? `Caricamento (${busy})…` : 'Trascina qui le immagini'} hint="JPG, PNG, WebP, SVG · convertite in WebP (max 2400 px)" />
      {loading && !data ? <Skeleton className="h-48" /> : data?.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {data.map((m) => (
            <li key={m.id} className="surface overflow-hidden">
              <div className="checker aspect-square"><img src={publicUrl(m.path) ?? ''} alt={m.alt ?? ''} loading="lazy" className="h-full w-full object-contain" /></div>
              <div className="space-y-2 p-3">
                <Input defaultValue={m.alt ?? ''} onBlur={(e) => void saveAlt(m, e.target.value)} placeholder="Testo alternativo" aria-label="Testo alternativo" className="h-9 text-sm" />
                <p className="text-2xs text-ink-500">{m.width ? `${m.width}×${m.height}` : ''}{m.size_bytes ? ` · ${formatBytes(m.size_bytes)}` : ''} · {formatDate(m.created_at)}</p>
                <div className="flex justify-end">
                  <button type="button" onClick={() => copy(m)} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Copia codice Markdown"><Copy className="h-4 w-4" /></button>
                  <label className="cursor-pointer rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Sostituisci"><Replace className="h-4 w-4" /><input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void replace(m, f); e.target.value = '' }} /></label>
                  <button type="button" onClick={() => void remove(m)} className="rounded-lg p-1.5 text-ink-500 hover:bg-danger-50 hover:text-danger-600" aria-label="Elimina"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : <EmptyState title="Nessuna immagine" />}
    </div>
  )
}
