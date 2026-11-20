import { supabase } from './supabase'
import { uid } from './slug'

export const PUBLIC_BUCKET = 'public-media'
export const UPLOADS_BUCKET = 'customer-uploads'

/**
 * Limiti dei bucket: devono coincidere con supabase/migrations/20261119000004_storage.sql.
 * Verificati prima dell'upload per mostrare un messaggio chiaro invece dell'errore di Storage.
 */
const BUCKET_RULES: Record<string, { maxBytes: number; types: string[] }> = {
  [PUBLIC_BUCKET]: { maxBytes: 25 * 1024 * 1024, types: ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/svg+xml'] },
  [UPLOADS_BUCKET]: { maxBytes: 50 * 1024 * 1024, types: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] },
}
/** Formati accettati per le immagini del sito e del catalogo (attributo accept). */
export const SITE_IMAGE_ACCEPT = BUCKET_RULES[PUBLIC_BUCKET].types.join(',')

function assertUploadable(bucket: string, blob: Blob, mime: string) {
  const rule = BUCKET_RULES[bucket]
  if (!rule) return
  if (!rule.types.includes(mime)) throw new Error(`unsupported_file_type:${bucket === PUBLIC_BUCKET ? 'site' : 'graphic'}`)
  if (blob.size > rule.maxBytes) throw new Error(`file_too_large:${Math.round(rule.maxBytes / 1048576)}`)
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

export const extFor = (mime: string, fallbackName?: string) =>
  EXT_BY_MIME[mime] ?? fallbackName?.split('.').pop()?.toLowerCase() ?? 'bin'

/** URL pubblico di un file del bucket public-media. */
export function publicUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^https?:\/\//.test(path) || path.startsWith('/')) return path
  return supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl
}

/** Carica nel bucket pubblico (solo admin, garantito da RLS). Restituisce il path. */
export async function uploadPublic(file: Blob, folder: string, mime = file.type, name?: string): Promise<string> {
  assertUploadable(PUBLIC_BUCKET, file, mime)
  const path = `${folder.replace(/\/+$/, '')}/${uid()}.${extFor(mime, name)}`
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, file, {
    contentType: mime,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw error
  return path
}

/** Elimina file dal bucket pubblico. Ignora percorsi vuoti o esterni. */
export async function removePublic(paths: (string | null | undefined)[]): Promise<void> {
  const clean = paths.filter((p): p is string => !!p && !/^https?:\/\//.test(p) && !p.startsWith('/'))
  if (!clean.length) return
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).remove(clean)
  if (error) throw error
}

/** Carica un file del cliente nella sua cartella privata. */
export async function uploadCustomerFile(userId: string, file: Blob, mime = file.type, sub = ''): Promise<string> {
  assertUploadable(UPLOADS_BUCKET, file, mime)
  const path = `${userId}/${sub ? `${sub}/` : ''}${uid()}.${extFor(mime)}`
  const { error } = await supabase.storage.from(UPLOADS_BUCKET).upload(path, file, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw error
  return path
}

const signedCache = new Map<string, { url: string; exp: number }>()

/** URL firmato temporaneo per file privati (cliente proprietario o admin). */
export async function signedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string | null> {
  if (bucket === PUBLIC_BUCKET) return publicUrl(path)
  const key = `${bucket}/${path}`
  const hit = signedCache.get(key)
  if (hit && hit.exp > Date.now() + 60_000) return hit.url
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error || !data) return null
  signedCache.set(key, { url: data.signedUrl, exp: Date.now() + expiresIn * 1000 })
  return data.signedUrl
}

/** Link di download diretto del file originale (per la produzione). */
export async function downloadUrl(bucket: string, path: string): Promise<string | null> {
  if (bucket === PUBLIC_BUCKET) return publicUrl(path)
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600, { download: true })
  return data?.signedUrl ?? null
}

/**
 * Ottimizza un'immagine per il web (solo media del sito/catalogo, MAI per le grafiche di stampa):
 * ridimensiona al lato massimo indicato e converte in WebP.
 */
export async function optimizeImage(
  file: File,
  maxSide = 2000,
  quality = 0.86,
): Promise<{ blob: Blob; mime: string; width: number; height: number }> {
  if (file.type === 'image/svg+xml') {
    return { blob: file, mime: file.type, width: 0, height: 0 }
  }
  // Il file originale si conserva solo se il bucket ne accetta il formato; altrimenti (GIF, BMP…) si converte in WebP
  const keepOriginal = BUCKET_RULES[PUBLIC_BUCKET].types.includes(file.type)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('unsupported_file_type:site')
  }
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * ratio)
  const height = Math.round(bitmap.height * ratio)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    if (keepOriginal) return { blob: file, mime: file.type, width: bitmap.width, height: bitmap.height }
    throw new Error('unsupported_file_type:site')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', quality))
  if (!blob) {
    if (keepOriginal) return { blob: file, mime: file.type, width, height }
    throw new Error('unsupported_file_type:site')
  }
  if (keepOriginal && blob.size >= file.size && ratio === 1) {
    return { blob: file, mime: file.type, width, height }
  }
  return { blob, mime: 'image/webp', width, height }
}
