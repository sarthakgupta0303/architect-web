'use client'

import * as DM from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const Menu = DM.Root
export const MenuTrigger = DM.Trigger

export function MenuContent({ children, align = 'end', className }: { children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} className={cn('z-50 min-w-[200px] rounded-xl border border-border bg-surface p-1 shadow-popover animate-fade-in', className)}>
        {children}
      </DM.Content>
    </DM.Portal>
  )
}

export function MenuItem({ children, onSelect, destructive, disabled }: { children: ReactNode; onSelect?: (e: Event) => void; destructive?: boolean; disabled?: boolean }) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        destructive ? 'text-danger data-[highlighted]:bg-danger/10' : 'text-fg data-[highlighted]:bg-surface-2',
      )}
    >
      {children}
    </DM.Item>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2.5 py-1.5 text-xs font-medium text-muted">{children}</DM.Label>
}

export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-border" />
}
