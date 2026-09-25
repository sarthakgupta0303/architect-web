import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { HeroPrompt } from '@/features/generation/components/HeroPrompt'

export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="hero-title" className="mx-auto flex max-w-6xl flex-col items-center px-4 pb-16 pt-10 text-center sm:px-6 sm:pt-16">
      <h1 id="hero-title" className="max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">
        Describe an AI agent app.{' '}
        <span className="bg-gradient-to-r from-primary-text to-accent bg-clip-text text-transparent">Architect plans it, builds it and ships it.</span>
      </h1>
      <p className="mb-10 mt-5 max-w-2xl text-base text-muted sm:text-lg">
        Start with a sentence. Review the PRD, agent graph and cost before any code is written, then test a live preview and deploy with one click.
      </p>

      <HeroPrompt signedIn={signedIn} />

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-muted">
        {signedIn ? (
          <>
            <span>Welcome back.</span>
            <Button asChild variant="secondary" className="rounded-full">
              <Link href="/app">Open Architect</Link>
            </Button>
          </>
        ) : (
          <>
            <Button asChild variant="secondary" className="rounded-full">
              <Link href="/signup">Start free</Link>
            </Button>
            <span>
              Already have an account?{' '}
              <Link href="/login" className="rounded-sm font-medium text-primary-text underline-offset-4 hover:underline">Sign in</Link>
            </span>
          </>
        )}
      </div>
    </section>
  )
}
