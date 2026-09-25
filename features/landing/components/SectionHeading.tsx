import { cn } from '@/lib/utils'

/** Eyebrow + h2 + intro used by every landing section. */
export function SectionHeading({ id, eyebrow, title, intro, align = 'center', className }: {
  id: string
  eyebrow: string
  title: string
  intro?: string
  align?: 'center' | 'left'
  className?: string
}) {
  return (
    <div className={cn('max-w-2xl', align === 'center' ? 'mx-auto text-center' : 'text-left', className)}>
      <p className="text-xs font-medium uppercase tracking-wider text-primary-text">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {intro && <p className="mt-3 text-base text-muted">{intro}</p>}
    </div>
  )
}
