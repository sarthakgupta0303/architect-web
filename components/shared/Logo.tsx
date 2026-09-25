import { cn } from '@/lib/utils'

export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="arch-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--color-primary-text))" />
          <stop offset="100%" stopColor="rgb(var(--color-accent))" />
        </linearGradient>
      </defs>
      <path d="M16 3 29 27H3L16 3Z" fill="none" stroke="url(#arch-logo)" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="16" cy="19" r="3.2" fill="rgb(var(--color-accent))" />
    </svg>
  )
}

export function Logo({ showBadge = true, className }: { showBadge?: boolean; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <LogoMark />
      Architect
      {showBadge && <span className="hidden rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted sm:inline">2.0</span>}
    </span>
  )
}
