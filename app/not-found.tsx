import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/shared/Logo'

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="mt-6 text-3xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-muted">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Button asChild className="mt-2"><Link href="/app">Go to your workspace</Link></Button>
    </main>
  )
}
