'use client'

import { Sparkles } from 'lucide-react'
import { useWorkspace } from '@/features/workspace/context'
import { PLANS } from '@/lib/core/plans'
import { cn, formatCredits } from '@/lib/utils'

export function CreditsMeter({ compact = false }: { compact?: boolean }) {
  const { workspace } = useWorkspace()
  const grant = PLANS[workspace.plan].monthlyCredits || workspace.creditsBalance || 1
  const pct = Math.max(0, Math.min(100, (workspace.creditsBalance / grant) * 100))
  const tone = pct < 5 ? 'bg-danger' : pct < 20 ? 'bg-warning' : 'bg-primary'
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted" title="Credits remaining">
        <Sparkles className="size-3.5 text-primary-text" aria-hidden />{formatCredits(workspace.creditsBalance)}
      </span>
    )
  }
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{PLANS[workspace.plan].label} plan</span>
        <span className="text-muted">{formatCredits(workspace.creditsBalance)} credits</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Credits remaining">
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
