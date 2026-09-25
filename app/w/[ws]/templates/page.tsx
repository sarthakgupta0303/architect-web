import type { Metadata } from 'next'
import { TemplatesGallery } from '@/features/templates/components/TemplatesGallery'

export const metadata: Metadata = { title: 'Templates' }

export default function Page() {
  return <TemplatesGallery />
}
