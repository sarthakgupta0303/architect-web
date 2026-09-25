import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { TEMPLATES } from '../data'
import { SectionHeading } from './SectionHeading'

export function TemplatesGrid({ signedIn }: { signedIn: boolean }) {
  const href = signedIn ? '/app' : '/signup'
  return (
    <section id="templates" aria-labelledby="templates-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeading
        id="templates-title"
        eyebrow="Templates"
        title="Start from a proven use case"
        intro="Each template comes with a plan, an agent graph and a working UI you can change in plain language."
      />
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <li key={t.name}>
            <Link
              href={href}
              className="card-interactive group flex h-full flex-col rounded-2xl border border-border bg-surface p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="inline-flex w-fit rounded-xl bg-primary/10 p-2 text-primary-text"><t.icon className="size-5" aria-hidden /></span>
              <h3 className="mt-4 text-base font-semibold">{t.name}</h3>
              <p className="mt-1.5 flex-1 text-sm text-muted">{t.body}</p>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                <span className="font-mono text-xs text-muted">{t.meta}</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-text">
                  Use template
                  <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
