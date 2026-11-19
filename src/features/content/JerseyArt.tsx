import { getShape, toCanvas, type Pt } from '@/features/configurator/garment/shapes'

const W = 520
function pathFrom(pts: Pt[], close = true) {
  const s = getShape('tshirt')
  const h = W * ((s.bounds.maxY - s.bounds.minY) / (s.bounds.maxX - s.bounds.minX))
  return pts.map((p, i) => {
    const [x, y] = toCanvas(p, s.bounds, W, h)
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ') + (close ? ' Z' : '')
}

/** Illustrazione vettoriale leggera (stessa sagoma del configuratore) per l'hero. */
export function JerseyArt({ className }: { className?: string }) {
  const s = getShape('tshirt')
  const h = Math.round(W * ((s.bounds.maxY - s.bounds.minY) / (s.bounds.maxX - s.bounds.minX)))
  const back = pathFrom(s.back)
  const front = pathFrom(s.front)
  return (
    <svg viewBox={`-10 -10 ${W * 0.85 + 270} ${h * 0.85 + 110}`} className={className} role="img" aria-label="Maglie personalizzate con nome e numero">
      <defs>
        <linearGradient id="nm-shade" x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".18" />
          <stop offset=".5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".22" />
        </linearGradient>
        <clipPath id="nm-front"><path d={front} /></clipPath>
      </defs>
      {/* Retro: nome e numero */}
      <g transform="translate(250 0) scale(0.85)">
        <path d={back} fill="#F4F4F2" />
        <path d={back} fill="url(#nm-shade)" />
        {s.trims.back.map((t, i) => <path key={i} d={pathFrom(t, false)} fill="none" stroke="#C2A063" strokeWidth="14" strokeLinecap="round" />)}
        <text x={W / 2} y={h * 0.34} textAnchor="middle" fontFamily='"Archivo Variable", Archivo, sans-serif' fontWeight="800" fontSize="40" fill="#0E0E10" style={{ fontStretch: '125%' }}>
          MAJOR
        </text>
        <text x={W / 2} y={h * 0.74} textAnchor="middle" fontFamily='"Archivo Variable", Archivo, sans-serif' fontWeight="800" fontSize="190" fill="#0E0E10" style={{ fontStretch: '110%' }}>
          10
        </text>
      </g>
      {/* Fronte */}
      <g transform="translate(0 90) scale(0.85)">
        <path d={front} fill="#C2A063" />
        <g clipPath="url(#nm-front)">
          <path d={`M ${W * 0.62} -20 L ${W + 40} -20 L ${W + 40} ${h} L ${W * 0.2} ${h} Z`} fill="#B3925A" />
          <path d={`M ${W * 0.78} -20 L ${W * 0.86} -20 L ${W * 0.44} ${h} L ${W * 0.36} ${h} Z`} fill="#0E0E10" opacity=".92" />
        </g>
        <path d={front} fill="url(#nm-shade)" />
        {s.trims.front.map((t, i) => <path key={i} d={pathFrom(t, false)} fill="none" stroke="#0E0E10" strokeWidth="14" strokeLinecap="round" />)}
        <rect x={W * 0.6} y={h * 0.27} width={W * 0.11} height={W * 0.11} rx="10" fill="none" stroke="#0E0E10" strokeWidth="5" />
        <text x={W * 0.33} y={h * 0.5} textAnchor="middle" fontFamily='"Archivo Variable", Archivo, sans-serif' fontWeight="800" fontSize="92" fill="#0E0E10" style={{ fontStretch: '110%' }}>
          10
        </text>
      </g>
    </svg>
  )
}
