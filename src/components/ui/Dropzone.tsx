import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { UploadCloud } from 'lucide-react'
import { cn } from '@/lib/cn'
import { SITE_IMAGE_ACCEPT } from '@/lib/storage'

interface DropzoneProps {
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
  disabled?: boolean
  label?: ReactNode
  hint?: ReactNode
  compact?: boolean
  className?: string
}

/** Area di upload con drag & drop, accessibile anche da tastiera. */
export function Dropzone({
  onFiles, accept = SITE_IMAGE_ACCEPT, multiple, disabled, label = 'Trascina qui i file o selezionali', hint, compact, className,
}: DropzoneProps) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const handle = (list: FileList | null) => {
    if (!list || disabled) return
    const files = Array.from(list)
    onFiles(multiple ? files : files.slice(0, 1))
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    handle(e.dataTransfer.files)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        'relative rounded-2xl border-2 border-dashed transition-colors',
        over ? 'border-gold-500 bg-gold-100/40' : 'border-ink-200 bg-white hover:border-ink-400',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
    >
      <label
        htmlFor={id}
        className={cn('flex cursor-pointer flex-col items-center justify-center text-center', compact ? 'gap-1 px-4 py-4' : 'gap-2 px-6 py-8')}
      >
        <UploadCloud className={cn('text-ink-400', compact ? 'h-5 w-5' : 'h-7 w-7')} aria-hidden />
        <span className="text-sm font-semibold text-ink-900">{label}</span>
        {hint && <span className="text-xs text-ink-500">{hint}</span>}
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => { handle(e.target.files); e.target.value = '' }}
      />
    </div>
  )
}
