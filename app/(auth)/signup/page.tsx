import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SignupForm } from '@/features/auth/components/SignupForm'

export const metadata: Metadata = { title: 'Sign up' }

export default function Page() {
  return <Suspense><SignupForm /></Suspense>
}
