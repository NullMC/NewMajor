import {
  forwardRef, useId, cloneElement, isValidElement,
  type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

const control =
  'block w-full rounded-xl border border-ink-200 bg-white px-3.5 text-[15px] text-ink-900 placeholder:text-ink-400 transition-colors hover:border-ink-300 focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-gold-500/40 disabled:cursor-not-allowed disabled:bg-ink-100 aria-[invalid=true]:border-danger-600'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(control, 'h-11', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(control, 'py-2.5 leading-6', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        control,
        'h-11 appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-10',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236B6B73' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
})

interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  className?: string
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; required?: boolean }>
}

/** Etichetta + controllo + messaggi, con collegamenti ARIA automatici. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId()
  const controlId = children.props.id ?? id
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={controlId} className="block text-sm font-medium text-ink-800">
        {label}
        {required && <span className="ml-0.5 text-danger-600" aria-hidden>*</span>}
      </label>
      {isValidElement(children)
        ? cloneElement(children, {
            id: controlId,
            'aria-invalid': error ? true : undefined,
            'aria-describedby': describedBy,
            required: required ?? children.props.required,
          })
        : children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-ink-500">{hint}</p>}
      {error && <p id={`${id}-err`} className="text-xs font-medium text-danger-600">{error}</p>}
    </div>
  )
}

export function Checkbox({
  label, description, className, ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const id = useId()
  return (
    <label htmlFor={rest.id ?? id} className={cn('flex cursor-pointer items-start gap-3', className)}>
      <input
        id={rest.id ?? id}
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md border-ink-300 accent-ink-900"
        {...rest}
      />
      <span className="text-sm">
        <span className="font-medium text-ink-900">{label}</span>
        {description && <span className="mt-0.5 block text-ink-500">{description}</span>}
      </span>
    </label>
  )
}

export function Switch({
  checked, onChange, label, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-ink-900' : 'bg-ink-300',
      )}
    >
      <span
        className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')}
      />
    </button>
  )
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-xl border border-danger-600/20 bg-danger-50 px-4 py-3 text-sm text-danger-700">
      {message}
    </div>
  )
}
