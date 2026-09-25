'use client'

import { cn } from '@/lib/utils'

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', disabled }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; disabled?: boolean; title?: string }[]
  label: string
  size?: 'sm' | 'md'
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled || o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
