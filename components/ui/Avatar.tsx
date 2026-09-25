import { cn, initials } from '@/lib/utils'

export function Avatar({ name, src, size = 28, className }: { name: string | null | undefined; src?: string | null; size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/20 font-semibold text-primary-text ring-2 ring-surface', className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      title={name ?? undefined}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials(name)
      )}
    </span>
  )
}
