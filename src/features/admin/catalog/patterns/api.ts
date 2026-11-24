// Accesso ai cartamodelli (solo admin, garantito da RLS) e ai file sorgente nel bucket privato.

import { supabase } from '@/lib/supabase'
import type { PieceKind, Vec } from '@/lib/patterns/geometry'
import type { SourceUnit } from '@/lib/patterns/dxf'

export const PATTERNS_BUCKET = 'patterns'

export interface PatternSet {
  id: string
  product_id: string
  kit_item_id: string | null
  garment_type_id: string | null
  name: string
  reference_size: string | null
  source_path: string | null
  source_name: string | null
  source_unit: SourceUnit
  notes: string | null
}

export interface PatternPiece {
  id: string
  pattern_set_id: string
  size: string
  piece: PieceKind
  name: string
  quantity: number
  outline: Vec[]
  anchor: { x?: number; y?: number }
  mirror: boolean
  grain_angle: number
  sort_order: number
}

export type NewPiece = Omit<PatternPiece, 'id' | 'pattern_set_id'>

export async function listPatternSets(productId: string) {
  const { data, error } = await supabase.from('pattern_sets').select('*').eq('product_id', productId).order('created_at')
  if (error) throw error
  return data as PatternSet[]
}

export async function listPieces(setId: string) {
  const { data, error } = await supabase.from('pattern_pieces').select('*').eq('pattern_set_id', setId).order('size').order('sort_order')
  if (error) throw error
  return data as PatternPiece[]
}

export async function createSet(input: Pick<PatternSet, 'product_id' | 'kit_item_id' | 'garment_type_id' | 'name'>) {
  const { data, error } = await supabase.from('pattern_sets').insert(input).select('*').single()
  if (error) throw error
  return data as PatternSet
}

export async function updateSet(id: string, patch: Partial<PatternSet>) {
  const { error } = await supabase.from('pattern_sets').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteSet(set: PatternSet) {
  const { error } = await supabase.from('pattern_sets').delete().eq('id', set.id)
  if (error) throw error
  if (set.source_path) await supabase.storage.from(PATTERNS_BUCKET).remove([set.source_path])
}

/** Inserisce i pezzi importati; con `replaceSizes` elimina prima i pezzi esistenti di quelle taglie. */
export async function insertPieces(setId: string, pieces: NewPiece[], replaceSizes: string[] = []) {
  if (replaceSizes.length) {
    const { error } = await supabase.from('pattern_pieces').delete().eq('pattern_set_id', setId).in('size', replaceSizes)
    if (error) throw error
  }
  if (!pieces.length) return
  const { error } = await supabase.from('pattern_pieces').insert(pieces.map((p) => ({ ...p, pattern_set_id: setId })))
  if (error) throw error
}

export async function updatePiece(id: string, patch: Partial<PatternPiece>) {
  const { error } = await supabase.from('pattern_pieces').update(patch).eq('id', id)
  if (error) throw error
}

export async function deletePiece(id: string) {
  const { error } = await supabase.from('pattern_pieces').delete().eq('id', id)
  if (error) throw error
}

/** Salva il file CAD originale (privato) e restituisce il percorso. */
export async function uploadSource(productId: string, file: File) {
  const ext = file.name.toLowerCase().endsWith('.svg') ? 'svg' : 'dxf'
  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80)
  const path = `${productId}/${Date.now()}-${safe}`
  const { error } = await supabase.storage.from(PATTERNS_BUCKET).upload(path, file, {
    contentType: ext === 'svg' ? 'image/svg+xml' : 'application/dxf',
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function sourceDownloadUrl(path: string, name?: string | null) {
  const { data, error } = await supabase.storage.from(PATTERNS_BUCKET).createSignedUrl(path, 300, { download: name ?? true })
  if (error) throw error
  return data.signedUrl
}
