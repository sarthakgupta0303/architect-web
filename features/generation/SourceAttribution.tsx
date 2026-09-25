'use client'

import { Bot, FileText, Layers, MessagesSquare } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import type { ContextType, Source } from '@/lib/core/memory/types'

const META: Record<ContextType, { label: string; tone: 'primary' | 'info' | 'warning'; icon: typeof FileText; hint: string }> = {
  project: { label: 'From project', tone: 'primary', icon: FileText, hint: 'Answered from the PRD and agent graph (plus the last 10 messages).' },
  history: { label: 'From conversation', tone: 'info', icon: MessagesSquare, hint: 'Answered only from this conversation (up to 20 messages). Project documents were not used.' },
  both: { label: 'Project + conversation', tone: 'warning', icon: Layers, hint: 'Answered from the PRD, agent graph and this conversation. Each fact names its source.' },
}

/** Tells the user where an answer came from (conversation-memory spec §4). */
export function SourceAttribution({ contextType, sources, confidence, onOpen }: {
  contextType: ContextType | null
  sources: Source[]
  confidence?: number | null
  onOpen?: (s: Source) => void
}) {
  if (!contextType) return null
  const m = META[contextType]
  const Icon = m.icon
  const unique = sources.filter((s, i, arr) => arr.findIndex((x) => x.kind === s.kind && x.ref === s.ref) === i).slice(0, 6)
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
      <Tooltip content={`${m.hint}${confidence ? ` Confidence ${Math.round(confidence * 100)}%.` : ''}`}>
        <span tabIndex={0}><Badge tone={m.tone}><Icon className="size-3" aria-hidden />{m.label}</Badge></span>
      </Tooltip>
      {unique.map((s) => {
        const SIcon = s.kind === 'prd' ? FileText : s.kind === 'agent' ? Bot : MessagesSquare
        const text = s.kind === 'prd' ? `PRD · ${s.label}` : s.kind === 'agent' ? `Agent · ${s.label}` : s.label
        return onOpen && s.kind !== 'conversation' ? (
          <button key={`${s.kind}:${s.ref}`} onClick={() => onOpen(s)} className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-muted hover:text-fg">
            <SIcon className="size-3" aria-hidden />{text}
          </button>
        ) : (
          <span key={`${s.kind}:${s.ref}`} className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-muted"><SIcon className="size-3" aria-hidden />{text}</span>
        )
      })}
    </div>
  )
}
