import type { ReactNode } from 'react'
import { ShaderBackdrop, Grain } from '@/components/fx/ShaderBackdrop'
import { LiquidGlass } from '@/components/fx/LiquidGlass'

export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div data-surface="dark" className="relative mx-2 -mt-16 flex min-h-[calc(100svh-0.5rem)] items-center justify-center overflow-hidden rounded-b-[2rem] bg-ink-950 px-4 pb-12 pt-28 sm:mx-3 sm:rounded-b-[2.5rem]">
      <ShaderBackdrop anchor={[0, 0.35]} />
      <Grain />
      <LiquidGlass tone="light" bezel={22} className="w-full max-w-md animate-scene-in rounded-[2rem] !bg-white/[.88] p-6 sm:p-9">
        <h1 className="text-3xl font-bold">{title}</h1>
        {description && <p className="mt-2 text-sm text-ink-500">{description}</p>}
        <div className="mt-7">{children}</div>
        {footer && <div className="mt-7 border-t border-ink-900/10 pt-5 text-center text-sm text-ink-600">{footer}</div>}
      </LiquidGlass>
    </div>
  )
}

export const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())
