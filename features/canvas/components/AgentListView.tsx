'use client'

import { Pencil, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { MODEL_LABELS, type AgentDto, type EdgeDto } from '@/lib/contracts/agents'
import { AGENT_TYPE_META } from './AgentNode'

/** Accessible alternative to the canvas (docs/specs/agent-canvas.md §4.4). */
export function AgentListView({ agents, edges, canEdit, onEdit, onDelete }: { agents: AgentDto[]; edges: EdgeDto[]; canEdit: boolean; onEdit: (id: string) => void; onDelete: (a: AgentDto) => void }) {
  const nameById = new Map(agents.map((a) => [a.id, a.name]))
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">Agent</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Model</th>
            <th className="px-4 py-3 text-right font-medium">Tools</th><th className="px-4 py-3 font-medium">Hands off to</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => {
            const to = edges.filter((e) => e.fromAgentId === a.id).map((e) => `${nameById.get(e.toAgentId) ?? '?'}${e.condition ? ` (${e.condition})` : ''}`)
            return (
              <tr key={a.id} className="h-12 border-b border-border last:border-0 hover:bg-surface-2">
                <td className="px-4 font-medium">{a.name} {a.isEntry && <Play className="ml-1 inline size-3 text-success" aria-label="Entry agent" />}</td>
                <td className="px-4 text-muted">{AGENT_TYPE_META[a.type].label}</td>
                <td className="px-4 font-mono text-xs text-muted">{a.model ? MODEL_LABELS[a.model as keyof typeof MODEL_LABELS] ?? a.model : 'Default'}</td>
                <td className="px-4 text-right tabular-nums">{a.tools.length}</td>
                <td className="px-4 text-muted">{to.length ? to.join(', ') : '—'}</td>
                <td className="px-4 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Edit ${a.name}`} onClick={() => onEdit(a.id)}><Pencil className="size-4" /></Button>
                    {canEdit && <Button variant="ghost" size="icon" aria-label={`Delete ${a.name}`} onClick={() => onDelete(a)} disabled={a.locked}><Trash2 className="size-4" /></Button>}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
