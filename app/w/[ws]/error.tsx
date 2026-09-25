'use client'

import { ErrorState } from '@/components/ui/States'

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState className="min-h-[60vh]" message="We couldn't load this page. Check your connection and try again." detail={error.digest} onRetry={reset} />
}
