import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ResetRequestForm } from '@/features/auth/components/ResetForms'

export const metadata: Metadata = { title: 'Reset password' }

export default function Page() {
  return <Suspense><ResetRequestForm /></Suspense>
}
