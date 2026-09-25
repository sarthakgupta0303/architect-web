'use client'

import { MailCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Logo } from '@/components/shared/Logo'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/States'
import { ApiError, apiFetch } from '@/lib/api/client'

const MESSAGES: Partial<Record<string, string>> = {
  NOT_FOUND: 'This invitation link isn’t valid. Ask for a new one.',
  EXPIRED: 'This invitation has expired. Ask the workspace admin for a new link.',
  FORBIDDEN: 'This invitation was sent to a different email address. Sign in with that address to accept it.',
  CONFLICT: 'This invitation has already been used.',
}

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = /^[A-Za-z0-9_-]{20,200}$/.test(token)

  async function accept() {
    setLoading(true)
    setError(null)
    try {
      const { workspaceSlug } = await apiFetch<{ workspaceSlug: string }>(`/api/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST' })
      router.replace(`/w/${workspaceSlug}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? MESSAGES[e.code] ?? e.message : 'Could not accept the invitation')
      setLoading(false)
    }
  }

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4">
      <Logo showBadge={false} />
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto w-fit rounded-2xl bg-primary/10 p-3 text-primary-text"><MailCheck className="size-6" aria-hidden /></div>
        <h1 className="mt-4 text-xl font-semibold">You’ve been invited</h1>
        <p className="mt-2 text-sm text-muted">Join the workspace to build, review and deploy agent apps with your team.</p>
        {!valid && <Alert className="mt-5 text-left">This invitation link is malformed. Copy the full link from your invitation.</Alert>}
        {error && <Alert className="mt-5 text-left">{error}</Alert>}
        <Button className="mt-6 w-full" onClick={accept} loading={loading} disabled={!valid}>Join workspace</Button>
        <Link href="/app" className="mt-3 inline-block text-sm text-muted hover:text-fg">Not now</Link>
      </Card>
    </main>
  )
}
