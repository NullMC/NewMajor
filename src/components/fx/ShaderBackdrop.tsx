// Sfondo animato in GLSL (WebGL puro, senza three.js): fbm con domain warping,
// bagliore fisso, fasci di luce diagonali e vignettatura.
// Renderizza a risoluzione ridotta, si ferma fuori schermo o a scheda nascosta
// e mostra un solo fotogramma con "riduci movimento".

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'

const FRAG = `precision mediump float;
uniform vec2 r;uniform float t;uniform vec2 m;uniform vec3 c0;uniform vec3 c1;uniform vec3 c2;uniform float g;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 R=mat2(.8,.6,-.6,.8);for(int i=0;i<5;i++){v+=a*n(p);p=R*p*2.03;a*=.5;}return v;}
void main(){
vec2 uv=gl_FragCoord.xy/r;
vec2 p=(gl_FragCoord.xy-.5*r)/r.y;
float T=t*.035;
vec2 q=vec2(fbm(p*1.3+T),fbm(p*1.3-T+3.1));
vec2 w=vec2(fbm(p*1.7+2.*q+vec2(1.7,9.2)+T*1.3),fbm(p*1.7+2.*q+vec2(8.3,2.8)-T));
float f=fbm(p*1.15+2.3*w);
vec3 col=mix(c0,c1,smoothstep(.25,.95,f));
float d=length(p-m);
col+=c2*g*(smoothstep(.58,1.,f)*.5+.3*exp(-d*d*3.2));
float beam=pow(max(0.,sin((p.x*1.1+p.y*.55)*2.6+T*5.+w.x*3.)),6.);
col+=c2*.045*beam*g;
col*=mix(.5,1.,smoothstep(1.3,.2,length((uv-.5)*vec2(1.6,1.2))));
gl_FragColor=vec4(col,1.);
}`

const hex = (c: string) => {
  const v = parseInt(c.replace('#', ''), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

export const SHADER_PALETTES = {
  ink: { base: '#08080A', mid: '#1E1E26', light: '#C2A063', glow: 1 },
  deep: { base: '#060608', mid: '#15151B', light: '#A88449', glow: 0.7 },
} as const

export interface ShaderBackdropProps {
  palette?: keyof typeof SHADER_PALETTES
  /** Centro del bagliore (coordinate normalizzate, 0,0 = centro). */
  anchor?: [number, number]
  className?: string
}

export function ShaderBackdrop({ palette = 'ink', anchor = [0.45, 0.1], className }: ShaderBackdropProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [ax, ay] = anchor

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', premultipliedAlpha: false })
    if (!gl) return
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const u = (n: string) => gl.getUniformLocation(prog, n)
    const [uR, uT, uM, uG] = [u('r'), u('t'), u('m'), u('g')]
    const pal = SHADER_PALETTES[palette]
    gl.uniform3fv(u('c0'), hex(pal.base))
    gl.uniform3fv(u('c1'), hex(pal.mid))
    gl.uniform3fv(u('c2'), hex(pal.light))
    gl.uniform1f(uG, pal.glow)

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.5
    let visible = true
    let raf = 0
    const start = performance.now() - 20_000

    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * scale))
      const h = Math.max(1, Math.round(canvas.clientHeight * scale))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }
    const draw = (now: number) => {
      resize()
      gl.uniform2f(uR, canvas.width, canvas.height)
      gl.uniform1f(uT, (now - start) / 1000)
      gl.uniform2f(uM, ax, ay)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    const loop = (now: number) => {
      draw(now)
      if (visible && !reduce) raf = requestAnimationFrame(loop)
    }
    const play = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(loop)
    }

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && !document.hidden
      if (visible) play()
    })
    io.observe(canvas)
    const onVis = () => {
      visible = !document.hidden
      if (visible) play()
    }
    document.addEventListener('visibilitychange', onVis)
    const ro = new ResizeObserver(() => { if (reduce) draw(performance.now()) })
    ro.observe(canvas)

    play()

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      // Niente loseContext: in StrictMode lo stesso canvas viene riutilizzato subito dopo
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, [palette, ax, ay])

  return <canvas ref={ref} aria-hidden className={cn('pointer-events-none absolute inset-0 h-full w-full', className)} />
}

/** Grana pellicola animata (sovrapposizione in overlay). */
export function Grain({ opacity }: { opacity?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="grain animate-grain motion-reduce:animate-none" style={opacity ? ({ '--grain-opacity': opacity } as React.CSSProperties) : undefined} />
    </div>
  )
}
