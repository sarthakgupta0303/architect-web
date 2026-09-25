import type { AgentGraphDto } from '@/lib/contracts/agents'
import type { ProjectDto } from '@/lib/contracts/projects'

export type VFile = { path: string; content: string; language: string }

const lang = (p: string) => (p.endsWith('.py') ? 'python' : p.endsWith('.ts') || p.endsWith('.tsx') ? 'typescript' : p.endsWith('.json') ? 'json' : p.endsWith('.md') ? 'markdown' : 'plaintext')

/** Builds the project's file tree from the agent graph (framework-adapter output, docs/specs/framework-adapters.md). */
export function generateFiles(project: ProjectDto, graph: AgentGraphDto): VFile[] {
  const entry = graph.agents.find((a) => a.isEntry) ?? graph.agents[0]
  const keyById = new Map(graph.agents.map((a) => [a.id, a.key]))
  const neutral = {
    version: 1,
    framework: project.framework,
    language: project.language,
    entry: entry?.key ?? null,
    agents: graph.agents.map((a) => ({ key: a.key, name: a.name, type: a.type, model: a.model, instructionsFile: `agents/prompts/${a.key}.md`, tools: a.tools.map((t) => t.name), memory: a.memory, managed: a.managed })),
    edges: graph.edges.map((e) => ({ from: keyById.get(e.fromAgentId), to: keyById.get(e.toAgentId), condition: e.condition, label: e.label })),
  }
  const py = project.language === 'python'
  const files: Omit<VFile, 'language'>[] = [
    { path: 'architect.json', content: JSON.stringify({ runtime: py ? 'python3.11' : 'node20', startCommand: py ? 'uvicorn app.main:app --port 8000' : 'node dist/server.js', web: { dir: 'web', startCommand: 'pnpm dev --port 3000' }, env: ['OPENAI_API_KEY'] }, null, 2) },
    { path: 'agents.architect.json', content: JSON.stringify(neutral, null, 2) },
    { path: 'README.md', content: `# ${project.name}\n\n${project.description ?? project.initialPrompt ?? 'An agentic app built with Architect.'}\n\n## Run locally\n\n\`\`\`bash\narchitect pull\narchitect dev\n\`\`\`\n` },
    { path: 'ARCHITECT.md', content: '# Project rules\n\n- Keep replies under 120 words.\n- Never promise refunds.\n- Cite sources for factual answers.\n' },
  ]
  graph.agents.forEach((a) => {
    const tools = a.tools.map((t) => t.name)
    const outs = graph.edges.filter((e) => e.fromAgentId === a.id)
    const body = py
      ? `# <architect:managed id="agent:${a.key}">\n${a.key} = Agent(\n    name=${JSON.stringify(a.name)},\n    model=${JSON.stringify(a.model ?? 'default')},\n    instructions=load_prompt(${JSON.stringify(a.key)}),\n    tools=[${tools.map((t) => `tools.${t}`).join(', ')}],\n    memory=${JSON.stringify(a.memory.mode)},\n)\n# </architect:managed>\n${outs.length ? `\n# <architect:managed id="edges:${a.key}">\n${outs.map((e) => `${a.key}.handoff(to=${keyById.get(e.toAgentId)}${e.condition ? `, when=${JSON.stringify(e.condition)}` : ''})`).join('\n')}\n# </architect:managed>\n` : ''}`
      : `// <architect:managed id="agent:${a.key}">\nexport const ${a.key} = new Agent({\n  name: ${JSON.stringify(a.name)},\n  model: ${JSON.stringify(a.model ?? 'default')},\n  instructions: loadPrompt(${JSON.stringify(a.key)}),\n  tools: [${tools.map((t) => `tools.${t}`).join(', ')}],\n})\n// </architect:managed>\n`
    const header = py ? `from architect_runtime import Agent, load_prompt, tools\n\n` : `import { Agent, loadPrompt, tools } from '@architect/runtime'\n\n`
    files.push({ path: `agents/${a.key}.${py ? 'py' : 'ts'}`, content: header + body })
    files.push({ path: `agents/prompts/${a.key}.md`, content: a.instructions ?? `You are ${a.name}. ${a.role ?? ''}` })
  })
  files.push(py
    ? { path: 'app/main.py', content: 'from architect_runtime.protocol import create_app\nfrom agents.graph import graph\n\napp = create_app(graph)  # serves /health, /invoke, /stream, /resume, /graph, /config\n' }
    : { path: 'src/server.ts', content: "import { createServer } from '@architect/runtime/protocol'\nimport { graph } from './graph'\n\ncreateServer(graph).listen(8000)\n" })
  files.push({ path: 'web/app/page.tsx', content: `import { ChatConsole } from '@/components/ChatConsole'\n\nexport default function Page() {\n  return <ChatConsole title=${JSON.stringify(project.name)} />\n}\n` })
  files.push({ path: `tests/test_${entry?.key ?? 'app'}.${py ? 'py' : 'ts'}`, content: py ? `def test_${entry?.key ?? 'app'}_responds(client):\n    res = client.post('/invoke', json={'input': 'hello'})\n    assert res.status_code == 200\n` : `test('responds', async () => {\n  const res = await invoke('hello')\n  expect(res.status).toBe(200)\n})\n` })
  return files.map((f) => ({ ...f, language: lang(f.path) })).sort((a, b) => a.path.localeCompare(b.path))
}
