import type { AgentDto, EdgeDto } from '@/lib/contracts/agents'

/** Layered left-to-right layout: BFS depth from the entry agent (cycles tolerated). */
export function autoLayout(agents: AgentDto[], edges: EdgeDto[]): Record<string, { x: number; y: number }> {
  const out = new Map<string, string[]>()
  edges.forEach((e) => out.set(e.fromAgentId, [...(out.get(e.fromAgentId) ?? []), e.toAgentId]))
  const entry = agents.find((a) => a.isEntry) ?? agents[0]
  const depth = new Map<string, number>()
  if (entry) {
    const queue = [entry.id]
    depth.set(entry.id, 0)
    while (queue.length) {
      const id = queue.shift()!
      for (const next of out.get(id) ?? []) {
        if (!depth.has(next)) { depth.set(next, (depth.get(id) ?? 0) + 1); queue.push(next) }
      }
    }
  }
  let maxDepth = Math.max(0, ...Array.from(depth.values()))
  agents.forEach((a) => { if (!depth.has(a.id)) depth.set(a.id, ++maxDepth) })
  const columns = new Map<number, string[]>()
  agents.forEach((a) => { const d = depth.get(a.id)!; columns.set(d, [...(columns.get(d) ?? []), a.id]) })
  const pos: Record<string, { x: number; y: number }> = {}
  columns.forEach((ids, d) => ids.forEach((id, i) => { pos[id] = { x: 60 + d * 340, y: 60 + i * 200 - ((ids.length - 1) * 200) / 2 + 200 } }))
  return pos
}
