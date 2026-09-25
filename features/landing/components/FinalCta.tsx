import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { DOCS_URL } from '../data'

export function FinalCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="cta-title" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-surface px-6 py-14 text-center sm:px-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgb(var(--color-primary)/0.25),transparent)]" />
        <div className="relative">
          <h2 id="cta-title" className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight sm:text-4xl">
            Your first agent app is one sentence away
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted">
            Describe it, review the plan and ship it to a live URL. Bring your developers in whenever you are ready.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {signedIn ? (
              <Button asChild size="lg">
                <Link href="/app">Open Architect <ArrowRight className="size-4" aria-hidden /></Link>
              </Button>
            ) : (
              <Button asChild size="lg">
                <Link href="/signup">Start building free <ArrowRight className="size-4" aria-hidden /></Link>
              </Button>
            )}
            <Button asChild size="lg" variant="secondary">
              <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
                Read the docs<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
