'use client'

import { ErrorState } from '@/components/ui/States'

export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState className="min-h-[60vh]" message="This project could not be loaded. Try again in a moment." detail={error.digest} onRetry={reset} />
}
