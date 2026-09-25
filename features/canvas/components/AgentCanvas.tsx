'use client'

import {
  Background, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow,
  type Connection, type Edge, type Node, type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Bot, LayoutGrid, List, Network, Plus, Sparkles, UserCheck, Workflow } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { Input, Label } from '@/components/ui/Input'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Tooltip } from '@/components/ui/Tooltip'
import { ApiError } from '@/lib/api/client'
import type { AgentDto, EdgeDto } from '@/lib/contracts/agents'
import { useGraph, useGraphMutations } from '../hooks/use-graph'
import { autoLayout } from '../lib'
import { AgentInspector } from './AgentInspector'
import { AgentListView } from './AgentListView'
import { AgentNode, type AgentNodeData } from './AgentNode'

const nodeTypes = { agent: AgentNode }

type Props = { projectId: string; canEdit: boolean; isDeveloper: boolean; onGenerate?: () => void; generating?: boolean }

export function AgentCanvas(props: Props) {
  return <ReactFlowProvider><CanvasInner {...props} /></ReactFlowProvider>
}

function CanvasInner({ projectId, canEdit, isDeveloper, onGenerate, generating }: Props) {
  const graph = useGraph(projectId)
  const m = useGraphMutations(projectId)
  const flow = useReactFlow()
  const [nodes, setNodes] = useState<Node<AgentNodeData>[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'canvas' | 'list'>('canvas')
  const [edgeEdit, setEdgeEdit] = useState<EdgeDto | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AgentDto | null>(null)

  const agents = useMemo(() => graph.data?.agents ?? [], [graph.data])
  const edges = useMemo(() => graph.data?.edges ?? [], [graph.data])

  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]))
      return agents.map((a) => ({
        id: a.id,
        type: 'agent',
        position: prevById.get(a.id)?.dragging ? prevById.get(a.id)!.position : a.position,
        data: { agent: a },
        selected: a.id === selectedId,
        draggable: canEdit,
      }))
    })
  }, [agents, selectedId, canEdit])

  const rfEdges: Edge[] = useMemo(() => edges.map((e) => ({
    id: e.id,
    source: e.fromAgentId,
    target: e.toAgentId,
    label: e.label || e.condition || undefined,
    animated: !!e.condition,
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    labelBgStyle: { fill: 'rgb(var(--color-surface))' },
    labelStyle: { fill: 'rgb(var(--color-muted))', fontSize: 11 },
    labelBgPadding: [6, 3] as [number, number],
    labelBgBorderRadius: 6,
  })), [edges])

  const onNodesChange = useCallback((changes: NodeChange<Node<AgentNodeData>>[]) => {
    setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type !== 'remove'), ns))
  }, [])

  const onConnect = useCallback((c: Connection) => {
    if (!canEdit || !c.source || !c.target || c.source === c.target) return
    if (edges.some((e) => e.fromAgentId === c.source && e.toAgentId === c.target && e.condition === '')) return
    m.addEdge.mutate({ fromAgentId: c.source, toAgentId: c.target })
  }, [canEdit, edges, m.addEdge])

  function addAgent(type: 'autonomous' | 'workflow' | 'human_approval', at?: { x: number; y: number }) {
    const center = at ?? flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    const names = { autonomous: 'New agent', workflow: 'New workflow', human_approval: 'Approval' }
    m.addAgent.mutate(
      { name: names[type], type, position: { x: Math.round(center.x - 120), y: Math.round(center.y - 60) } },
      { onSuccess: ({ agent }) => setSelectedId(agent.id) },
    )
  }

  function layout() {
    const pos = autoLayout(agents, edges)
    agents.forEach((a) => {
      const p = pos[a.id]
      if (p && (p.x !== a.position.x || p.y !== a.position.y)) m.updateAgent.mutate({ id: a.id, input: { position: p } })
    })
    setTimeout(() => flow.fitView({ padding: 0.2, duration: 300 }), 150)
  }

  const selected = agents.find((a) => a.id === selectedId) ?? null

  if (graph.isLoading) {
    return <div className="flex h-full items-center justify-center gap-6 p-10" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-60 rounded-xl" />)}</div>
  }
  if (graph.isError) {
    return <ErrorState message={graph.error instanceof ApiError ? graph.error.message : 'Could not load agents'} onRetry={() => graph.refetch()} />
  }

  return (
    <div className="flex h-full">
      <div className="relative min-w-0 flex-1">
        <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-border bg-surface p-1 shadow-popover">
          {canEdit && (
            <Menu>
              <MenuTrigger asChild><Button size="sm"><Plus className="size-4" aria-hidden />Add agent</Button></MenuTrigger>
              <MenuContent align="start">
                <MenuItem onSelect={() => addAgent('autonomous')}><Sparkles className="size-4 text-primary-text" aria-hidden />Autonomous agent</MenuItem>
                <MenuItem onSelect={() => addAgent('workflow')}><Workflow className="size-4 text-info" aria-hidden />Workflow step</MenuItem>
                <MenuItem onSelect={() => addAgent('human_approval')}><UserCheck className="size-4 text-warning" aria-hidden />Human approval</MenuItem>
              </MenuContent>
            </Menu>
          )}
          {canEdit && agents.length > 1 && <Tooltip content="Auto-layout"><Button variant="ghost" size="icon" aria-label="Auto-layout" onClick={layout}><LayoutGrid className="size-4" /></Button></Tooltip>}
          <Tooltip content={view === 'canvas' ? 'List view' : 'Canvas view'}>
            <Button variant="ghost" size="icon" aria-label={view === 'canvas' ? 'Switch to list view' : 'Switch to canvas view'} onClick={() => setView((v) => (v === 'canvas' ? 'list' : 'canvas'))}>
              {view === 'canvas' ? <List className="size-4" /> : <Network className="size-4" />}
            </Button>
          </Tooltip>
          {!canEdit && <span className="px-2 text-xs text-muted">View only</span>}
        </div>

        {agents.length === 0 ? (
          <EmptyState icon={Bot} className="h-full" title="No agents yet"
            body="Add your first agent, or generate a full agent team from your prompt and PRD."
            action={canEdit && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={() => addAgent('autonomous', { x: 200, y: 160 })} loading={m.addAgent.isPending}><Plus className="size-4" aria-hidden />Add your first agent</Button>
                {onGenerate && <Button onClick={onGenerate} loading={generating}><Sparkles className="size-4" aria-hidden />Generate from prompt</Button>}
              </div>
            )} />
        ) : view === 'list' ? (
          <div className="h-full overflow-y-auto px-4 pb-6 pt-16">
            <AgentListView agents={agents} edges={edges} canEdit={canEdit} onEdit={setSelectedId} onDelete={(a) => setPendingDelete(a)} />
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={(_, node) => canEdit && m.updateAgent.mutate({ id: node.id, input: { position: { x: Math.round(node.position.x), y: Math.round(node.position.y) } } })}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            onEdgeClick={(_, e) => { const edge = edges.find((x) => x.id === e.id); if (edge && canEdit) setEdgeEdit(edge) }}
            onNodesDelete={() => undefined}
            onKeyDown={(e) => {
              if ((e.key === 'Delete' || e.key === 'Backspace') && selected && canEdit && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) setPendingDelete(selected)
            }}
            onDoubleClick={(e) => { if (canEdit && (e.target as HTMLElement).classList.contains('react-flow__pane')) addAgent('autonomous', flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })) }}
            zoomOnDoubleClick={false}
            nodesConnectable={canEdit}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1.2} color="rgb(var(--color-border))" />
            <Controls showInteractive={false} position="bottom-left" />
            {agents.length > 6 && <MiniMap pannable zoomable nodeColor="rgb(var(--color-primary) / 0.5)" maskColor="rgb(var(--color-bg) / 0.6)" />}
          </ReactFlow>
        )}
      </div>

      {selected && <AgentInspector key={selected.id} projectId={projectId} agent={selected} canEdit={canEdit} isDeveloper={isDeveloper} onClose={() => setSelectedId(null)} />}

      <EdgeDialog edge={edgeEdit} onClose={() => setEdgeEdit(null)}
        onSave={(input) => edgeEdit && m.updateEdge.mutate({ id: edgeEdit.id, input }, { onSuccess: () => setEdgeEdit(null) })}
        onDelete={() => edgeEdit && m.deleteEdge.mutate(edgeEdit.id, { onSuccess: () => setEdgeEdit(null) })}
        saving={m.updateEdge.isPending} />
      <ConfirmDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)} title={`Delete ${pendingDelete?.name ?? 'agent'}?`}
        body="Its hand-offs and tools are removed too." confirmLabel="Delete agent" loading={m.deleteAgent.isPending}
        onConfirm={() => pendingDelete && m.deleteAgent.mutate(pendingDelete.id, { onSuccess: () => { if (selectedId === pendingDelete.id) setSelectedId(null); setPendingDelete(null) }, onError: () => setPendingDelete(null) })} />
    </div>
  )
}

