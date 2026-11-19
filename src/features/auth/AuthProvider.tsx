import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { Profile } from '@/types/db'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  isAdmin: boolean
  loading: boolean
  /** true se l'account è stato disattivato da un amministratore */
  disabled: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (data: { email: string; password: string; fullName: string; phone?: string }) => Promise<{ needsConfirmation: boolean }>
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

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    const p = data as Profile | null
    if (p && !p.is_active) {
      setDisabled(true)
      setProfile(null)
      await supabase.auth.signOut()
      return
    }
    setProfile(p)
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

  const signIn = useCallback(async (email: string, password: string) => {
    setDisabled(false)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
  }, [])

  const signUp = useCallback<AuthContextValue['signUp']>(async ({ email, password, fullName, phone }) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim(), phone: phone?.trim() || null },
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
      disabled,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updatePassword,
      refreshProfile,
    }),
    [session, profile, loading, disabled, signIn, signUp, signOut, sendPasswordReset, updatePassword, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider')
  return ctx
}
