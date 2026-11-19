import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import type { Profile } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import { useDebounce } from '@/hooks/useDebounce'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Form'
import { DataTable } from '@/components/ui/Table'

export default function UsersPage() {
  useMeta({ title: 'Utenti', noindex: true })
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const search = useDebounce(q.trim(), 300)
  const [role, setRole] = useState('')
  const [limit, setLimit] = useState(50)
  const { data, loading } = useQuery(`admin:users:${search}:${role}:${limit}`, async () => {
    let query = supabase.from('profiles').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(limit)
    if (role) query = query.eq('role', role)
    if (search) {
      const s = search.replace(/[,()%*\\]/g, ' ')
      query = query.or(`username.ilike.%${s}%,email.ilike.%${s}%,full_name.ilike.%${s}%,phone.ilike.%${s}%,company_name.ilike.%${s}%`)
    }
    const { data: rows, error, count } = await query
    if (error) throw error
    return { rows: rows as Profile[], count: count ?? 0 }
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Utenti" description={data ? `${data.count} utenti` : undefined} />
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome, email, telefono, società" className="pl-10" aria-label="Cerca utenti" />
        </div>
        <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Ruolo">
          <option value="">Tutti i ruoli</option>
          <option value="customer">Clienti</option>
          <option value="admin">Amministratori</option>
        </Select>
      </div>
      {loading && !data ? <Skeleton className="h-64" /> : (
        <DataTable
          caption="Utenti"
          rows={data?.rows ?? []}
          rowKey={(u) => u.id}
          onRowClick={(u) => navigate(`/admin/utenti/${u.id}`)}
          empty={<EmptyState title="Nessun utente" />}
          columns={[
            { key: 'name', header: 'Utente', cell: (u) => <div className="min-w-0"><p className="truncate font-medium">{u.full_name ?? '—'}</p><p className="truncate text-xs text-ink-500">{[u.username && `@${u.username}`, u.email].filter(Boolean).join(' · ')}</p></div> },
            { key: 'phone', header: 'Telefono', hideBelow: 'md', cell: (u) => u.phone ?? '—' },
            { key: 'company', header: 'Società', hideBelow: 'lg', cell: (u) => u.company_name ?? '—' },
            { key: 'created', header: 'Registrato', hideBelow: 'sm', cell: (u) => formatDate(u.created_at) },
            { key: 'role', header: 'Ruolo', cell: (u) => <span className="flex gap-1">{u.role === 'admin' ? <Badge tone="dark">Admin</Badge> : <Badge>Cliente</Badge>}{!u.is_active && <Badge tone="danger">Disattivato</Badge>}</span> },
          ]}
        />
      )}
      {data && data.count > data.rows.length && <div className="flex justify-center"><Button variant="secondary" onClick={() => setLimit((l) => l + 50)}>Carica altri</Button></div>}
    </div>
  )
}
