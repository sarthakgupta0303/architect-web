import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/shared/Logo'

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
        <Link href="/" aria-label="Architect home"><Logo /></Link>
        <nav aria-label="Main" className="flex items-center gap-2 sm:gap-3">
          <a href="/#demo" className="hidden rounded-sm text-sm text-muted hover:text-fg md:inline">Demo</a>
          <a href="/#how-it-works" className="hidden rounded-sm text-sm text-muted hover:text-fg sm:inline">How it works</a>
          <a href="/#templates" className="hidden rounded-sm text-sm text-muted hover:text-fg sm:inline">Templates</a>
          {signedIn ? (
            <Button asChild size="sm" className="rounded-full px-4"><Link href="/app">Open Architect</Link></Button>
          ) : (
            <>
              <Button asChild variant="secondary" size="sm" className="rounded-full px-4"><Link href="/login">Log in</Link></Button>
              <Button asChild size="sm" className="rounded-full px-4"><Link href="/signup">Get started</Link></Button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
