import { Link } from 'react-router-dom'
import { Phone, MapPin } from 'lucide-react'
import { useSettings } from '@/features/settings/SettingsProvider'
import { useQuery } from '@/hooks/useQuery'
import { listLegalPages } from '@/features/content/api'
import { NAV } from './SiteHeader'

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`

export function SiteFooter() {
  const { settings } = useSettings()
  const c = settings.company
  const { data: legal } = useQuery('pages:legal', listLegalPages, { staleMs: 10 * 60_000 })

  return (
    <footer className="mt-24 bg-ink-900 text-ink-300">
      <div className="container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4 lg:col-span-2">
          <div className="inline-flex items-center gap-3 rounded-xl bg-white px-3 py-2">
            <img src="/brand/logo.png" alt="" width={30} height={36} className="h-9 w-auto" />
            <span className="font-display text-sm font-extrabold uppercase text-ink-900" style={{ fontStretch: '120%' }}>New Major</span>
          </div>
          <p className="max-w-sm text-sm leading-6 text-ink-400">
            Personalizzazione e vendita di divise, abbigliamento e kit da gara sportivi.
          </p>
        </div>

        <div>
          <p className="label-caps text-ink-400">Navigazione</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {NAV.map((n) => (
              <li key={n.to}><Link to={n.to} className="hover:text-white">{n.label}</Link></li>
            ))}
            <li><Link to="/account" className="hover:text-white">Area personale</Link></li>
          </ul>
        </div>

        <div>
          <p className="label-caps text-ink-400">Contatti</p>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" aria-hidden />
              <span>
                {c.legal_address}
                {c.show_alt_address && c.alt_address && <span className="block text-ink-500">{c.alt_address}</span>}
              </span>
            </li>
            <li className="flex gap-2.5">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" aria-hidden />
              <span className="space-y-1">
                <a href={tel(c.phone)} className="block hover:text-white">{c.phone} <span className="text-ink-500">· Info e ordini</span></a>
                {c.phone_alt && <a href={tel(c.phone_alt)} className="block hover:text-white">{c.phone_alt}</a>}
              </span>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container flex flex-col gap-4 py-6 text-xs text-ink-500 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {c.name} · P. IVA {c.vat_number} · REA {c.rea}
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {(legal ?? []).map((p) => (
              <li key={p.slug}><Link to={`/${p.slug}`} className="hover:text-white">{p.title}</Link></li>
            ))}
            <li>
              <button type="button" className="hover:text-white" onClick={() => window.dispatchEvent(new Event('nm:cookie-open'))}>
                Preferenze cookie
              </button>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
