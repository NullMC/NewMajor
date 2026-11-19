import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'inverse'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap'

const variants: Record<Variant, string> = {
  primary: 'bg-ink-900 text-white hover:bg-ink-700',
  accent: 'bg-gold-500 text-ink-950 hover:bg-gold-400',
  secondary: 'border border-ink-200 bg-white text-ink-900 hover:border-ink-400',
  ghost: 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-danger-600 text-white hover:bg-danger-700',
  inverse: 'bg-white text-ink-900 hover:bg-ink-100',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-[15px]',
  icon: 'h-11 w-11',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', extra?: string) =>
  cn(base, variants[variant], sizes[size], extra)

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  )
})

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}
