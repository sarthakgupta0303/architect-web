'use client'

import * as SW from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export function Switch({ checked, onCheckedChange, disabled, id, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; id?: string; label?: string }) {
  return (
    <SW.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={cn('relative h-5 w-9 shrink-0 rounded-full border border-border bg-surface-2 transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:opacity-50')}
    >
      <SW.Thumb className="block size-4 translate-x-0.5 rounded-full bg-fg shadow transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-primary-fg" />
    </SW.Root>
  )
}
