import type { AddressInput } from '@/types/db'
import { Field, Input } from '@/components/ui/Form'

export function AddressFields({ value, onChange, withLabel }: { value: AddressInput; onChange: (v: AddressInput) => void; withLabel?: boolean }) {
  const set = (k: keyof AddressInput) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value })
  return (
    <div className="grid gap-4 sm:grid-cols-6">
      {withLabel && <Field label="Etichetta" hint="Es. Casa, Società sportiva" className="sm:col-span-6"><Input value={value.label ?? ''} onChange={set('label')} maxLength={60} /></Field>}
      <Field label="Nome e cognome" required className="sm:col-span-3"><Input value={value.full_name} onChange={set('full_name')} autoComplete="name" maxLength={120} /></Field>
      <Field label="Società / squadra" className="sm:col-span-3"><Input value={value.company ?? ''} onChange={set('company')} autoComplete="organization" maxLength={160} /></Field>
      <Field label="Indirizzo" required className="sm:col-span-4"><Input value={value.line1} onChange={set('line1')} autoComplete="address-line1" maxLength={200} /></Field>
      <Field label="Interno, scala…" className="sm:col-span-2"><Input value={value.line2 ?? ''} onChange={set('line2')} autoComplete="address-line2" maxLength={200} /></Field>
      <Field label="CAP" required className="sm:col-span-2"><Input value={value.postal_code} onChange={set('postal_code')} autoComplete="postal-code" inputMode="numeric" maxLength={16} /></Field>
      <Field label="Città" required className="sm:col-span-3"><Input value={value.city} onChange={set('city')} autoComplete="address-level2" maxLength={120} /></Field>
      <Field label="Prov." className="sm:col-span-1"><Input value={value.province ?? ''} onChange={set('province')} autoComplete="address-level1" maxLength={60} /></Field>
      <Field label="Paese" className="sm:col-span-3"><Input value={value.country} onChange={set('country')} autoComplete="country" maxLength={60} /></Field>
      <Field label="Telefono" className="sm:col-span-3"><Input type="tel" value={value.phone ?? ''} onChange={set('phone')} autoComplete="tel" maxLength={40} /></Field>
    </div>
  )
}
