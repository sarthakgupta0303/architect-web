import { cn } from '@/lib/utils'
import { AUDIENCES } from '../data'
import { SectionHeading } from './SectionHeading'

export function Audiences() {
  return (
    <section id="builders-and-developers" aria-labelledby="audience-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeading
        id="audience-title"
        eyebrow="One project, two ways in"
        title="Builders describe it. Developers refine it."
        intro="Build mode and Code mode work on the same project, so nobody has to rebuild what someone else started."
      />
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {AUDIENCES.map((a, idx) => (
          <article
            key={a.eyebrow}
            aria-labelledby={`audience-${idx}`}
            className={cn(
              'rounded-2xl border p-6 sm:p-8',
              idx === 0 ? 'border-primary/40 bg-gradient-to-b from-primary/10 to-surface' : 'border-border bg-surface',
            )}
          >
            <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary-text">
              <a.icon className="size-4" aria-hidden />
              {a.eyebrow}
            </p>
            <h3 id={`audience-${idx}`} className="mt-3 text-xl font-semibold">{a.title}</h3>
            <p className="mt-2 text-sm text-muted">{a.body}</p>
            <ul className="mt-6 space-y-3">
              {a.points.map((p) => (
                <li key={p.text} className="flex items-start gap-3 text-sm">
                  <span className="rounded-lg bg-surface-2 p-1.5 text-primary-text"><p.icon className="size-4" aria-hidden /></span>
                  <span className="pt-1">{p.text}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}
