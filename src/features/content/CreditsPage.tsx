import { ExternalLink } from 'lucide-react'
import { useMeta } from '@/hooks/useMeta'

// Crediti dei modelli 3D usati dal configuratore (licenze che richiedono l'attribuzione).
// Tenere allineato con public/models/CREDITS.md.
const CC_BY = { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }

const MODELS = [
  { use: 'Maglia manica corta', title: 'shirt.glb (CLO)', author: 'Prashant Verma', url: 'https://github.com/prashant3285/garment', license: { label: 'MIT', url: 'https://opensource.org/license/mit' } },
  { use: 'Pantaloncino', title: 'man shorts', author: 'MalahovaVladislava', url: 'https://sketchfab.com/3d-models/man-shorts-9f872504291644d8b05c0b85702d019e', license: CC_BY },
  { use: 'Giacca tuta', title: 'Adidas Jacket', author: 'Won Woo Lee', url: 'https://sketchfab.com/3d-models/adidas-jacket-237d3ea13cba4b059e513557aae3cf74', license: CC_BY },
  { use: 'Pantalone tuta', title: 'Dillard, Darren Joggers', author: 'darrendillard1', url: 'https://sketchfab.com/3d-models/dillard-darren-joggers-1f6f7318f9364456b8d58c1eaf71762b', license: CC_BY },
  { use: 'Polo', title: 'T-shirt Polo Lengan Pendek', author: 'Ikal.Ichwan', url: 'https://sketchfab.com/3d-models/t-shirt-polo-lengan-pendek-74c33d16b31346f1a46a55c3ec8e8a78', license: CC_BY },
  { use: 'Maglia manica lunga', title: 'Dickies Long Sleeve Shirt', author: 'Kodie Russell', url: 'https://sketchfab.com/3d-models/dickies-long-sleeve-shirt-f6f27327fbaf423081ae9da8e5dc109e', license: CC_BY },
  { use: 'Piumino con cappuccio', title: 'men s black puffy jacket', author: 'funlab117', url: 'https://sketchfab.com/3d-models/men-s-black-puffy-jacket-587515ac17ad49db9541ff7c0c06affb', license: CC_BY },
  { use: 'Giubbotto con cappuccio', title: 'Hooded Jacket', author: 'ArtDevice', url: 'https://sketchfab.com/3d-models/hooded-jacket-562280813fa74612a89369d4b791e011', license: CC_BY },
  { use: 'Felpa con cappuccio', title: 'Hoodie', author: 'Virtual Pandora', url: 'https://sketchfab.com/3d-models/hoodie-97611a53e3b846f69e0655b210f72b2f', license: CC_BY },
]

export default function CreditsPage() {
  useMeta({ title: 'Crediti modelli 3D', description: 'Fonti e licenze dei modelli 3D usati nel configuratore.' })
  return (
    <div className="container max-w-3xl py-12 sm:py-16">
      <h1 className="display-lg text-4xl sm:text-5xl">Crediti modelli 3D</h1>
      <p className="mt-4 text-ink-600">
        L’anteprima 3D del configuratore usa questi modelli, distribuiti con licenze che ne consentono l’uso citando gli autori.
        Sono stati modificati: texture e materiali originali rimossi (la grafica viene applicata dal configuratore), geometria
        centrata, ridimensionata, semplificata e compressa. I nomi di marchi presenti nei titoli originali sono riportati solo per
        attribuzione: i modelli non contengono loghi.
      </p>
      <ul className="mt-8 divide-y divide-ink-200 rounded-2xl border border-ink-200 bg-white">
        {MODELS.map((m) => (
          <li key={m.url} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{m.use}</p>
              <a href={m.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-ink-900 underline-offset-4 hover:underline">
                {m.title} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
              <p className="text-sm text-ink-600">di {m.author}</p>
            </div>
            <a href={m.license.url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-mono text-sm text-ink-600 underline-offset-4 hover:text-ink-900 hover:underline">
              {m.license.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
