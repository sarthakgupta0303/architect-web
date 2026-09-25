import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Dashboard } from '@/features/dashboard/components/Dashboard'

export const metadata: Metadata = { title: 'Home' }

export default function DashboardPage() {
  return <Suspense><Dashboard /></Suspense>
}
