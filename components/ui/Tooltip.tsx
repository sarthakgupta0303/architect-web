'use client'

import * as TT from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export const TooltipProvider = TT.Provider

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TT.Root delayDuration={300}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-fg shadow-popover animate-fade-in">
          {content}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  )
}
