import type { Metadata } from 'next'
import { Suspense } from 'react'
import { VerifyForm } from '@/features/auth/components/VerifyForm'

export const metadata: Metadata = { title: 'Verify email' }

export default function Page() {
  return <Suspense><VerifyForm /></Suspense>
}
