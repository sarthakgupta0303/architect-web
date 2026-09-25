'use client'

import { Check, Copy, Loader2, Lock, Plus, Trash2, Unlock, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/Menu'
import { Segmented } from '@/components/ui/Segmented'
import { Switch } from '@/components/ui/Switch'
import { BUILTIN_TOOLS, BUILTIN_TOOL_LABELS, MODEL_IDS, MODEL_LABELS, type AgentDto, type UpdateAgentInput } from '@/lib/contracts/agents'
import { FRAMEWORK_LABELS } from '@/lib/contracts/common'
import { useGraphMutations } from '../hooks/use-graph'

type Props = { projectId: string; agent: AgentDto; canEdit: boolean; isDeveloper: boolean; onClose: () => void }

export function AgentInspector({ projectId, agent, canEdit, isDeveloper, onClose }: Props) {
  const m = useGraphMutations(projectId)
  const [draft, setDraft] = useState({ name: agent.name, role: agent.role ?? '', instructions: agent.instructions ?? '' })
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readOnly = !canEdit || agent.locked

  useEffect(() => { setDraft({ name: agent.name, role: agent.role ?? '', instructions: agent.instructions ?? '' }) }, [agent.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function save(input: UpdateAgentInput) {
    setSaveState('saving')
    m.updateAgent.mutate({ id: agent.id, input }, { onSuccess: () => setSaveState('saved'), onError: () => setSaveState('idle') })
  }

  function saveText(field: 'name' | 'role' | 'instructions', value: string) {
    setDraft((d) => ({ ...d, [field]: value }))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (field === 'name' && !value.trim()) return
      save({ [field]: field === 'name' ? value.trim() : value.trim() ? value : null } as UpdateAgentInput)
    }, 600)
  }

  const availableTools = BUILTIN_TOOLS.filter((t) => !agent.tools.some((x) => x.name === t))

  return (
    <aside aria-label={`${agent.name} settings`} className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-surface animate-slide-in-right">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{agent.name}</p>
          <p className="text-xs text-muted" aria-live="polite">
            {saveState === 'saving' ? <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" aria-hidden />Saving…</span> : saveState === 'saved' ? <span className="inline-flex items-center gap-1"><Check className="size-3" aria-hidden />Saved</span> : agent.locked ? 'Locked' : 'Changes save automatically'}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close inspector" onClick={onClose}><X className="size-4" /></Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {agent.locked && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-muted"><Lock className="size-4" aria-hidden />Locked — AI and edits can’t change it</span>
            {canEdit && <Button size="sm" variant="secondary" onClick={() => save({ locked: false })}><Unlock className="size-3.5" aria-hidden />Unlock</Button>}
          </div>
        )}
        <div>
          <Label htmlFor="ag-name">Name</Label>
          <Input id="ag-name" value={draft.name} maxLength={60} disabled={readOnly} invalid={!draft.name.trim()} onChange={(e) => saveText('name', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ag-role">Role</Label>
          <Input id="ag-role" value={draft.role} maxLength={200} placeholder="What this agent is responsible for" disabled={readOnly} onChange={(e) => saveText('role', e.target.value)} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">Type</p>
          <Segmented size="sm" label="Agent type" disabled={readOnly} value={agent.type === 'code' ? 'autonomous' : agent.type} onChange={(v) => save({ type: v })}
            options={[{ value: 'autonomous', label: 'Autonomous' }, { value: 'workflow', label: 'Workflow' }, { value: 'human_approval', label: 'Approval' }]} />
        </div>
        <div>
          <Label htmlFor="ag-model">Model</Label>
          <Select id="ag-model" disabled={readOnly} value={agent.model ?? ''} onChange={(e) => save({ model: (e.target.value || null) as UpdateAgentInput['model'] })}>
            <option value="">Workspace default</option>
            {MODEL_IDS.map((id) => <option key={id} value={id}>{MODEL_LABELS[id]}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="ag-instr">Instructions</Label>
          <Textarea id="ag-instr" rows={10} maxLength={20000} disabled={readOnly} value={draft.instructions} placeholder="Tell the agent how to behave, what to avoid and what good output looks like." onChange={(e) => saveText('instructions', e.target.value)} />
          <p className="mt-1 text-right text-xs text-muted">{draft.instructions.length.toLocaleString()} / 20,000</p>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">Memory</p>
          <Segmented size="sm" label="Memory" disabled={readOnly} value={agent.memory.mode} onChange={(v) => save({ memory: { mode: v } })}
            options={[{ value: 'none', label: 'None' }, { value: 'short', label: 'Short-term' }, { value: 'long', label: 'Long-term' }]} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">Tools</p>
          <div className="flex flex-wrap gap-1.5">
            {agent.tools.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-2.5 pr-1 text-xs">
                {BUILTIN_TOOL_LABELS[t.name as keyof typeof BUILTIN_TOOL_LABELS] ?? t.name}
                {!readOnly && <button aria-label={`Remove ${t.name}`} className="rounded-full p-0.5 text-muted hover:text-fg" onClick={() => m.removeTool.mutate({ agentId: agent.id, toolId: t.id })}><X className="size-3" /></button>}
              </span>
            ))}
            {!readOnly && (
              <Menu>
                <MenuTrigger asChild><Button variant="secondary" size="sm" className="h-7 rounded-full"><Plus className="size-3.5" aria-hidden />Tool</Button></MenuTrigger>
                <MenuContent align="start">
                  <MenuLabel>Built-in</MenuLabel>
                  {availableTools.length === 0 && <p className="px-2.5 py-2 text-xs text-muted">All built-in tools added</p>}
                  {availableTools.map((t) => <MenuItem key={t} onSelect={() => m.addTool.mutate({ agentId: agent.id, name: t })}>{BUILTIN_TOOL_LABELS[t]}</MenuItem>)}
                  <MenuLabel>Integrations</MenuLabel>
                  <p className="px-2.5 pb-2 text-xs text-muted">Connect Slack, Gmail, Notion and more on the Integrations page.</p>
                </MenuContent>
              </Menu>
            )}
          </div>
        </div>
        <div className="space-y-3 rounded-xl bg-surface-2 p-3 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span><span className="block font-medium">Entry agent</span><span className="text-xs text-muted">Receives every new request first</span></span>
            <Switch checked={agent.isEntry} disabled={readOnly || agent.isEntry} onCheckedChange={(v) => v && save({ isEntry: true })} label="Entry agent" />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span><span className="block font-medium">Lock</span><span className="text-xs text-muted">Prevent AI edits and changes</span></span>
            <Switch checked={agent.locked} disabled={!canEdit} onCheckedChange={(v) => save({ locked: v })} label="Lock agent" />
          </label>
        </div>
        {isDeveloper && (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Developer</p>
            <div>
              <Label htmlFor="ag-fw">Framework override</Label>
              <Select id="ag-fw" disabled={readOnly} value={agent.framework ?? ''} onChange={(e) => save({ framework: (e.target.value || null) as UpdateAgentInput['framework'] })}>
                <option value="">Use project framework</option>
                {(['lyzr_adk', 'langgraph', 'crewai', 'openai_agents'] as const).map((f) => <option key={f} value={f}>{FRAMEWORK_LABELS[f]}</option>)}
              </Select>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">Agent key</p>
              <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                <code className="flex-1 truncate font-mono text-xs">{agent.key}</code>
                <button aria-label="Copy agent key" className="text-muted hover:text-fg" onClick={() => navigator.clipboard.writeText(agent.key).then(() => toast.success('Copied'))}><Copy className="size-3.5" /></button>
              </div>
            </div>
          </div>
        )}
      </div>

      {canEdit && (
        <div className="border-t border-border p-4">
          <Button variant="danger" className="w-full" disabled={agent.locked} onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" aria-hidden />Delete agent</Button>
        </div>
      )}
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete ${agent.name}?`} body="Its hand-offs and tools are removed too." confirmLabel="Delete agent"
        loading={m.deleteAgent.isPending} onConfirm={() => m.deleteAgent.mutate(agent.id, { onSuccess: () => { setConfirmDelete(false); onClose() } })} />
    </aside>
  )
}
