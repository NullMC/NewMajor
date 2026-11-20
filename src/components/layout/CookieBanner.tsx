import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSettings } from '@/features/settings/SettingsProvider'
import { Button } from '@/components/ui/Button'
import { LiquidGlass } from '@/components/fx/LiquidGlass'

const KEY = 'nm.cookie-consent.v1'
const MAX_AGE = 1000 * 60 * 60 * 24 * 365

export type ConsentValue = 'necessary' | 'all'

export function readConsent(): ConsentValue | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { value: ConsentValue; at: number }
    return Date.now() - v.at > MAX_AGE ? null : v.value
  } catch {
    return null
  }
}

/**
 * Banner informativo sui cookie. La piattaforma usa solo strumenti tecnici:
 * la scelta viene memorizzata ed è pronta per gestire eventuali categorie opzionali future.
 */
export function CookieBanner() {
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(readConsent() === null)
    const reopen = () => setOpen(true)
    window.addEventListener('nm:cookie-open', reopen)
    return () => window.removeEventListener('nm:cookie-open', reopen)
  }, [])

  const save = (value: ConsentValue) => {
    try { localStorage.setItem(KEY, JSON.stringify({ value, at: Date.now() })) } catch { /* ignorato */ }
    setOpen(false)
  }

  if (!open) return null
  return (
    <div role="dialog" aria-label="Informativa cookie" className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
      <LiquidGlass tone="light" className="mx-auto flex max-w-3xl animate-slide-up flex-col gap-4 rounded-[1.75rem] p-5 sm:flex-row sm:items-center sm:rounded-full sm:py-3 sm:pl-7 sm:pr-3">
        <p className="flex-1 text-sm leading-6 text-ink-600">
          {settings.cookie.text}{' '}
          <Link to={settings.cookie.policy_link || '/cookie-policy'} className="font-medium text-ink-900 underline underline-offset-4">
            Cookie policy
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" className="rounded-full" onClick={() => save('necessary')}>Solo necessari</Button>
          <Button size="sm" className="rounded-full" onClick={() => save('all')}>Accetta</Button>
        </div>
      </LiquidGlass>
    </div>
  )
}