function EdgeDialog({ edge, onClose, onSave, onDelete, saving }: { edge: EdgeDto | null; onClose: () => void; onSave: (i: { condition: string; label: string | null }) => void; onDelete: () => void; saving: boolean }) {
  const [condition, setCondition] = useState('')
  const [label, setLabel] = useState('')
  useEffect(() => { setCondition(edge?.condition ?? ''); setLabel(edge?.label ?? '') }, [edge])
  return (
    <Dialog open={!!edge} onOpenChange={(o) => !o && onClose()} title="Edit hand-off" description="Leave the condition empty to always hand off."
      footer={<>
        <Button variant="danger" className="mr-auto" onClick={onDelete}>Remove hand-off</Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave({ condition: condition.trim(), label: label.trim() || null })} loading={saving}>Save</Button>
      </>}>
      <div className="grid gap-4">
        <div>
          <Label htmlFor="edge-cond">Condition</Label>
          <Input id="edge-cond" value={condition} maxLength={500} placeholder="e.g. sentiment < -0.5" className="font-mono" onChange={(e) => setCondition(e.target.value)} />
          <p className="mt-1.5 text-xs text-muted">Use a field from the previous agent’s output, like <code className="font-mono">intent == faq</code> or <code className="font-mono">amount &gt; 1000</code>.</p>
        </div>
        <div>
          <Label htmlFor="edge-label">Label <span className="font-normal text-muted">(optional)</span></Label>
          <Input id="edge-label" value={label} maxLength={80} placeholder="e.g. Unhappy customer" onChange={(e) => setLabel(e.target.value)} />
        </div>
      </div>
    </Dialog>
  )
}
