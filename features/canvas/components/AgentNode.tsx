'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Code2, Lock, Play, Sparkles, UserCheck, Workflow } from 'lucide-react'
import { memo } from 'react'
import { BUILTIN_TOOL_LABELS, MODEL_LABELS, type AgentDto } from '@/lib/contracts/agents'
import { cn } from '@/lib/utils'

export const AGENT_TYPE_META = {
  autonomous: { icon: Sparkles, label: 'Autonomous' },
  workflow: { icon: Workflow, label: 'Workflow' },
  human_approval: { icon: UserCheck, label: 'Human approval' },
  code: { icon: Code2, label: 'Code agent' },
} as const

export type AgentNodeData = { agent: AgentDto }

function AgentNodeImpl({ data, selected }: NodeProps & { data: AgentNodeData }) {
  const a = data.agent
  const meta = AGENT_TYPE_META[a.type]
  const Icon = meta.icon
  const tools = a.tools.slice(0, 3)
  return (
    <div
      className={cn('w-60 rounded-xl border bg-surface p-3.5 text-left shadow-sm transition-shadow', selected ? 'border-primary ring-2 ring-primary/30' : 'border-border', a.type === 'code' && 'border-dashed')}
      aria-label={`${a.name} agent`}
    >
      <Handle type="target" position={Position.Left} aria-label="Incoming hand-off" />
      <div className="flex items-center gap-2">
        <span className={cn('rounded-lg p-1.5', a.type === 'human_approval' ? 'bg-warning/15 text-warning' : a.type === 'workflow' ? 'bg-info/15 text-info' : 'bg-primary/15 text-primary-text')}>
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold">{a.name}</span>
        {a.isEntry && <span title="Entry agent" className="rounded-md bg-success/15 p-1 text-success"><Play className="size-3" aria-label="Entry agent" /></span>}
        {a.locked && <Lock className="size-3.5 text-muted" aria-label="Locked" />}
      </div>
      {a.role && <p className="mt-1.5 line-clamp-2 text-xs text-muted">{a.role}</p>}
      <p className="mt-2 font-mono text-[11px] text-muted">{a.model ? MODEL_LABELS[a.model as keyof typeof MODEL_LABELS] ?? a.model : 'Default model'} · {meta.label}</p>
      {a.tools.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tools.map((t) => <span key={t.id} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{BUILTIN_TOOL_LABELS[t.name as keyof typeof BUILTIN_TOOL_LABELS] ?? t.name}</span>)}
          {a.tools.length > 3 && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">+{a.tools.length - 3}</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} aria-label="Outgoing hand-off" />
    </div>
  )
}

export const AgentNode = memo(AgentNodeImpl)
