import Link from 'next/link'
import { Logo } from '@/components/shared/Logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(60%_40%_at_50%_0%,rgb(var(--color-primary)/0.16),transparent)]">
      <header className="px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Architect home"><Logo /></Link>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-popover sm:p-8">{children}</div>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-muted">By continuing you agree to the Terms and Privacy Policy.</footer>
    </div>
  )
}
