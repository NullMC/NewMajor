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

/** Tecniche di stampa (tabella print_techniques). La sublimazione è solo per i capi con all-over. */
export type TechniqueCode = 'screen' | 'dtf' | 'embroidery' | 'sublimation'

/**
 * Disposizione delle aree in una zona: libera (posizioni del cliente) oppure divisione in parti
 * uguali dello spazio disponibile (affiancate, una sotto l'altra, a griglia).
 */
export type ZoneLayout = 'free' | 'columns' | 'rows' | 'grid'

export interface CustomArea {
  name: string
  type: 'logo' | 'sponsor' | 'text' | 'number' | 'all_over'
  side: 'front' | 'back'
  note?: string
  asset?: AssetRef | null
  /** Articoli su misura dell'admin: tecnica, misure e posizione in cm (facoltativi). */
  technique?: TechniqueCode
  widthCm?: number
  heightCm?: number
  xCm?: number
  yCm?: number
  rotation?: number
  /** Area massima di riferimento in cm: il prezzo della tecnica va dal minimo al massimo in proporzione. */
  maxWidthCm?: number
  maxHeightCm?: number
  /** Prezzo della stampa calcolato (incluso nel prezzo unitario dell'articolo). */
  price?: number
}

/** Zone di stampa: davanti, dietro e maniche (per il pantaloncino davanti e dietro della vita). */
export type PrintZone = 'front' | 'back' | 'sleeve_left' | 'sleeve_right'

/** Sezioni del capo per l'all-over: zone più le gambe del pantaloncino. */
export type SectionKey = PrintZone | 'leg_left' | 'leg_right'

/**
 * Area di stampa posizionata dal cliente: una grafica o un testo. Il centro è in centimetri
 * rispetto al punto di riferimento del pezzo (centro collo per davanti/dietro, sommità della
 * manica, centro vita per il pantaloncino), con x verso destra e y verso il basso guardando il
 * capo dall'esterno. Vale 1:1 su ogni taglia.
 * Le versioni precedenti (kind logo/sponsor, senza tecnica né altezza) restano valide.
 */
export interface PlacedElement {
  id: string
  kind: 'logo' | 'sponsor' | 'graphic' | 'text'
  zone: PrintZone
  kitItemId?: string | null
  /** Grafica (assente per i testi). */
  asset?: AssetRef
  xCm: number
  yCm: number
  widthCm: number
  /** Altezza in cm (se assente: dalle proporzioni della grafica). */
  heightCm?: number
  /** Proporzioni della grafica bloccate durante il ridimensionamento (predefinito sì). */
  lockRatio?: boolean
  /** Rotazione in gradi, senso orario. */
  rotation: number
  technique?: TechniqueCode
  /** Testi. */
  text?: string
  font?: 'block' | 'classic'
  color?: string
}

/** Fascia su maniche (capi) o fondo gamba (pantaloncini): colore diverso o grafica stampata. */
export interface BandConfig {
  kitItemId?: string | null
  mode: 'color' | 'graphic'
  color?: string
  asset?: AssetRef | null
}

/**
 * Grafica all-over scelta dal cliente: copre l'intero capo (o il componente del kit). Le
 * sostituzioni usano una grafica diversa su singoli pezzi, i colori un colore pieno al posto
 * della grafica. Collo e polsini restano nel colore dei profili.
 */
export interface AllOverConfig {
  kitItemId?: string | null
  asset: AssetRef
  overrides?: Partial<Record<SectionKey, AssetRef>>
  colors?: Partial<Record<SectionKey, string>>
}

export interface Configuration {
  version: 1
  garmentTypeId?: string | null
  variantId?: string | null
  optionValueIds: string[]
  areas: Record<string, AreaConfig>
  /** Aree di stampa del cliente (grafiche e testi) nelle zone del prodotto. */
  elements?: PlacedElement[]
  /** Disposizione per zona: chiave "<componente o main>:<zona>". */
  printLayouts?: Record<string, ZoneLayout>
  /** Fasce su maniche o pantaloncino (una per capo o componente del kit). */
  bands?: BandConfig[]
  /** Grafica all-over (una per capo o per componente del kit), se il prodotto la consente. */
  allOver?: AllOverConfig[]
  roster: RosterEntry[]
  textStyle?: TextStyle
  /** Anteprime renderizzate (percorsi nel bucket customer-uploads). */
  preview?: { front?: string; back?: string; sleeveLeft?: string; sleeveRight?: string }
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
