import { useEffect, useState, type FormEvent } from 'react'
import { useMeta } from '@/hooks/useMeta'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Display'
import { Field, FormError, Input } from '@/components/ui/Form'
import { useUi } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { updateProfile } from './api'

export default function ProfilePage() {
  const { profile, user, refreshProfile, updatePassword } = useAuth()
  const { toast } = useUi()
  const [form, setForm] = useState({ full_name: '', phone: '', company_name: '', vat_number: '', fiscal_code: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pwd, setPwd] = useState({ password: '', confirm: '' })
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdError, setPwdError] = useState<string | null>(null)
  useMeta({ title: 'Dati personali', noindex: true })

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? '', phone: profile.phone ?? '', company_name: profile.company_name ?? '',
        vat_number: profile.vat_number ?? '', fiscal_code: profile.fiscal_code ?? '',
      })
    }
  }, [profile])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setError(null)
    if (form.full_name.trim().length < 2) return setError('Inserisci nome e cognome.')
    setSaving(true)
    try {
      await updateProfile(user.id, {
        full_name: form.full_name.trim(), phone: form.phone.trim() || null, company_name: form.company_name.trim() || null,
        vat_number: form.vat_number.trim() || null, fiscal_code: form.fiscal_code.trim().toUpperCase() || null,
      })
      await refreshProfile()
      toast('Dati aggiornati')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const savePwd = async (e: FormEvent) => {
    e.preventDefault()
    setPwdError(null)
    if (pwd.password.length < 8) return setPwdError('La password deve contenere almeno 8 caratteri.')
    if (pwd.password !== pwd.confirm) return setPwdError('Le password non coincidono.')
    setPwdSaving(true)
    try {
      await updatePassword(pwd.password)
      setPwd({ password: '', confirm: '' })
      toast('Password aggiornata')
    } catch (err) {
      setPwdError(errorMessage(err))
    } finally {
      setPwdSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Dati personali" description={`Email account: ${profile?.email ?? user?.email ?? ''}`} />
        <form onSubmit={save} className="space-y-4 p-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome e cognome" required><Input value={form.full_name} onChange={set('full_name')} autoComplete="name" maxLength={120} /></Field>
            <Field label="Telefono"><Input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" maxLength={40} /></Field>
            <Field label="Società / squadra"><Input value={form.company_name} onChange={set('company_name')} maxLength={160} /></Field>
            <Field label="Partita IVA"><Input value={form.vat_number} onChange={set('vat_number')} maxLength={32} /></Field>
            <Field label="Codice fiscale"><Input value={form.fiscal_code} onChange={set('fiscal_code')} maxLength={32} /></Field>
          </div>
          <FormError message={error} />
          <Button type="submit" loading={saving}>Salva</Button>
        </form>
      </Card>
      <Card>
        <CardHeader title="Cambia password" />
        <form onSubmit={savePwd} className="space-y-4 p-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nuova password" hint="Almeno 8 caratteri"><Input type="password" autoComplete="new-password" value={pwd.password} onChange={(e) => setPwd({ ...pwd, password: e.target.value })} /></Field>
            <Field label="Conferma password"><Input type="password" autoComplete="new-password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} /></Field>
          </div>
          <FormError message={pwdError} />
          <Button type="submit" variant="secondary" loading={pwdSaving}>Aggiorna password</Button>
        </form>
      </Card>
    </div>
  )
}
