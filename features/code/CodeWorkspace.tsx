'use client'

import { DiffEditor, Editor } from '@monaco-editor/react'
import { Bot, ChevronDown, ChevronRight, FileCode2, FileJson, FileText, Files, FolderClosed, GitBranch, Loader2, Search, Terminal as TerminalIcon, X } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Kbd } from '@/components/ui/Kbd'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { DemoBadge } from '@/components/shared/DemoBadge'
import { useGraph } from '@/features/canvas/hooks/use-graph'
import { useProject } from '@/features/project/context'
import { cn, sleep, scrollToEnd } from '@/lib/utils'
import { generateFiles, type VFile } from './files'

type Proposal = { path: string; before: string; after: string; summary: string }

export function CodeWorkspace() {
  const { project, isDeveloper } = useProject()
  const graph = useGraph(project.id)
  const { resolvedTheme } = useTheme()
  const [files, setFiles] = useState<VFile[] | null>(null)
  const [open, setOpen] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [panel, setPanel] = useState<'files' | 'search' | 'git'>('files')
  const [search, setSearch] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [committed, setCommitted] = useState<string[]>([])

  useEffect(() => {
    if (graph.data && !files) {
      const f = generateFiles(project, graph.data)
      setFiles(f)
      const first = f.find((x) => x.path.startsWith('agents/') && !x.path.includes('prompts')) ?? f[0]
      if (first) { setOpen([first.path]); setActive(first.path) }
    }
  }, [graph.data, files, project])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && active) {
        e.preventDefault()
        setDirty((d) => { const n = new Set(d); n.delete(active); return n })
        toast.success(`Saved ${active}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  const current = files?.find((f) => f.path === active) ?? null
  const matches = useMemo(() => (search.trim() && files ? files.flatMap((f) => f.content.split('\n').map((line, i) => ({ path: f.path, line: i + 1, text: line })).filter((l) => l.text.toLowerCase().includes(search.toLowerCase()))).slice(0, 200) : []), [search, files])

  function openFile(path: string) {
    setOpen((o) => (o.includes(path) ? o : [...o, path]))
    setActive(path)
  }
  function closeFile(path: string) {
    setOpen((o) => {
      const next = o.filter((p) => p !== path)
      if (active === path) setActive(next[next.length - 1] ?? null)
      return next
    })
  }

  if (!isDeveloper) return <ErrorState title="Code mode is limited to developers" message="Ask a workspace admin to mark you as a developer, or keep working in Build mode." />
  if (graph.isLoading || (!files && !graph.isError)) return <div className="grid h-full grid-cols-[260px_1fr] gap-4 p-4"><Skeleton className="h-full" /><Skeleton className="h-full" /></div>
  if (graph.isError || !files) return <ErrorState message="Could not load project files" onRetry={() => graph.refetch()} />

  return (
    <div className="flex h-full min-h-0">
      <nav aria-label="Code activities" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-2">
        {([['files', Files, 'Explorer'], ['search', Search, 'Search'], ['git', GitBranch, 'Source control']] as const).map(([k, Icon, label]) => (
          <button key={k} aria-label={label} aria-pressed={panel === k} onClick={() => setPanel(k)} className={cn('rounded-lg p-2', panel === k ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg')}><Icon className="size-5" /></button>
        ))}
      </nav>
      <aside className="w-64 shrink-0 overflow-y-auto border-r border-border bg-surface">
        {panel === 'files' && <Explorer files={files} active={active} dirty={dirty} onOpen={openFile} />}
        {panel === 'search' && (
          <div className="p-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search in files" aria-label="Search in files" className="h-8 w-full rounded-lg border border-border bg-bg px-2 text-sm focus:border-primary focus:outline-none" />
            <ul className="mt-3 space-y-1">
              {matches.map((m, i) => <li key={i}><button className="w-full truncate rounded px-1.5 py-1 text-left text-xs hover:bg-surface-2" onClick={() => openFile(m.path)}><span className="text-muted">{m.path}:{m.line}</span> <span className="font-mono">{m.text.trim()}</span></button></li>)}
              {search && matches.length === 0 && <li className="text-xs text-muted">No results</li>}
            </ul>
          </div>
        )}
        {panel === 'git' && <GitPanel dirty={[...dirty]} committed={committed} onCommit={(msg) => { setCommitted((c) => [msg, ...c]); setDirty(new Set()); toast.success('Committed on main') }} />}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div role="tablist" aria-label="Open files" className="flex shrink-0 overflow-x-auto border-b border-border bg-surface">
          {open.map((p) => (
            <div key={p} role="tab" aria-selected={active === p} className={cn('group flex items-center gap-2 border-r border-border px-3 py-2 text-xs', active === p ? 'bg-bg text-fg' : 'text-muted hover:text-fg')}>
              <button onClick={() => setActive(p)} className="font-mono">{p.split('/').pop()}{dirty.has(p) && <span className="ml-1 text-primary-text" aria-label="unsaved">●</span>}</button>
              <button aria-label={`Close ${p}`} onClick={() => closeFile(p)} className="opacity-60 hover:opacity-100"><X className="size-3" /></button>
            </div>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {proposal ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2 text-sm">
                <span><span className="font-medium">Proposed change</span> · <span className="font-mono text-xs text-muted">{proposal.path}</span> · {proposal.summary}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setProposal(null)}>Reject</Button>
                  <Button size="sm" onClick={() => {
                    setFiles((fs) => fs!.map((f) => (f.path === proposal.path ? { ...f, content: proposal.after } : f)))
                    setDirty((d) => new Set(d).add(proposal.path))
                    openFile(proposal.path)
                    setProposal(null)
                    toast.success('Change applied — checkpoint saved')
                  }}>Accept</Button>
                </div>
              </div>
              <DiffEditor original={proposal.before} modified={proposal.after} language={files.find((f) => f.path === proposal.path)?.language} theme={resolvedTheme === 'light' ? 'light' : 'vs-dark'}
                options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, fontFamily: 'JetBrains Mono Variable, monospace', fontSize: 13 }} loading={<Loader2 className="size-5 animate-spin text-muted" />} />
            </div>
          ) : current ? (
            <Editor path={current.path} value={current.content} language={current.language} theme={resolvedTheme === 'light' ? 'light' : 'vs-dark'}
              onChange={(v) => { setFiles((fs) => fs!.map((f) => (f.path === current.path ? { ...f, content: v ?? '' } : f))); setDirty((d) => new Set(d).add(current.path)) }}
              options={{ minimap: { enabled: false }, fontFamily: 'JetBrains Mono Variable, monospace', fontSize: 13, scrollBeyondLastLine: false, padding: { top: 12 } }}
              loading={<Loader2 className="size-5 animate-spin text-muted" />} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">Open a file from the explorer · <Kbd>⌘</Kbd><Kbd>S</Kbd> saves</div>
          )}
        </div>
        <Terminal files={files} />
      </section>

      <aside className="hidden w-[340px] shrink-0 border-l border-border bg-surface xl:block">
        <CodingAgent files={files} active={active} onPropose={setProposal} />
      </aside>
    </div>
  )
}

function iconFor(path: string) {
  if (path.endsWith('.json')) return FileJson
  if (path.endsWith('.md')) return FileText
  return FileCode2
}

function Explorer({ files, active, dirty, onOpen }: { files: VFile[]; active: string | null; dirty: Set<string>; onOpen: (p: string) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const tree = useMemo(() => {
    const dirs = new Map<string, VFile[]>()
    files.forEach((f) => { const d = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''; dirs.set(d, [...(dirs.get(d) ?? []), f]) })
    return [...dirs.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [files])
  return (
    <div className="py-2 text-sm">
      <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted">Explorer</p>
      {tree.map(([dir, fs]) => (
        <div key={dir || 'root'}>
          {dir && (
            <button className="flex w-full items-center gap-1 px-2 py-1 text-left text-xs text-muted hover:text-fg" onClick={() => setCollapsed((c) => { const n = new Set(c); n.has(dir) ? n.delete(dir) : n.add(dir); return n })}>
              {collapsed.has(dir) ? <ChevronRight className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}<FolderClosed className="size-3.5" aria-hidden />{dir}
            </button>
          )}
          {!collapsed.has(dir) && fs.map((f) => {
            const Icon = iconFor(f.path)
            return (
              <button key={f.path} onClick={() => onOpen(f.path)} className={cn('flex w-full items-center gap-2 py-1 pr-2 text-left text-xs', dir ? 'pl-8' : 'pl-3', active === f.path ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg')}>
                <Icon className="size-3.5 shrink-0" aria-hidden /><span className="truncate font-mono">{f.path.split('/').pop()}</span>{dirty.has(f.path) && <span className="ml-auto text-primary-text">M</span>}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function GitPanel({ dirty, committed, onCommit }: { dirty: string[]; committed: string[]; onCommit: (msg: string) => void }) {
  const [message, setMessage] = useState('')
  return (
    <div className="p-3 text-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Changes ({dirty.length})</p>
      <ul className="mt-2 space-y-1">{dirty.map((p) => <li key={p} className="flex justify-between font-mono text-xs"><span className="truncate">{p}</span><span className="text-warning">M</span></li>)}</ul>
      {dirty.length === 0 && <p className="mt-2 text-xs text-muted">No changes</p>}
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Commit message" aria-label="Commit message" className="mt-3 w-full resize-none rounded-lg border border-border bg-bg px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
      <Button size="sm" className="mt-2 w-full" disabled={dirty.length === 0} onClick={() => { onCommit(message.trim() || `Update ${dirty.length} file${dirty.length > 1 ? 's' : ''}`); setMessage('') }}>Commit</Button>
      {committed.length > 0 && <><p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">History</p><ul className="mt-2 space-y-1">{committed.map((c, i) => <li key={i} className="truncate text-xs text-muted">● {c}</li>)}</ul></>}
    </div>
  )
}

function Terminal({ files }: { files: VFile[] }) {
  const [open, setOpen] = useState(true)
  const [lines, setLines] = useState<string[]>(['Architect sandbox · type "help"'])
  const [cmd, setCmd] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { scrollToEnd(end.current, false) }, [lines])
  async function exec(c: string) {
    const out: string[] = [`$ ${c}`]
    const [bin, ...args] = c.trim().split(/\s+/)
    if (bin === 'help') out.push('Available: ls, cat <file>, pytest, git status, clear')
    else if (bin === 'ls') out.push(Array.from(new Set(files.map((f) => f.path.split('/')[0]))).join('  '))
    else if (bin === 'cat') out.push(files.find((f) => f.path === args[0])?.content ?? `cat: ${args[0] ?? ''}: No such file`)
    else if (bin === 'pytest' || (bin === 'npm' && args[0] === 'test')) { setLines((l) => [...l, `$ ${c}`, 'collecting…']); await sleep(900); out.shift(); out.push(`${files.filter((f) => f.path.startsWith('tests/')).length} passed in 0.84s`) }
    else if (bin === 'git' && args[0] === 'status') out.push('On branch main\nnothing to commit, working tree clean')
    else if (bin === 'clear') { setLines([]); return }
    else if (bin) out.push(`${bin}: command not available in the preview sandbox`)
    setLines((l) => [...l.filter((x) => x !== 'collecting…'), ...out])
  }
  return (
    <div className={cn('shrink-0 border-t border-border bg-surface', open ? 'h-48' : 'h-9')}>
      <div className="flex h-9 items-center justify-between px-3 text-xs">
        <button className="flex items-center gap-1.5 font-medium" onClick={() => setOpen((o) => !o)} aria-expanded={open}><TerminalIcon className="size-3.5" aria-hidden />Terminal</button>
        <DemoBadge />
      </div>
      {open && (
        <div className="h-[calc(100%-2.25rem)] overflow-y-auto px-3 pb-2 font-mono text-xs" onClick={() => document.getElementById('term-input')?.focus()}>
          {lines.map((l, i) => <pre key={i} className="whitespace-pre-wrap text-muted">{l}</pre>)}
          <form onSubmit={(e) => { e.preventDefault(); if (cmd.trim()) exec(cmd); setCmd('') }} className="flex gap-1"><span className="text-success">$</span>
            <input id="term-input" value={cmd} onChange={(e) => setCmd(e.target.value)} aria-label="Terminal input" autoComplete="off" className="flex-1 bg-transparent focus:outline-none" />
          </form>
          <div ref={end} />
        </div>
      )}
    </div>
  )
}

function CodingAgent({ files, active, onPropose }: { files: VFile[]; active: string | null; onPropose: (p: Proposal) => void }) {
  const [mode, setMode] = useState<'plan' | 'build'>('build')
  const [draft, setDraft] = useState('')
  const [log, setLog] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])
  const [busy, setBusy] = useState(false)
  async function send() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    setLog((l) => [...l, { role: 'user', text }])
    setBusy(true)
    await sleep(1100)
    setBusy(false)
    const target = files.find((f) => f.path === active && /\.(py|ts)$/.test(f.path)) ?? files.find((f) => /^agents\/[^/]+\.(py|ts)$/.test(f.path))
    if (mode === 'plan' || !target) {
      setLog((l) => [...l, { role: 'assistant', text: `Plan: 1) update ${target?.path ?? 'the agent file'} 2) add a test in tests/ 3) run the suite. Switch to Build to apply.` }])
      return
    }
    const py = target.path.endsWith('.py')
    const comment = py ? `# ${text.slice(0, 90)}` : `// ${text.slice(0, 90)}`
    const retry = py ? `\n\n@retry(attempts=3, backoff="exponential")\ndef call_tool(tool, **kwargs):\n    ${comment}\n    return tool(**kwargs)\n` : `\n\nexport const callTool = withRetry({ attempts: 3, backoff: 'exponential' }, (tool, args) => {\n  ${comment}\n  return tool(args)\n})\n`
    onPropose({ path: target.path, before: target.content, after: target.content + retry, summary: '1 file · +5 lines' })
    setLog((l) => [...l, { role: 'assistant', text: `I proposed a change to ${target.path}. Review the diff and accept or reject it.` }])
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2"><span className="flex items-center gap-2 text-sm font-medium"><Bot className="size-4 text-primary-text" aria-hidden />Coding agent</span><DemoBadge /></div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        {log.length === 0 && <p className="text-muted">Ask for a change, e.g. “Add retries with exponential backoff to tool calls”. Changes come back as diffs you approve.</p>}
        {log.map((m, i) => <p key={i} className={cn('rounded-xl px-3 py-2', m.role === 'user' ? 'ml-6 bg-primary text-primary-fg' : 'mr-6 bg-surface-2')}>{m.text}</p>)}
        {busy && <p className="flex items-center gap-2 text-xs text-muted"><Loader2 className="size-3.5 animate-spin" aria-hidden />Working…</p>}
      </div>
      <form className="border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send() }}>
        {active && <p className="mb-2 truncate text-xs text-muted">Context: <span className="font-mono">@{active}</span></p>}
        <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Describe a code change…" aria-label="Message the coding agent"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() } }}
          className="w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        <div className="mt-2 flex items-center justify-between"><Segmented size="sm" label="Agent mode" value={mode} onChange={setMode} options={[{ value: 'plan', label: 'Plan' }, { value: 'build', label: 'Build' }]} /><Button size="sm" type="submit" disabled={!draft.trim() || busy}>Send</Button></div>
      </form>
    </div>
  )
}
