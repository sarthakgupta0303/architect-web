'use client'

import { useRouter } from 'next/navigation'
import { PromptComposer } from './PromptComposer'

/** Landing prompt (PRD Flow 1): the prompt survives sign-up and starts the first project after onboarding. */
export function HeroPrompt({ signedIn }: { signedIn: boolean }) {
  const router = useRouter()
  return (
    <div className="w-full max-w-3xl">
      <PromptComposer
        onSubmit={(prompt) => {
          try { sessionStorage.setItem('pending_prompt', prompt) } catch { /* storage unavailable — URL carries it */ }
          if (signedIn) router.push('/app')
          else router.push(`/signup?next=${encodeURIComponent('/onboarding')}`)
        }}
      />
    </div>
  )
}
