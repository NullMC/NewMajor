// Qualità di stampa: il numero dei DPI minimi è stampato "a retino" in due inchiostri
// (oro e bianco, fuori registro) e diventa nitido mentre si scorre. Accanto, un
// calcolatore che stima i DPI effettivi di un'immagine alla dimensione di stampa,
// con le stesse soglie usate dal configuratore. Il file non viene caricato.

import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Field, Input } from '@/components/ui/Form'
import { AccentTitle, Reveal } from '@/components/fx/Reveal'
import { Grain, ShaderBackdrop } from '@/components/fx/ShaderBackdrop'
import { useScrollProgress } from '@/components/fx/scroll'
import { QUALITY_LABEL, readImageInfo } from '@/lib/imageQuality'
import type { QualitySettings } from '@/types/db'

function HalftoneNumber({ value }: { value: number }) {
  const layer = (color: string, sign: number): CSSProperties => {
    const pitch = 'calc(15px - var(--p, 0) * 12.6px)'
    const dot = `radial-gradient(circle at center, #000 calc((15px - var(--p, 0) * 12.6px) * (0.34 + var(--p, 0) * 0.42)), transparent calc((15px - var(--p, 0) * 12.6px) * (0.34 + var(--p, 0) * 0.42) + 0.8px))`
    return {
      color,
      WebkitMaskImage: dot, maskImage: dot,
      WebkitMaskSize: `${pitch} ${pitch}`, maskSize: `${pitch} ${pitch}`,
      transform: `translate(calc(${sign} * (1 - var(--p, 0)) * 9px), calc(${-sign} * (1 - var(--p, 0)) * 6px))`,
    }
  }
  const text = (
    <span className="font-display text-[clamp(6rem,24vw,10rem)] font-extrabold leading-[.8] lg:text-[min(11.5vw,13rem)]" style={{ fontStretch: '118%' }}>{value}</span>
  )
  return (
    <div className="relative select-none" aria-label={`${value} dpi`} role="img">
      <div aria-hidden className="grid [&>*]:[grid-area:1/1]">
        <div style={layer('#C2A063', 1)} className="mix-blend-screen">{text}</div>
        <div style={layer('#F8F7F4', -1)} className="mix-blend-screen">{text}</div>
      </div>
      <span aria-hidden className="absolute -top-1 right-0 font-mono text-sm font-medium tracking-[.3em] text-gold-400 sm:text-base">DPI</span>
    </div>
  )
}

function DpiCalculator({ quality }: { quality: QualitySettings }) {
  const [px, setPx] = useState('')
  const [cm, setCm] = useState('')
  const [file, setFile] = useState<{ name: string; vector: boolean } | null>(null)
  const minDpi = quality.min_dpi || 300
  const warnDpi = quality.warn_dpi || 150

  const result = useMemo(() => {
    const w = Number(px), c = Number(cm.replace(',', '.'))
    if (file?.vector) return { kind: 'vector' as const }
    if (!(w > 0) || !(c > 0)) return null
    const dpi = Math.round(w / (c / 2.54))
    const kind = dpi >= minDpi ? 'ok' as const : dpi >= warnDpi ? 'warn' as const : 'poor' as const
    return { kind, dpi, needPx: Math.ceil((c / 2.54) * minDpi), maxCm: Math.round(((w / minDpi) * 2.54) * 10) / 10 }
  }, [px, cm, file, minDpi, warnDpi])

  const pick = async (f: File | undefined) => {
    if (!f) return
    try {
      const info = await readImageInfo(f)
      setFile({ name: f.name, vector: info.isVector })
      if (!info.isVector) setPx(String(info.width))
    } catch {
      setFile(null)
    }
  }

  return (
    <div className="glass glass-light rounded-[1.75rem] p-5 text-ink-900 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Larghezza dell’immagine (px)">
          <Input inputMode="numeric" value={px} onChange={(e) => { setPx(e.target.value.replace(/\D/g, '')); setFile(null) }} placeholder="es. 2400" className="font-mono" />
        </Field>
        <Field label="Larghezza di stampa (cm)">
          <Input inputMode="decimal" value={cm} onChange={(e) => setCm(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="es. 25" className="font-mono" />
        </Field>
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-600 hover:text-ink-900">
        <Upload className="h-4 w-4" aria-hidden />
        <span className="underline underline-offset-4">{file ? file.name : 'oppure scegli un file'}</span>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
      </label>

      <div className="mt-5 border-t border-ink-900/10 pt-5" aria-live="polite">
        {!result ? (
          <p className="text-sm text-ink-500">Inserisci le misure per stimare la risoluzione effettiva di stampa. Il file resta sul tuo dispositivo.</p>
        ) : result.kind === 'vector' ? (
          <p className="text-sm text-ink-700"><span className="font-semibold">{QUALITY_LABEL.vector}:</span> qualità di stampa ottimale a qualsiasi dimensione.</p>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-4xl font-semibold tabular-nums">{result.dpi}<span className="ml-1.5 text-base text-ink-500">dpi</span></p>
              <p className="mt-1 text-sm text-ink-600">
                {result.kind === 'ok'
                  ? `Puoi stampare fino a ${result.maxCm} cm a ${minDpi} dpi.`
                  : `Per ${cm} cm a ${minDpi} dpi servono almeno ${result.needPx} px.`}
              </p>
            </div>
            <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', {
              ok: 'bg-success-50 text-success-700', warn: 'bg-warning-50 text-warning-700', poor: 'bg-danger-50 text-danger-700',
            }[result.kind])}>
              {QUALITY_LABEL[result.kind]}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function QualityLab({ title, text, quality }: { title: string; text: string; quality: QualitySettings }) {
  const ref = useRef<HTMLDivElement>(null)
  useScrollProgress(ref, undefined, { start: 0.15, end: 0.55 })
  return (
    <section className="container pt-20 sm:pt-32">
      <Reveal className="overflow-hidden rounded-[2rem] bg-ink-950 text-white">
        <div ref={ref} data-surface="dark" className="relative grid gap-10 p-6 sm:p-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] lg:items-center lg:p-16">
          <ShaderBackdrop palette="deep" anchor={[0.55, 0.25]} />
          <Grain />
          <div className="relative">
            <h2 className="display-lg text-[clamp(1.5rem,6.6vw,3rem)] text-white"><AccentTitle text={title} accentClassName="text-gold-400" /></h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-ink-300">{text}</p>
            <div className="mt-8"><DpiCalculator quality={quality} /></div>
          </div>
          <div className="relative flex justify-center lg:justify-end"><HalftoneNumber value={quality.min_dpi || 300} /></div>
        </div>
      </Reveal>
    </section>
  )
}
