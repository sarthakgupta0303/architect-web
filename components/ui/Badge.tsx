import { AlertTriangle, CheckCircle2, Circle, Eye, Loader2, XCircle } from 'lucide-react'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const TONES = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary/15 text-primary-text',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
} as const

export type Tone = keyof typeof TONES

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)} {...props} />
}

const STATUS = {
  draft: { tone: 'neutral', icon: Circle, label: 'Draft' },
  building: { tone: 'info', icon: Loader2, label: 'Building' },
  running: { tone: 'info', icon: Loader2, label: 'Running' },
  queued: { tone: 'info', icon: Loader2, label: 'Queued' },
  preview: { tone: 'primary', icon: Eye, label: 'Preview' },
  live: { tone: 'success', icon: CheckCircle2, label: 'Live' },
  succeeded: { tone: 'success', icon: CheckCircle2, label: 'Succeeded' },
  success: { tone: 'success', icon: CheckCircle2, label: 'Success' },
  connected: { tone: 'success', icon: CheckCircle2, label: 'Connected' },
  synced: { tone: 'success', icon: CheckCircle2, label: 'Synced' },
  attention: { tone: 'warning', icon: AlertTriangle, label: 'Needs attention' },
  escalated: { tone: 'warning', icon: AlertTriangle, label: 'Escalated' },
  failed: { tone: 'danger', icon: XCircle, label: 'Failed' },
  error: { tone: 'danger', icon: XCircle, label: 'Error' },
  archived: { tone: 'neutral', icon: Circle, label: 'Archived' },
} as const satisfies Record<string, { tone: Tone; icon: typeof Circle; label: string }>

export type StatusKey = keyof typeof STATUS

export function StatusPill({ status, label, className }: { status: StatusKey; label?: string; className?: string }) {
  const s = STATUS[status] ?? STATUS.draft
  const Icon = s.icon
  const spinning = status === 'building' || status === 'running' || status === 'queued'
  return (
    <Badge tone={s.tone} className={className}>
      <Icon className={cn('size-3', spinning && 'animate-spin motion-reduce:animate-none')} aria-hidden />
      {label ?? s.label}
    </Badge>
  )
}
