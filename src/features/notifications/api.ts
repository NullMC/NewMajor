import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppNotification, NotificationType } from '@/types/db'
import { useAuth } from '@/features/auth/AuthProvider'

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  order_update: 'Aggiornamento ordine',
  status_change: 'Cambio stato',
  update_request: 'Richiesta aggiornamento',
  admin_message: 'Comunicazione',
  notice: 'Avviso',
  discount: 'Sconto',
  sale: 'Saldi',
  tip: 'Suggerimento',
  warning: 'Avvertenza',
  custom: 'Messaggio',
}

export async function listMyNotifications(limit = 100): Promise<AppNotification[]> {
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data as AppNotification[]
}

export async function markRead(ids: string[]) {
  if (!ids.length) return
  const { error } = await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).in('id', ids)
  if (error) throw error
  window.dispatchEvent(new Event('nm:notifications'))
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from('notifications').delete().eq('id', id)
  if (error) throw error
  window.dispatchEvent(new Event('nm:notifications'))
}

/** Contatore notifiche non lette (polling leggero + aggiornamento al focus). */
export function useUnreadCount() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  const refresh = useCallback(async () => {
    if (!user) return setCount(0)
    const { count: c } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
    setCount(c ?? 0)
  }, [user])
  useEffect(() => {
    void refresh()
    const t = setInterval(refresh, 60_000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    window.addEventListener('nm:notifications', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('nm:notifications', onFocus)
    }
  }, [refresh])
  return count
}
