import { supabase } from '@/lib/supabase'
import type { Address, AddressInput, AddressSnapshot, Profile } from '@/types/db'

export async function listAddresses(): Promise<Address[]> {
  const { data, error } = await supabase.from('addresses').select('*').order('is_default_shipping', { ascending: false }).order('created_at')
  if (error) throw error
  return data as Address[]
}

export async function saveAddress(userId: string, input: AddressInput, id?: string): Promise<Address> {
  const payload = {
    user_id: userId,
    label: input.label?.trim() || null,
    full_name: input.full_name.trim(),
    company: input.company?.trim() || null,
    line1: input.line1.trim(),
    line2: input.line2?.trim() || null,
    city: input.city.trim(),
    province: input.province?.trim() || null,
    postal_code: input.postal_code.trim(),
    country: input.country.trim() || 'IT',
    phone: input.phone?.trim() || null,
    is_default_shipping: !!input.is_default_shipping,
    is_default_billing: !!input.is_default_billing,
  }
  if (payload.is_default_shipping) {
    await supabase.from('addresses').update({ is_default_shipping: false }).eq('user_id', userId).neq('id', id ?? '00000000-0000-0000-0000-000000000000')
  }
  const q = id ? supabase.from('addresses').update(payload).eq('id', id) : supabase.from('addresses').insert(payload)
  const { data, error } = await q.select('*').single()
  if (error) throw error
  return data as Address
}

export async function deleteAddress(id: string) {
  const { error } = await supabase.from('addresses').delete().eq('id', id)
  if (error) throw error
}

export async function updateProfile(id: string, p: Partial<Pick<Profile, 'full_name' | 'email' | 'phone' | 'company_name' | 'vat_number' | 'fiscal_code'>>) {
  const { error } = await supabase.from('profiles').update(p).eq('id', id)
  if (error) throw error
}

export const emptyAddress = (): AddressInput => ({
  label: '', full_name: '', company: '', line1: '', line2: '', city: '', province: '', postal_code: '', country: 'IT', phone: '',
})

export const toSnapshot = (a: AddressInput | Address): AddressSnapshot => ({
  full_name: a.full_name.trim(),
  company: a.company?.trim() || null,
  line1: a.line1.trim(),
  line2: a.line2?.trim() || null,
  city: a.city.trim(),
  province: a.province?.trim() || null,
  postal_code: a.postal_code.trim(),
  country: a.country.trim() || 'IT',
  phone: a.phone?.trim() || null,
})

export function validateAddress(a: AddressInput): string | null {
  if (!a.full_name.trim()) return 'Inserisci nome e cognome del destinatario.'
  if (!a.line1.trim()) return 'Inserisci l’indirizzo.'
  if (!a.city.trim()) return 'Inserisci la città.'
  if (!a.postal_code.trim()) return 'Inserisci il CAP.'
  if (a.country.trim().toUpperCase() === 'IT' && !/^\d{5}$/.test(a.postal_code.trim())) return 'Il CAP deve essere di 5 cifre.'
  return null
}
