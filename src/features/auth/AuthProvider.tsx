import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { Profile } from '@/types/db'
import { normalizeUsername, usernameToEmail } from './username'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  isAdmin: boolean
  loading: boolean
  /** true quando il profilo dell'utente corrente è stato letto (con successo o meno) */
  profileReady: boolean
  /** true se la lettura del profilo è fallita (rete, profilo mancante) */
  profileError: boolean
  /** true se l'account è stato disattivato da un amministratore */
  disabled: boolean
  /** identifier: nome utente oppure email */
  signIn: (identifier: string, password: string) => Promise<void>
  signUp: (data: { username: string; email?: string; password: string; fullName: string; phone?: string }) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [disabled, setDisabled] = useState(false)
  // Utente per cui la lettura del profilo è terminata: finché non coincide con l'utente in sessione
  // ruolo e permessi non sono noti e le pagine protette restano in attesa.
  const [profileFor, setProfileFor] = useState<string | null>(null)
  const [profileError, setProfileError] = useState(false)
  const lastProfileLoad = useRef(0)

  const loadProfile = useCallback(async (userId: string | undefined) => {
    lastProfileLoad.current = Date.now()
    if (!userId) {
      setProfile(null)
      setProfileError(false)
      setProfileFor(null)
      return
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) {
      setProfileError(true)
      setProfileFor(userId)
      return
    }
    const p = data as Profile | null
    if (p && !p.is_active) {
      setDisabled(true)
      setProfile(null)
      setProfileFor(null)
      await supabase.auth.signOut()
      return
    }
    setProfile(p)
    setProfileError(!p)
    setProfileFor(userId)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let mounted = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      if (mounted) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'SIGNED_OUT') {
        // Evita chiamate a Supabase dentro il callback sincrono (deadlock noto del client)
        setTimeout(() => void loadProfile(s?.user.id), 0)
      }
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  // Ruolo e stato dell'account possono cambiare mentre la sessione è aperta (promozione, revoca,
  // disattivazione): il profilo viene riletto quando la scheda torna visibile.
  const sessionUserId = session?.user.id
  useEffect(() => {
    if (!sessionUserId) return
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastProfileLoad.current > 60_000) {
        void loadProfile(sessionUserId)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [sessionUserId, loadProfile])

  const signIn = useCallback(async (identifier: string, password: string) => {
    setDisabled(false)
    const id = identifier.trim()
    const byEmail = id.includes('@')
    const { error } = await supabase.auth.signInWithPassword({ email: byEmail ? id : usernameToEmail(id), password })
    if (error) {
      if (!byEmail && error.message === 'Invalid login credentials') throw new Error('username_login_failed')
      throw error
    }
  }, [])

  const signUp = useCallback<AuthContextValue['signUp']>(async ({ username, email, password, fullName, phone }) => {
    const name = normalizeUsername(username)
    const { data: available, error: availError } = await supabase.rpc('username_available', { p_username: name })
    if (availError) throw availError
    if (!available) throw new Error('username_taken')
    const realEmail = email?.trim()
    const { data, error } = await supabase.auth.signUp({
      // Senza email: indirizzo tecnico derivato dal nome utente (vedi ./username.ts)
      email: realEmail || usernameToEmail(name),
      password,
      options: {
        data: { username: name, full_name: fullName.trim(), phone: phone?.trim() || null },
        emailRedirectTo: `${window.location.origin}/accedi`,
      },
    })
    if (error) throw error
    return { needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reimposta-password`,
    })
    if (error) throw error
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }, [])

  const refreshProfile = useCallback(() => loadProfile(session?.user.id), [loadProfile, session?.user.id])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isAdmin: profile?.role === 'admin' && profile.is_active,
      loading,
      profileReady: !session?.user || profileFor === session.user.id,
      profileError,
      disabled,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updatePassword,
      refreshProfile,
    }),
    [session, profile, profileFor, profileError, loading, disabled, signIn, signUp, signOut, sendPasswordReset, updatePassword, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider')
  return ctx
}
