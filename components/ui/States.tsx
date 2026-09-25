'use client'

import { AlertTriangle, RotateCw, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

export function EmptyState({ icon: Icon, title, body, action, className }: { icon: LucideIcon; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="rounded-2xl bg-primary/10 p-3 text-primary-text"><Icon className="size-6" aria-hidden /></div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {body && <p className="mt-1.5 max-w-[48ch] text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, detail, className }: { title?: string; message?: string; onRetry?: () => void; detail?: string; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="rounded-2xl bg-danger/10 p-3 text-danger"><AlertTriangle className="size-6" aria-hidden /></div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {message && <p className="mt-1.5 max-w-[48ch] text-sm text-muted">{message}</p>}
      {detail && (
        <details className="mt-3 max-w-lg text-left">
          <summary className="cursor-pointer text-xs text-muted">Technical details</summary>
          <pre className="mt-2 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-xs">{detail}</pre>
        </details>
      )}
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          <RotateCw className="size-4" aria-hidden /> Try again
        </Button>
      )}
    </div>
  )
}

export function Alert({ tone = 'danger', children, className }: { tone?: 'danger' | 'warning' | 'info' | 'success'; children: ReactNode; className?: string }) {
  const tones = { danger: 'border-danger/30 bg-danger/10 text-danger', warning: 'border-warning/30 bg-warning/10 text-warning', info: 'border-info/30 bg-info/10 text-info', success: 'border-success/30 bg-success/10 text-success' }
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-xl border px-3.5 py-2.5 text-sm', tones[tone], className)}>{children}</div>
}
