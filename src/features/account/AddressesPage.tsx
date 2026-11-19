import { useState } from 'react'
import { MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import type { Address, AddressInput } from '@/types/db'
import { errorMessage } from '@/lib/errors'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, EmptyState, Skeleton } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { Checkbox, FormError } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useUi } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { AddressBlock } from '@/features/orders/components'
import { deleteAddress, emptyAddress, listAddresses, saveAddress, toSnapshot, validateAddress } from './api'
import { AddressFields } from './AddressForm'

export default function AddressesPage() {
  const { user } = useAuth()
  const { toast, confirm } = useUi()
  const { data, loading, reload } = useQuery(`addresses:${user?.id}`, listAddresses)
  const [editing, setEditing] = useState<{ id?: string; value: AddressInput } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useMeta({ title: 'Indirizzi', noindex: true })

  const save = async () => {
    if (!editing || !user) return
    const err = validateAddress(editing.value)
    if (err) return setError(err)
    setSaving(true)
    try {
      await saveAddress(user.id, editing.value, editing.id)
      await reload()
      setEditing(null)
      toast('Indirizzo salvato')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (a: Address) => {
    if (!(await confirm({ title: 'Eliminare l’indirizzo?', message: `${a.line1}, ${a.city}`, confirmLabel: 'Elimina', danger: true }))) return
    try {
      await deleteAddress(a.id)
      await reload()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const makeDefault = async (a: Address) => {
    if (!user) return
    try {
      await saveAddress(user.id, { ...a, is_default_shipping: true }, a.id)
      await reload()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Indirizzi di spedizione</h2>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setError(null); setEditing({ value: { ...emptyAddress(), is_default_shipping: !data?.length } }) }}>Aggiungi</Button>
      </div>
      {loading && !data ? (
        <Skeleton className="h-32" />
      ) : data?.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((a) => (
            <li key={a.id} className="surface flex flex-col p-5">
              <div className="mb-2 flex items-center gap-2">
                <p className="font-semibold">{a.label || 'Indirizzo'}</p>
                {a.is_default_shipping && <Badge tone="gold">Predefinito</Badge>}
              </div>
              <AddressBlock a={toSnapshot(a)} />
              <div className="mt-4 flex flex-wrap gap-1">
                <Button variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => { setError(null); setEditing({ id: a.id, value: { ...a } }) }}>Modifica</Button>
                {!a.is_default_shipping && <Button variant="ghost" size="sm" icon={<Star className="h-4 w-4" />} onClick={() => makeDefault(a)}>Predefinito</Button>}
                <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => remove(a)}>Elimina</Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<MapPin className="h-6 w-6" />} title="Nessun indirizzo salvato" description="Gli indirizzi salvati si potranno riutilizzare al checkout." />
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Modifica indirizzo' : 'Nuovo indirizzo'}
        size="lg"
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Annulla</Button><Button loading={saving} onClick={save}>Salva</Button></>}
      >
        {editing && (
          <div className="space-y-4">
            <AddressFields withLabel value={editing.value} onChange={(value) => setEditing({ ...editing, value })} />
            <Checkbox label="Indirizzo predefinito" checked={!!editing.value.is_default_shipping} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, is_default_shipping: e.target.checked } })} />
            <FormError message={error} />
          </div>
        )}
      </Modal>
    </div>
  )
}
