import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginForm } from '@/features/auth/components/LoginForm'

export const metadata: Metadata = { title: 'Log in' }

export default function Page() {
  return <Suspense><LoginForm /></Suspense>
}
