'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Tooltip } from '@/components/ui/Tooltip'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="currentColor" d="M21.6 12.23c0-.68-.06-1.36-.18-2.02H12v3.83h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.98-4.32 2.98-7.33Z" />
      <path fill="currentColor" opacity=".75" d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.23-2.5c-.9.6-2.05.95-3.39.95-2.6 0-4.81-1.76-5.6-4.12H3.07v2.58A10 10 0 0 0 12 22Z" />
      <path fill="currentColor" opacity=".55" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.52H3.07a10 10 0 0 0 0 8.96L6.4 13.9Z" />
      <path fill="currentColor" opacity=".9" d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.52L6.4 10.1C7.19 7.74 9.4 5.98 12 5.98Z" />
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.1-1.47-1.1-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  )
}

const NOT_SET_UP = 'Not set up for this project yet — enable it in Supabase → Authentication → Providers. Use email for now.'

export function OAuthButtons({ next }: { next: string }) {
  const [pending, setPending] = useState<'google' | 'github' | null>(null)
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: async () => {
      const r = await fetch('/api/auth/providers', { cache: 'no-store' })
      return r.ok ? ((await r.json()) as { google: boolean; github: boolean }) : { google: false, github: false }
    },
    staleTime: 60_000,
  })
  const enabled = (p: 'google' | 'github') => providers.data?.[p] ?? false

  async function signIn(provider: 'google' | 'github') {
    if (!enabled(provider)) {
      toast.info(NOT_SET_UP)
      return
    }
    setPending(provider)
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo, scopes: provider === 'github' ? 'read:user user:email' : undefined },
    })
    if (error) {
      setPending(null)
      toast.error(error.message.includes('not enabled') ? `${provider === 'google' ? 'Google' : 'GitHub'} sign-in is not enabled for this project yet` : error.message)
    }
  }

  const button = (p: 'google' | 'github', label: string, icon: JSX.Element) => {
    const off = providers.isSuccess && !enabled(p)
    const btn = (
      <Button variant="secondary" className="w-full" onClick={() => signIn(p)} loading={pending === p} disabled={pending !== null || providers.isLoading} aria-disabled={off || undefined}>
        {pending !== p && icon} {label}
        {off && <span className="ml-1 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted">Not set up</span>}
      </Button>
    )
    return off ? <Tooltip content={NOT_SET_UP}><span className="block">{btn}</span></Tooltip> : btn
  }

  return (
    <div className="grid gap-2">
      {button('google', 'Continue with Google', <GoogleIcon />)}
      {button('github', 'Continue with GitHub', <GithubIcon />)}
    </div>
  )
}

export function Divider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted" role="separator">
      <span className="h-px flex-1 bg-border" />{label}<span className="h-px flex-1 bg-border" />
    </div>
  )
}
