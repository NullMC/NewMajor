import { blobStore } from '@/lib/idb'
import { signedUrl, uploadCustomerFile, publicUrl, UPLOADS_BUCKET } from '@/lib/storage'
import { uid } from '@/lib/slug'
import type { AssetRef, Configuration } from '@/types/config'

/** Anteprime in attesa di upload (utente ospite): chiavi IndexedDB. */
export interface PendingPreview { front?: string; back?: string; sleeveLeft?: string; sleeveRight?: string }

/** Viste salvate con l'ordine: fronte, retro e, se presenti grafiche sulle maniche, le maniche. */
export const PREVIEW_VIEWS = ['front', 'back', 'sleeveLeft', 'sleeveRight'] as const

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
  previews: Partial<Record<(typeof PREVIEW_VIEWS)[number], Blob>>,
  userId: string | null,
): Promise<{ preview?: Configuration['preview']; pending?: PendingPreview }> {
  if (userId) {
    const preview: NonNullable<Configuration['preview']> = {}
    for (const side of PREVIEW_VIEWS) {
      const b = previews[side]
      if (b) preview[side] = await uploadCustomerFile(userId, b, 'image/png', 'previews')
    }
    return { preview }
  }
  const pending: PendingPreview = {}
  for (const side of PREVIEW_VIEWS) {
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
  // I file locali vengono eliminati dal chiamante solo dopo il salvataggio della riga.
  // Restituisce l'asset caricato, oppure null se il file locale non esiste più.
  const upload = async (asset: AssetRef): Promise<AssetRef | null> => {
    if (!asset.localKey || asset.path) return asset
    const blob = await blobStore.get(asset.localKey)
    if (!blob) return null
    const path = await uploadCustomerFile(userId, blob, blob.type || asset.mime, 'graphics')
    return { ...asset, path, localKey: undefined }
  }
  for (const [areaId, area] of Object.entries(config.areas)) {
    if (!area.asset) continue
    const asset = await upload(area.asset)
    next.areas[areaId] = asset ? { ...area, asset } : { ...area, asset: null, enabled: false }
  }
  // loghi e sponsor liberi: quelli il cui file locale è andato perso vengono tolti
  if (config.elements?.length) {
    const elements = []
    for (const e of config.elements) {
      const asset = await upload(e.asset)
      if (asset) elements.push({ ...e, asset })
    }
    next.elements = elements
  }
  // grafica all-over e sostituzioni per pezzo
  if (config.allOver?.length) {
    const allOver = []
    for (const ao of config.allOver) {
      const asset = await upload(ao.asset)
      if (!asset) continue
      const overrides: NonNullable<typeof ao.overrides> = {}
      for (const [zone, a] of Object.entries(ao.overrides ?? {})) {
        const up = a ? await upload(a) : null
        if (up) overrides[zone as keyof typeof overrides] = up
      }
      allOver.push({ ...ao, asset, overrides })
    }
    next.allOver = allOver
  }
  if (pending) {
    const preview: NonNullable<Configuration['preview']> = { ...(config.preview ?? {}) }
    for (const side of PREVIEW_VIEWS) {
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
  configAssets(config).some((a) => a.localKey && !a.path)

/** Tutti i file grafici di una configurazione: aree attive, loghi e sponsor liberi, all-over. */
export function configAssets(config: Configuration): AssetRef[] {
  const out: AssetRef[] = []
  for (const a of Object.values(config.areas)) if (a.enabled && a.asset) out.push(a.asset)
  for (const e of config.elements ?? []) out.push(e.asset)
  for (const ao of config.allOver ?? []) {
    out.push(ao.asset)
    for (const a of Object.values(ao.overrides ?? {})) if (a) out.push(a)
  }
  return out
}
