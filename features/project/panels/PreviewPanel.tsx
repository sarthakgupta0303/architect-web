'use client'

import { ExternalLink, Monitor, RotateCw, Smartphone, Sparkles, Tablet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/States'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'

const DEVICES = { desktop: '100%', tablet: '834px', mobile: '390px' } as const

export function PreviewPanel({ previewUrl, onBuild }: { previewUrl: string | null; onBuild: () => void }) {
  const [device, setDevice] = useState<keyof typeof DEVICES>('desktop')
  const [nonce, setNonce] = useState(0)
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  if (!previewUrl) {
    return <EmptyState icon={Sparkles} className="h-full" title="Build your app to see a live preview" body="Plan the app in the chat, review the agents, then build. The preview lets you chat with your agents and see which one handled each message."
      action={<Button onClick={onBuild}>Review and build</Button>} />
  }
  return (
    <div className="flex h-full flex-col bg-surface-2/40">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <div className="flex gap-0.5 rounded-lg bg-surface-2 p-0.5" role="radiogroup" aria-label="Device size">
          {([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
            <Tooltip key={d} content={d[0].toUpperCase() + d.slice(1)}>
              <button role="radio" aria-checked={device === d} aria-label={d} onClick={() => setDevice(d)} className={cn('rounded-md p-1.5', device === d ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}><Icon className="size-4" /></button>
            </Tooltip>
          ))}
        </div>
        <div className="flex-1 truncate rounded-lg bg-surface-2 px-3 py-1.5 font-mono text-xs text-muted">{origin}{previewUrl}</div>
        <Button variant="ghost" size="icon" aria-label="Reload preview" onClick={() => setNonce((n) => n + 1)}><RotateCw className="size-4" /></Button>
        <Button asChild variant="ghost" size="icon" aria-label="Open preview in new tab"><a href={previewUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" /></a></Button>
      </div>
      <div className="flex flex-1 justify-center overflow-auto p-4">
        <iframe key={nonce} src={previewUrl} title="App preview" className="h-full rounded-xl border border-border bg-bg shadow-popover transition-[width] duration-250" style={{ width: DEVICES[device], maxWidth: '100%' }} />
      </div>
    </div>
  )
}
