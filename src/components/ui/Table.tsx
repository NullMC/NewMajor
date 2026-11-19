import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  className?: string
  /** Nasconde la colonna sotto il breakpoint indicato. */
  hideBelow?: 'sm' | 'md' | 'lg'
}

const hide = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' }

export function DataTable<T>({
  rows, columns, rowKey, onRowClick, empty, caption,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  empty?: ReactNode
  caption: string
}) {
  if (!rows.length && empty) return <>{empty}</>
  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-ink-100 bg-ink-50/60 text-left">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn('px-4 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-500', c.hideBelow && hide[c.hideBelow], c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && 'cursor-pointer hover:bg-ink-50')}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3 align-middle', c.hideBelow && hide[c.hideBelow], c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
