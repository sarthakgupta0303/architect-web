import type { Metadata } from 'next'
import { WorkspaceStudio } from '@/features/studio/components/WorkspaceStudio'

export const metadata: Metadata = { title: 'Studio' }

export default function Page() {
  return <WorkspaceStudio />
}
