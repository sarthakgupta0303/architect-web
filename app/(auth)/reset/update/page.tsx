import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { NewPasswordForm } from '@/features/auth/components/ResetForms'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'New password' }

export default async function Page() {
  const { data } = await createClient().auth.getUser()
  if (!data.user) redirect('/reset')
  return <NewPasswordForm />
}
