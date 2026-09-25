import { STEPS } from '../data'
import { SectionHeading } from './SectionHeading'

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 border-y border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title="Four steps, and you approve every one"
          intro="Architect does the heavy lifting. You stay in the loop at the moments that matter."
        />
        <ol className="relative mt-12 grid gap-8 lg:grid-cols-4 lg:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative flex gap-4 lg:flex-col lg:gap-0">
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-5 top-12 h-[calc(100%-1rem)] w-px bg-border lg:-right-6 lg:left-12 lg:top-5 lg:h-px lg:w-auto"
                />
              )}
              <span className="relative z-10 inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-bg font-mono text-sm font-semibold text-primary-text">
                {i + 1}
              </span>
              <div className="lg:mt-5 lg:pr-4">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <s.icon className="size-4 text-primary-text" aria-hidden />
                  {s.title}
                </h3>
                <p className="mt-1.5 text-sm text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
