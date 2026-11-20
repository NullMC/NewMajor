import { blobStore } from '@/lib/idb'
import { signedUrl, uploadCustomerFile, publicUrl, UPLOADS_BUCKET } from '@/lib/storage'
import { uid } from '@/lib/slug'
import type { AssetRef, Configuration } from '@/types/config'

/** Anteprime in attesa di upload (utente ospite): chiavi IndexedDB. */
export interface PendingPreview { front?: string; back?: string }

/** Salva un file grafico: upload immediato se autenticato, altrimenti IndexedDB. */
export async function storeGraphic(file: Blob, userId: string | null): Promise<Pick<AssetRef, 'path' | 'localKey' | 'bucket'>> {
  if (userId) {
    const path = await uploadCustomerFile(userId, file, file.type, 'graphics')
    return { bucket: UPLOADS_BUCKET, path }
  }
  const key = `asset:${uid()}`
  await blobStore.set(key, file)
  return { bucket: UPLOADS_BUCKET, localKey: key }
}

const objectUrls = new Map<string, string>()

/** URL visualizzabile di un asset (locale, privato firmato o libreria pubblica). */
export async function assetDisplayUrl(asset: AssetRef): Promise<string | null> {
  if (asset.localKey) {
    const cached = objectUrls.get(asset.localKey)
    if (cached) return cached
    const blob = await blobStore.get(asset.localKey)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    objectUrls.set(asset.localKey, url)
    return url
  }
  if (!asset.path) return null
  if (asset.bucket === 'public-media') return publicUrl(asset.path)
  return signedUrl(asset.bucket, asset.path)
}

export async function previewDisplayUrl(ref: string | undefined): Promise<string | null> {
  if (!ref) return null
  if (ref.startsWith('preview:')) {
    const cached = objectUrls.get(ref)
    if (cached) return cached
    const blob = await blobStore.get(ref)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    objectUrls.set(ref, url)
    return url
  }
  return signedUrl(UPLOADS_BUCKET, ref)
}

/** Salva le anteprime (PNG fronte/retro) generate dal configuratore. */
export async function storePreviews(
  previews: { front?: Blob; back?: Blob },
  userId: string | null,
): Promise<{ preview?: Configuration['preview']; pending?: PendingPreview }> {
  if (userId) {
    const preview: NonNullable<Configuration['preview']> = {}
    for (const side of ['front', 'back'] as const) {
      const b = previews[side]
      if (b) preview[side] = await uploadCustomerFile(userId, b, 'image/png', 'previews')
    }
    return { preview }
  }
  const pending: PendingPreview = {}
  for (const side of ['front', 'back'] as const) {
    const b = previews[side]
    if (b) {
      const key = `preview:${uid()}`
      await blobStore.set(key, b)
      pending[side] = key
    }
  }
  return { pending }
}

/** Carica nello storage tutti i file locali di una configurazione (al login). */
export async function uploadPendingAssets(
  userId: string,
  config: Configuration,
  pending?: PendingPreview,
): Promise<Configuration> {
  const next: Configuration = { ...config, areas: { ...config.areas } }
  for (const [areaId, area] of Object.entries(config.areas)) {
    const asset = area.asset
    if (asset?.localKey && !asset.path) {
      const blob = await blobStore.get(asset.localKey)
      if (!blob) {
        next.areas[areaId] = { ...area, asset: null, enabled: false }
        continue
      }
      // I file locali vengono eliminati dal chiamante solo dopo il salvataggio della riga
      const path = await uploadCustomerFile(userId, blob, blob.type || asset.mime, 'graphics')
      next.areas[areaId] = { ...area, asset: { ...asset, path, localKey: undefined } }
    }
  }
  if (pending) {
    const preview: NonNullable<Configuration['preview']> = { ...(config.preview ?? {}) }
    for (const side of ['front', 'back'] as const) {
      const key = pending[side]
      if (!key) continue
      const blob = await blobStore.get(key)
      if (blob) {
        preview[side] = await uploadCustomerFile(userId, blob, 'image/png', 'previews')
      }
    }
    next.preview = preview
  }
  return next
}

/** true se la configurazione contiene ancora file non caricati. */
export const hasPendingAssets = (config: Configuration) =>
  Object.values(config.areas).some((a) => a.enabled && a.asset?.localKey && !a.asset.path)
