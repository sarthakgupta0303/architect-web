'use client'

import { AlertTriangle, CheckCircle2, FileArchive, GitBranch, Github, KeyRound, Loader2, Lock, Search, UploadCloud } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Label, Select } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Switch'
import { DemoBadge } from '@/components/shared/DemoBadge'
import { useWorkspace } from '@/features/workspace/context'
import { ApiError, apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { validateFileUpload } from '@/lib/security/inputValidator'
import { createClient } from '@/lib/supabase/client'

const DEMO_REPOS = [
  { owner: 'acme-ai', name: 'support-graph', private: true, framework: 'langgraph', branch: 'main', updated: '2 days ago' },
  { owner: 'acme-ai', name: 'sales-crew', private: true, framework: 'crewai', branch: 'main', updated: '1 week ago' },
  { owner: 'acme-ai', name: 'handoff-agents', private: false, framework: 'openai_agents', branch: 'develop', updated: '3 weeks ago' },
  { owner: 'acme-ai', name: 'marketing-site', private: false, framework: 'custom', branch: 'main', updated: '1 month ago' },
]

const DETECTED: Record<string, { stack: string[]; agents: { name: string; file: string; mappable: boolean; tools: string[] }[]; env: string[] }> = {
  langgraph: { stack: ['Python 3.11', 'LangGraph 0.2', 'FastAPI', 'Next.js 14 front end'], agents: [{ name: 'Router', file: 'agents/graph.py', mappable: true, tools: ['classify'] }, { name: 'Retriever', file: 'agents/graph.py', mappable: true, tools: ['vector_search'] }, { name: 'Writer', file: 'agents/writer.py', mappable: true, tools: [] }], env: ['OPENAI_API_KEY', 'PINECONE_API_KEY'] },
  crewai: { stack: ['Python 3.11', 'CrewAI 0.80', 'Flask'], agents: [{ name: 'Researcher', file: 'crew/agents.py', mappable: true, tools: ['serper'] }, { name: 'Qualifier', file: 'crew/agents.py', mappable: true, tools: [] }, { name: 'Emailer', file: 'crew/custom_mailer.py', mappable: false, tools: ['smtp'] }], env: ['OPENAI_API_KEY', 'SERPER_API_KEY', 'SMTP_PASSWORD'] },
  openai_agents: { stack: ['TypeScript', 'OpenAI Agents SDK', 'Next.js 14'], agents: [{ name: 'Triage', file: 'src/agents/triage.ts', mappable: true, tools: [] }, { name: 'Billing', file: 'src/agents/billing.ts', mappable: true, tools: ['stripe_lookup'] }], env: ['OPENAI_API_KEY', 'STRIPE_SECRET_KEY'] },
  custom: { stack: ['TypeScript', 'Next.js 14', 'Tailwind'], agents: [], env: [] },
}

const SCAN_STEPS = ['Fetching files', 'Detecting stack', 'Finding agents', 'Checking for secrets']

type Step = 'pick' | 'scan' | 'report'

export function ImportWizard({ source, onClose }: { source: 'github' | 'zip' | null; onClose: () => void }) {
  const { workspace } = useWorkspace()
  const router = useRouter()
  const [step, setStep] = useState<Step>('pick')
  const [query, setQuery] = useState('')
  const [repo, setRepo] = useState<(typeof DEMO_REPOS)[number] | null>(null)
  const [zipName, setZipName] = useState<string | null>(null)
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [scanIndex, setScanIndex] = useState(0)
  const [env, setEnv] = useState<Record<string, string>>({})
  const [keepHistory, setKeepHistory] = useState(true)
  const [twoWay, setTwoWay] = useState(true)
  const [finalizing, setFinalizing] = useState(false)

  useEffect(() => {
    if (source) { setStep('pick'); setRepo(null); setZipName(null); setScanIndex(0); setEnv({}) }
  }, [source])

  useEffect(() => {
    if (step !== 'scan') return
    if (scanIndex >= SCAN_STEPS.length) { setStep('report'); return }
    const t = setTimeout(() => setScanIndex((i) => i + 1), 700)
    return () => clearTimeout(t)
  }, [step, scanIndex])

  const framework = repo?.framework ?? 'langgraph'
  const report = DETECTED[framework]
  const repoName = repo ? repo.name : zipName?.replace(/\.zip$/i, '') ?? 'imported-project'
  const filtered = useMemo(() => DEMO_REPOS.filter((r) => r.name.includes(query.toLowerCase())), [query])

  async function finalize(openIn: 'build' | 'code') {
    setFinalizing(true)
    try {
      const name = repoName.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80)
      const { project } = await apiFetch<{ project: { id: string } }>('/api/projects', {
        body: { workspaceId: workspace.id, source: 'blank', name, framework: framework === 'custom' ? undefined : framework },
      })
      for (const [i, a] of report.agents.entries()) {
        await apiFetch(`/api/projects/${project.id}/agents`, {
          body: { name: a.name, type: 'autonomous', role: a.mappable ? `Imported from ${a.file}` : `Code agent in ${a.file}`, position: { x: i * 320, y: i % 2 ? 180 : 40 } },
        })
      }
      toast.success(`Imported ${name}`)
      onClose()
      router.push(`/w/${workspace.slug}/p/${project.id}/${openIn}${openIn === 'build' ? '?tab=agents' : ''}`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Import failed')
      setFinalizing(false)
    }
  }

  async function uploadZip() {
    if (!zipFile) return
    setUploading(true)
    try {
      const signed = await apiFetch<{ bucket: string; path: string; token: string }>('/api/uploads/sign', {
        body: { kind: 'import', workspaceId: workspace.id, filename: zipFile.name, contentType: zipFile.type, size: zipFile.size },
      })
      const { error } = await createClient().storage.from(signed.bucket).uploadToSignedUrl(signed.path, signed.token, zipFile, { contentType: zipFile.type })
      if (error) throw new Error(error.message)
      setScanIndex(0)
      setStep('scan')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Upload failed — please try again')
    } finally {
      setUploading(false)
    }
  }

  const title = step === 'report' ? 'Import report' : source === 'zip' ? 'Import a zip' : 'Import from GitHub'

  return (
    <Dialog open={!!source} onOpenChange={(o) => !o && onClose()} size="lg" title={title}
      description={step === 'report' ? 'We scanned your project. Nothing has been changed yet.' : 'Architect adds only an architect.json manifest — your code stays untouched.'}>
      <div className="mb-4 flex justify-end"><DemoBadge /></div>

      {step === 'pick' && source === 'github' && (
        <div className="grid gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input className="pl-9" placeholder="Search repositories" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search repositories" />
          </div>
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {filtered.map((r) => (
              <li key={r.name}>
                <button onClick={() => setRepo(r)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2', repo?.name === r.name && 'bg-primary/10')}>
                  <Github className="size-4 text-muted" aria-hidden />
                  <span className="flex-1"><span className="font-medium">{r.owner}/{r.name}</span><span className="block text-xs text-muted">Updated {r.updated}</span></span>
                  {r.private && <Lock className="size-3.5 text-muted" aria-label="Private" />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No repositories match</li>}
          </ul>
          {repo && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="branch">Branch</Label><Select id="branch" defaultValue={repo.branch}><option>{repo.branch}</option><option>main</option></Select></div>
              <div><Label htmlFor="subdir">Sub-folder <span className="font-normal text-muted">(optional)</span></Label><Input id="subdir" placeholder="apps/agent" /></div>
            </div>
          )}
          <div className="flex justify-end"><Button disabled={!repo} onClick={() => { setScanIndex(0); setStep('scan') }}>Scan repository</Button></div>
        </div>
      )}

      {step === 'pick' && source === 'zip' && (
        <div className="grid gap-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border px-6 py-12 text-center transition-colors hover:border-primary">
            <UploadCloud className="size-8 text-primary-text" aria-hidden />
            <span className="font-medium">{zipName ?? 'Drop a .zip here or click to browse'}</span>
            <span className="text-xs text-muted">Up to 200 MB · node_modules and .git are ignored</span>
            <input type="file" accept=".zip,application/zip" className="sr-only" onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const check = validateFileUpload({ name: f.name, type: f.type, size: f.size }, 'import')
              if (!check.ok) { toast.error(check.message); e.target.value = ''; return }
              setZipName(f.name)
              setZipFile(f)
            }} />
          </label>
          <div className="flex justify-end"><Button disabled={!zipFile} loading={uploading} onClick={uploadZip}><FileArchive className="size-4" aria-hidden /> Upload and scan</Button></div>
        </div>
      )}

      {step === 'scan' && (
        <ol className="grid gap-3 py-4" aria-live="polite">
          {SCAN_STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-sm">
              {i < scanIndex ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : i === scanIndex ? <Loader2 className="size-5 animate-spin text-info" aria-hidden /> : <span className="size-5 rounded-full border border-border" aria-hidden />}
              <span className={i > scanIndex ? 'text-muted' : ''}>{s}</span>
            </li>
          ))}
        </ol>
      )}

      {step === 'report' && (
        <div className="grid gap-5">
          <section>
            <h3 className="text-sm font-semibold">Detected stack</h3>
            <div className="mt-2 flex flex-wrap gap-2">{report.stack.map((s) => <Badge key={s} tone="primary">{s}</Badge>)}</div>
          </section>
          <section>
            <h3 className="text-sm font-semibold">Agents found ({report.agents.length})</h3>
            {report.agents.length === 0 ? <p className="mt-1 text-sm text-muted">No agents detected — you can add them on the canvas after import.</p> : (
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                {report.agents.map((a) => (
                  <li key={a.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span><span className="font-medium">{a.name}</span> <span className="font-mono text-xs text-muted">{a.file}</span></span>
                    {a.mappable ? <Badge tone="success">Mapped to canvas</Badge> : <Badge tone="neutral">Code agent</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {report.env.length > 0 && (
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4 text-warning" aria-hidden /> Needs attention</h3>
              <p className="mt-1 text-sm text-muted">These environment variables are used but not set. Values are encrypted and never shown again.</p>
              <div className="mt-3 grid gap-3">
                {report.env.map((name) => (
                  <div key={name} className="grid items-center gap-2 sm:grid-cols-[200px_1fr]">
                    <Label htmlFor={`env-${name}`} className="mb-0 flex items-center gap-1.5 font-mono text-xs"><KeyRound className="size-3.5 text-muted" aria-hidden />{name}</Label>
                    <Input id={`env-${name}`} type="password" autoComplete="off" placeholder="Paste value (optional now)" value={env[name] ?? ''} onChange={(e) => setEnv((v) => ({ ...v, [name]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="grid gap-3 rounded-xl bg-surface-2 p-4 text-sm">
            <label className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><GitBranch className="size-4 text-muted" aria-hidden /> Keep Git history</span><Switch checked={keepHistory} onCheckedChange={setKeepHistory} label="Keep Git history" /></label>
            {source === 'github' && <label className="flex items-center justify-between gap-3"><span>Two-way sync with GitHub</span><Switch checked={twoWay} onCheckedChange={setTwoWay} label="Two-way sync" /></label>}
            <p className="text-xs text-muted">Architect changes go to a new branch <span className="font-mono">architect/import</span>.</p>
          </section>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => finalize('code')} loading={finalizing}>Open in Code mode</Button>
            <Button onClick={() => finalize('build')} loading={finalizing}>Open in Build mode</Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
