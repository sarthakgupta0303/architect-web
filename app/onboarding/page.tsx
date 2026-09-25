import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { OnboardingWizard } from '@/features/onboarding/components/OnboardingWizard'
import { createClient } from '@/lib/supabase/server'
import { firstName } from '@/lib/utils'

export const metadata: Metadata = { title: 'Welcome' }

export default async function OnboardingPage() {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login?next=/onboarding')
  const { data: profile } = await supabase.from('profiles').select('full_name, onboarded_at').eq('id', auth.user.id).maybeSingle()
  if (profile?.onboarded_at) redirect('/app')
  const name = firstName(profile?.full_name ?? (auth.user.user_metadata?.full_name as string | undefined) ?? auth.user.email?.split('@')[0])
  return <OnboardingWizard firstName={name ?? 'My'} />
}
