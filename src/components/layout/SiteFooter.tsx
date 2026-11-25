import { Link } from 'react-router-dom'
import { Phone, MapPin } from 'lucide-react'
import { useSettings } from '@/features/settings/SettingsProvider'
import { useQuery } from '@/hooks/useQuery'
import { listLegalPages } from '@/features/content/api'
import { NAV } from './SiteHeader'
import { useAuth } from '@/features/auth/AuthProvider'
import { Grain } from '@/components/fx/ShaderBackdrop'
import { StretchWordmark } from '@/components/fx/StretchWordmark'

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`

export function SiteFooter() {
  const { settings } = useSettings()
  const { isAdmin } = useAuth()
  const c = settings.company
  const { data: legal } = useQuery('pages:legal', listLegalPages, { staleMs: 10 * 60_000 })

  return (
    <footer data-surface="dark" className="relative mx-2 mb-2 mt-20 overflow-hidden rounded-[2rem] bg-ink-950 text-ink-300 sm:mx-3 sm:mb-3 sm:mt-28 lg:mt-32 sm:rounded-[2.5rem]">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[60rem] max-w-full -translate-x-1/2 rounded-full bg-gold-500/10 blur-3xl" />
      <Grain />
      <div className="container relative grid gap-10 py-12 sm:grid-cols-2 sm:py-16 lg:grid-cols-4">
        <div className="space-y-4 lg:col-span-2">
          <div className="inline-flex items-center gap-3 rounded-full bg-white py-1.5 pl-2 pr-4">
            <img src="/brand/logo.png" alt="" width={30} height={36} className="h-9 w-auto" />
            <span className="font-display text-sm font-extrabold uppercase text-ink-900" style={{ fontStretch: '120%' }}>New Major</span>
          </div>
          <p className="max-w-sm font-serif text-2xl italic leading-8 text-ink-200">
            Personalizzazione e vendita di divise, abbigliamento e kit da gara sportivi.
          </p>
        </div>

        <div>
          <p className="label-caps text-ink-400">Navigazione</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {NAV.map((n) => (
              <li key={n.to}><Link to={n.to} className="hover:text-white">{n.label}</Link></li>
            ))}
            <li>{isAdmin ? <Link to="/admin" className="hover:text-white">Backoffice</Link> : <Link to="/account" className="hover:text-white">Area personale</Link>}</li>
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
      {/* Marchio a tutta larghezza: le lettere si allargano verso il puntatore */}
      <div className="relative px-3 pb-2 sm:px-6">
        <StretchWordmark
          text="New Major"
          className="text-[15vw]"
          letterClassName="bg-gradient-to-b from-ink-200 via-ink-500 to-ink-900 bg-clip-text pb-[.04em] text-transparent"
        />
      </div>
      <div className="relative border-t border-white/10">
        <div className="container flex flex-col gap-4 py-6 text-xs text-ink-500 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1.5">
            <p className="font-mono">© {new Date().getFullYear()} {c.name} · P. IVA {c.vat_number} · REA {c.rea}</p>
            <p>
              made with <span role="img" aria-label="amore">❤️</span> by{' '}
              <a href="https://franksitez.com/" target="_blank" rel="noopener noreferrer" className="font-semibold text-ink-300 underline-offset-4 hover:text-gold-400 hover:underline">FrankSitez</a>
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {(legal ?? []).map((p) => (
              <li key={p.slug}><Link to={`/${p.slug}`} className="hover:text-white">{p.title}</Link></li>
            ))}
            <li><Link to="/crediti" className="hover:text-white">Crediti modelli 3D</Link></li>
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
