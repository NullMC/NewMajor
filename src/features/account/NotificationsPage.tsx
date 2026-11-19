import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck, Trash2 } from 'lucide-react'
import type { AppNotification, NotificationType } from '@/types/db'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/errors'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, EmptyState, Skeleton } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { useUi } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { deleteNotification, listMyNotifications, markRead, NOTIFICATION_TYPE_LABEL } from '@/features/notifications/api'

const TONE: Partial<Record<NotificationType, 'gold' | 'success' | 'warning' | 'danger' | 'dark' | 'neutral'>> = {
  status_change: 'gold', order_update: 'gold', discount: 'success', sale: 'success', warning: 'danger', notice: 'warning', admin_message: 'dark',
}

export function NotificationList({ items, onRead, onDelete }: {
  items: AppNotification[]; onRead: (id: string) => void; onDelete: (id: string) => void
}) {
  const { toast } = useUi()
  const open = async (n: AppNotification) => {
    if (!n.is_read) {
      onRead(n.id)
      await markRead([n.id]).catch(() => undefined)
    }
  }
  const remove = async (n: AppNotification) => {
    try {
      await deleteNotification(n.id)
      onDelete(n.id)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }
  return (
    <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white">
      {items.map((n) => {
        const body = (
          <>
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-gold-500')} aria-label={n.is_read ? undefined : 'Non letta'} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className={cn('text-sm', n.is_read ? 'font-medium' : 'font-semibold')}>{n.title}</span>
                <Badge tone={TONE[n.type] ?? 'neutral'}>{NOTIFICATION_TYPE_LABEL[n.type]}</Badge>
              </span>
              <span className="mt-1 block whitespace-pre-line text-sm text-ink-600">{n.message}</span>
              <span className="mt-1 block text-xs text-ink-400">{formatDateTime(n.created_at)}</span>
            </span>
          </>
        )
        return (
          <li key={n.id} className={cn('flex items-start gap-2 pr-2', !n.is_read && 'bg-gold-100/30')}>
            {n.link ? (
              <Link to={n.link} onClick={() => void open(n)} className="flex min-w-0 flex-1 items-start gap-3 p-4 hover:bg-ink-50">{body}</Link>
            ) : (
              <button type="button" onClick={() => void open(n)} className="flex min-w-0 flex-1 items-start gap-3 p-4 text-left hover:bg-ink-50">{body}</button>
            )}
            <button type="button" onClick={() => void remove(n)} className="mt-3 rounded-lg p-2 text-ink-400 hover:bg-danger-50 hover:text-danger-600" aria-label={`Elimina notifica ${n.title}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const { data, loading, setData } = useQuery(`notifications:all:${user?.id}`, () => listMyNotifications(200))
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  useMeta({ title: 'Notifiche', noindex: true })
  useEffect(() => { window.dispatchEvent(new Event('nm:notifications')) }, [data])

  const items = useMemo(() => (data ?? []).filter((n) => tab === 'all' || !n.is_read), [data, tab])
  const unread = (data ?? []).filter((n) => !n.is_read)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs ariaLabel="Filtro notifiche" value={tab} onChange={setTab} items={[{ value: 'all', label: 'Tutte', count: data?.length }, { value: 'unread', label: 'Da leggere', count: unread.length }]} />
        <Button
          variant="ghost"
          size="sm"
          disabled={!unread.length}
          icon={<CheckCheck className="h-4 w-4" />}
          onClick={async () => {
            await markRead(unread.map((n) => n.id))
            setData((d) => (d ?? []).map((n) => ({ ...n, is_read: true })))
          }}
        >
          Segna tutte come lette
        </Button>
      </div>
      {loading && !data ? (
        <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : items.length ? (
        <NotificationList
          items={items}
          onRead={(id) => setData((d) => (d ?? []).map((n) => (n.id === id ? { ...n, is_read: true } : n)))}
          onDelete={(id) => setData((d) => (d ?? []).filter((n) => n.id !== id))}
        />
      ) : (
        <EmptyState icon={<Bell className="h-6 w-6" />} title={tab === 'unread' ? 'Nessuna notifica da leggere' : 'Nessuna notifica'} />
      )}
    </div>
  )
}
