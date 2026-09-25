import { Suspense } from 'react'
import { BuildWorkspace } from '@/features/project/components/BuildWorkspace'

export default function BuildPage() {
  return <Suspense><BuildWorkspace /></Suspense>
}
