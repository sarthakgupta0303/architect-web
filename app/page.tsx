import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { Audiences } from '@/features/landing/components/Audiences'
import { DemoSection } from '@/features/landing/components/DemoSection'
import { FinalCta } from '@/features/landing/components/FinalCta'
import { Hero } from '@/features/landing/components/Hero'
import { HowItWorks } from '@/features/landing/components/HowItWorks'
import { StackStrip } from '@/features/landing/components/StackStrip'
import { TemplatesGrid } from '@/features/landing/components/TemplatesGrid'
import { ValueProps } from '@/features/landing/components/ValueProps'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  let signedIn = false
  try {
    const { data } = await createClient().auth.getUser()
    signedIn = !!data.user
  } catch {
    signedIn = false
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-[radial-gradient(60%_40rem_at_50%_0%,rgb(var(--color-primary)/0.2),transparent)]">
      <SiteHeader signedIn={signedIn} />
      <main id="main">
        <Hero signedIn={signedIn} />
        <StackStrip />
        <DemoSection />
        <ValueProps />
        <HowItWorks />
        <Audiences />
        <TemplatesGrid signedIn={signedIn} />
        <FinalCta signedIn={signedIn} />
      </main>
      <SiteFooter />
    </div>
  )
}
