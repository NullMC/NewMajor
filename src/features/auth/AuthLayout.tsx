import type { ReactNode } from 'react'

export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <div className="surface p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-ink-500">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-ink-600">{footer}</div>}
      </div>
    </div>
  )
}

export const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())
