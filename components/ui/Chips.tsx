'use client'

import { cn } from '@/lib/utils'

/** Single-select filter chips (category filters). `null` value = "All". */
export function Chips<T extends string>({ value, onChange, options, label }: {
  value: T | null
  onChange: (v: T | null) => void
  options: { value: T; label: string }[]
  label: string
}) {
  const all = [{ value: null, label: 'All' } as { value: T | null; label: string }, ...options]
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {all.map((o) => {
        const active = value === o.value
        return (
          <button key={o.label} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.value)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150',
              active ? 'border-primary bg-primary/15 text-primary-text' : 'border-border text-muted hover:border-fg/40 hover:text-fg')}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
