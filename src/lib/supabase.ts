import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
// Chiave pubblica: "publishable" (sb_publishable_…, formato attuale) o "anon" (formato legacy).
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

/** false quando le variabili d'ambiente non sono state configurate (vedi .env.example). */
export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT'))

// Il client usa SOLO la chiave anon pubblica: i permessi sono garantiti dalle policy RLS.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
