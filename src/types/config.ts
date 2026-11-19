// Struttura della configurazione salvata in cart_items.configuration e order_items.configuration.
// Ogni chiave è letta anche dalle funzioni SQL (compute_unit_price, materialize_order_item):
// non rinominare senza aggiornare le migration.

export type AssetBucket = 'customer-uploads' | 'public-media'
export type AssetQuality = 'vector' | 'ok' | 'warn' | 'poor'

export interface AssetRef {
  bucket: AssetBucket
  /** Percorso nello storage (presente dopo l'upload). */
  path?: string
  /** Chiave IndexedDB per file caricati da ospite, in attesa di upload al login. */
  localKey?: string
  libraryAssetId?: string
  name: string
  mime: string
  width: number
  height: number
  sizeBytes: number
  isVector: boolean
  /** DPI effettivi alla dimensione di stampa dell'area. */
  effectiveDpi: number | null
  /** DPI dichiarati nei metadati del file (informativo). */
  metadataDpi: number | null
  quality: AssetQuality
  acknowledgedLowQuality?: boolean
}

export interface AreaConfig {
  enabled: boolean
  asset?: AssetRef | null
  /** Testo fisso (es. nome squadra) per aree di tipo text senza roster. */
  text?: string
  /** Scala dell'immagine nell'area (0.2 – 1). */
  scale?: number
}

export interface RosterEntry {
  id: string
  name?: string
  number?: string
  /** Taglia per prodotti semplici. */
  size?: string
  /** Taglie per componente kit: { kit_item_id: taglia }. */
  sizes?: Record<string, string>
  quantity: number
}

export interface TextStyle {
  color: string
  outline: string | null
  font: 'block' | 'classic'
}

export interface CustomArea {
  name: string
  type: 'logo' | 'sponsor' | 'text' | 'number' | 'all_over'
  side: 'front' | 'back'
  note?: string
  asset?: AssetRef | null
}

export interface Configuration {
  version: 1
  garmentTypeId?: string | null
  variantId?: string | null
  optionValueIds: string[]
  areas: Record<string, AreaConfig>
  roster: RosterEntry[]
  textStyle?: TextStyle
  /** Anteprime renderizzate (percorsi nel bucket customer-uploads). */
  preview?: { front?: string; back?: string }
  /** Ordini custom dell'admin senza prodotto a catalogo. */
  customAreas?: CustomArea[]
  customDescription?: string
  baseColor?: string
}

export const emptyConfiguration = (): Configuration => ({
  version: 1,
  garmentTypeId: null,
  variantId: null,
  optionValueIds: [],
  areas: {},
  roster: [],
  textStyle: { color: '#FFFFFF', outline: null, font: 'block' },
})
