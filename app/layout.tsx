import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from '@/components/layout/Providers'

export const metadata: Metadata = {
  title: { default: 'Architect — build agentic apps by prompting', template: '%s · Architect' },
  description: 'Prompt, import, code, connect GitHub, deploy and govern AI agent applications.',
}

export const viewport: Viewport = { themeColor: '#0B0A16' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
