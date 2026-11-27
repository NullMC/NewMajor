// Tecniche di stampa (serigrafia, DTF, ricamo, sublimazione) con i prezzi minimo e massimo
// impostati dal backoffice. Lette una volta e tenute in cache.

import { supabase } from '@/lib/supabase'
import { useQuery } from '@/hooks/useQuery'
import type { PrintTechnique } from '@/types/db'

export async function listTechniques(): Promise<PrintTechnique[]> {
  const { data, error } = await supabase.from('print_techniques').select('*').order('sort_order')
  if (error) throw error
  return (data as PrintTechnique[]).map((t) => ({ ...t, min_price: Number(t.min_price), max_price: Number(t.max_price) }))
}

export function useTechniques() {
  return useQuery('print-techniques', listTechniques, { staleMs: 5 * 60_000 }).data ?? []
}
