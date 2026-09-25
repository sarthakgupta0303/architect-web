import { Check } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { VALUE_PROPS } from '../data'
import { SectionHeading } from './SectionHeading'

export function ValueProps() {
  return (
    <section id="features" aria-labelledby="features-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeading
        id="features-title"
        eyebrow="Why Architect"
        title="Built for agents that have to work in production"
        intro="Most app builders stop at a demo. Architect covers the plan, the code, the deploy and what happens after."
      />
      <ul className="mt-12 grid gap-4 md:grid-cols-2">
        {VALUE_PROPS.map((v) => (
          <li key={v.title}>
            <Card className="h-full rounded-2xl p-6">
              <span className="inline-flex rounded-xl bg-primary/10 p-2.5 text-primary-text"><v.icon className="size-5" aria-hidden /></span>
              <h3 className="mt-4 text-base font-semibold">{v.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{v.body}</p>
              <ul className="mt-4 space-y-2">
                {v.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-fg">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
