import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@/hooks/useQuery'
import { DEFAULT_QUALITY } from '@/lib/imageQuality'
import type { SettingsMap } from '@/types/db'

// Dati aziendali forniti dal committente: usati anche come fallback se il DB non risponde.
export const DEFAULT_SETTINGS: SettingsMap = {
  company: {
    name: 'New Major',
    legal_address: 'Strada del Carro, 6 – 76011 Bisceglie (BT)',
    alt_address: 'Via Vienna, 6 – Bisceglie (BT)',
    show_alt_address: false,
    vat_number: '08270870721',
    rea: '616172',
    phone: '080 3956180',
    phone_alt: '+39 375 647 4412',
  },
  bank_transfer: { account_holder: '', iban: '', bank_name: '', bic: '', instructions: '' },
  payments: { cash_on_delivery: { enabled: true }, bank_transfer: { enabled: true } },
  shipping: { mode: 'quote', amount: null, free_over: null, note: '' },
  catalog: { filters: [] },
  quality: DEFAULT_QUALITY,
  cookie: {
    text: 'Questo sito utilizza esclusivamente cookie e archiviazione locale tecnici, necessari al funzionamento del servizio.',
    policy_link: '/cookie-policy',
  },
}

interface SettingsContextValue {
  settings: SettingsMap
  loading: boolean
  reload: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export const fetchPublicSettings = async (): Promise<Partial<SettingsMap>> => {
  const { data, error } = await supabase.from('settings').select('key,value').eq('is_public', true)
  if (error) throw error
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Partial<SettingsMap>
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { data, loading, reload } = useQuery('settings:public', fetchPublicSettings, { staleMs: 5 * 60_000 })
  const settings = useMemo<SettingsMap>(() => {
    const merged = { ...DEFAULT_SETTINGS } as SettingsMap
    for (const [k, v] of Object.entries(data ?? {})) {
      const key = k as keyof SettingsMap
      ;(merged as unknown as Record<string, unknown>)[key] = { ...(DEFAULT_SETTINGS[key] as object), ...(v as object) }
    }
    return merged
  }, [data])
  return <SettingsContext.Provider value={{ settings, loading, reload }}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings deve essere usato dentro SettingsProvider')
  return ctx
}
