// Disposizione dei pezzi sulla larghezza del rotolo: file orizzontali (shelf packing) con
// i pezzi più alti per primi, distanza minima tra i pezzi e pagine di lunghezza massima.
// I pezzi non vengono ruotati di 90° per rispettare il drittofilo.

export interface LayoutItem { id: string; w: number; h: number }
export interface Placed { id: string; x: number; y: number; w: number; h: number; page: number }
export interface Layout { placed: Placed[]; pages: { length: number }[]; tooWide: string[] }

/**
 * @param width  larghezza utile del rotolo (mm)
 * @param gap    distanza tra i pezzi e dai bordi (mm)
 * @param maxLength lunghezza massima di una pagina (mm)
 * y cresce verso il basso (dall'inizio del rotolo).
 */
export function layoutPieces(items: LayoutItem[], width: number, gap: number, maxLength: number): Layout {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w)
  const placed: Placed[] = []
  const tooWide: string[] = []
  const pages: { length: number }[] = [{ length: 0 }]
  let page = 0, x = gap, y = gap, rowH = 0
  for (const it of sorted) {
    if (it.w + gap * 2 > width || it.h + gap * 2 > maxLength) { tooWide.push(it.id); continue }
    if (x + it.w + gap > width) { x = gap; y += rowH + gap; rowH = 0 }
    if (y + it.h + gap > maxLength) {
      pages[page].length = Math.max(pages[page].length, y)
      page++
      pages.push({ length: 0 })
      x = gap; y = gap; rowH = 0
    }
    placed.push({ id: it.id, x, y, w: it.w, h: it.h, page })
    x += it.w + gap
    rowH = Math.max(rowH, it.h)
    pages[page].length = Math.max(pages[page].length, y + it.h + gap)
  }
  if (!placed.some((p) => p.page === page) && page > 0) pages.pop()
  return { placed, pages, tooWide }
}
