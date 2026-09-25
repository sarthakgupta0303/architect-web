import type { Metadata } from 'next'
import { Suspense } from 'react'
import { WorkspaceSettings } from '@/features/settings/components/WorkspaceSettings'

export const metadata: Metadata = { title: 'Settings' }

export default function Page() {
  return <Suspense><WorkspaceSettings /></Suspense>
}
