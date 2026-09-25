import Link from 'next/link'
import { Logo } from '@/components/shared/Logo'

const DOCS_URL = 'https://docs.lyzr.ai'
const LYZR_URL = 'https://www.lyzr.ai'

type FooterLink = { label: string; href: string; external?: boolean }

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Demo', href: '/#demo' },
      { label: 'Features', href: '/#features' },
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'Templates', href: '/#templates' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign up', href: '/signup' },
      { label: 'Log in', href: '/login' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: DOCS_URL, external: true },
      { label: 'Lyzr', href: LYZR_URL, external: true },
    ],
  },
]

const linkClass = 'rounded-sm text-sm text-muted transition-colors duration-150 hover:text-fg'

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Link href="/" aria-label="Architect home" className="inline-flex rounded-sm"><Logo /></Link>
          <p className="mt-3 text-sm text-muted">Describe, build, deploy and govern AI agent apps. Made by Lyzr.</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-xs font-medium uppercase tracking-wider text-fg">{col.title}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                      {l.label}<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <Link href={l.href} className={linkClass}>{l.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted sm:px-6">© {new Date().getFullYear()} Lyzr. All rights reserved.</p>
      </div>
    </footer>
  )
}
