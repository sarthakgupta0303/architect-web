import type { Metadata } from 'next'
import { AcceptInvite } from '@/features/settings/components/AcceptInvite'

export const metadata: Metadata = { title: 'Join workspace' }

export default function Page({ params }: { params: { token: string } }) {
  return <AcceptInvite token={params.token} />
}
