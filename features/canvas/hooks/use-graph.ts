'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { ApiError, apiFetch } from '@/lib/api/client'
import type { AgentDto, AgentGraphDto, CreateAgentInput, EdgeDto, UpdateAgentInput } from '@/lib/contracts/agents'
import { createClient } from '@/lib/supabase/client'

export const graphKey = (projectId: string) => ['graph', projectId] as const

export function useGraph(projectId: string) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: graphKey(projectId),
    queryFn: ({ signal }) => apiFetch<AgentGraphDto>(`/api/projects/${projectId}/agents`, { signal }),
  })

  // Realtime: refresh when collaborators change agents or hand-offs.
  useEffect(() => {
    let supabase: ReturnType<typeof createClient>
    try { supabase = createClient() } catch { return }
    // Unique topic per subscription: React strict mode mounts effects twice in development, and
    // supabase.channel() returns an already-subscribed channel for a reused topic, which rejects new .on() calls.
    const topic = `graph:${projectId}:${Math.random().toString(36).slice(2, 10)}`
    const channel = supabase
      .channel(topic)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents', filter: `project_id=eq.${projectId}` }, () => qc.invalidateQueries({ queryKey: graphKey(projectId) }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_edges', filter: `project_id=eq.${projectId}` }, () => qc.invalidateQueries({ queryKey: graphKey(projectId) }))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, qc])

  return query
}

function onError(e: unknown, fallback: string) {
  toast.error(e instanceof ApiError ? e.message : fallback)
}

export function useGraphMutations(projectId: string) {
  const qc = useQueryClient()
  const key = graphKey(projectId)
  const snapshot = () => qc.getQueryData<AgentGraphDto>(key)
  const restore = (s: AgentGraphDto | undefined) => s && qc.setQueryData(key, s)
  const patchCache = (fn: (g: AgentGraphDto) => AgentGraphDto) => qc.setQueryData<AgentGraphDto>(key, (g) => (g ? fn(g) : g))

  const addAgent = useMutation({
    mutationFn: (input: CreateAgentInput) => apiFetch<{ agent: AgentDto }>(`/api/projects/${projectId}/agents`, { body: input }),
    onSuccess: ({ agent }) => patchCache((g) => ({ ...g, agents: [...g.agents, agent] })),
    onError: (e) => onError(e, 'Could not add agent'),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const updateAgent = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAgentInput }) => apiFetch<{ agent: AgentDto }>(`/api/projects/${projectId}/agents/${id}`, { method: 'PATCH', body: input }),
    onMutate: ({ id, input }) => {
      const s = snapshot()
      patchCache((g) => ({
        ...g,
        agents: g.agents.map((a) => {
          if (input.isEntry && a.id !== id) return { ...a, isEntry: false }
          if (a.id !== id) return a
          const { isEntry, ...rest } = input
          return { ...a, ...rest, isEntry: isEntry ?? a.isEntry } as AgentDto
        }),
      }))
      return { s }
    },
    onError: (e, _v, ctx) => { restore(ctx?.s); onError(e, 'Could not save agent') },
    onSuccess: ({ agent }) => patchCache((g) => ({ ...g, agents: g.agents.map((a) => (a.id === agent.id ? agent : a)) })),
  })

  const deleteAgent = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/projects/${projectId}/agents/${id}`, { method: 'DELETE' }),
    onMutate: (id) => {
      const s = snapshot()
      patchCache((g) => ({ agents: g.agents.filter((a) => a.id !== id), edges: g.edges.filter((e) => e.fromAgentId !== id && e.toAgentId !== id) }))
      return { s }
    },
    onError: (e, _v, ctx) => { restore(ctx?.s); onError(e, 'Could not delete agent') },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const addEdge = useMutation({
    mutationFn: (input: { fromAgentId: string; toAgentId: string; condition?: string }) => apiFetch<{ edge: EdgeDto }>(`/api/projects/${projectId}/edges`, { body: { condition: '', ...input } }),
    onSuccess: ({ edge }) => patchCache((g) => ({ ...g, edges: [...g.edges, edge] })),
    onError: (e) => onError(e, 'Could not connect agents'),
  })

  const updateEdge = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { condition?: string; label?: string | null } }) => apiFetch<{ edge: EdgeDto }>(`/api/projects/${projectId}/edges/${id}`, { method: 'PATCH', body: input }),
    onSuccess: ({ edge }) => patchCache((g) => ({ ...g, edges: g.edges.map((e) => (e.id === edge.id ? edge : e)) })),
    onError: (e) => onError(e, 'Could not update hand-off'),
  })

  const deleteEdge = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/projects/${projectId}/edges/${id}`, { method: 'DELETE' }),
    onMutate: (id) => { const s = snapshot(); patchCache((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== id) })); return { s } },
    onError: (e, _v, ctx) => { restore(ctx?.s); onError(e, 'Could not remove hand-off') },
  })

  const addTool = useMutation({
    mutationFn: ({ agentId, name }: { agentId: string; name: string }) => apiFetch<{ tool: AgentDto['tools'][number] }>(`/api/projects/${projectId}/agents/${agentId}/tools`, { body: { toolType: 'builtin', name } }),
    onSuccess: ({ tool }, { agentId }) => patchCache((g) => ({ ...g, agents: g.agents.map((a) => (a.id === agentId ? { ...a, tools: [...a.tools, tool] } : a)) })),
    onError: (e) => onError(e, 'Could not add tool'),
  })

  const removeTool = useMutation({
    mutationFn: ({ agentId, toolId }: { agentId: string; toolId: string }) => apiFetch<void>(`/api/projects/${projectId}/agents/${agentId}/tools/${toolId}`, { method: 'DELETE' }),
    onMutate: ({ agentId, toolId }) => { const s = snapshot(); patchCache((g) => ({ ...g, agents: g.agents.map((a) => (a.id === agentId ? { ...a, tools: a.tools.filter((t) => t.id !== toolId) } : a)) })); return { s } },
    onError: (e, _v, ctx) => { restore(ctx?.s); onError(e, 'Could not remove tool') },
  })

  return { addAgent, updateAgent, deleteAgent, addEdge, updateEdge, deleteEdge, addTool, removeTool }
}
