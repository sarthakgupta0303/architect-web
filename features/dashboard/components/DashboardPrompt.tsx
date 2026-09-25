'use client'

import { useQuery } from '@tanstack/react-query'
import { FileArchive, Github, Sparkles, SquarePlus } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { PromptComposer } from '@/features/generation/components/PromptComposer'
import { ImportWizard } from '@/features/import/components/ImportWizard'
import { UseTemplateDialog, type TemplateSummary } from '@/features/templates/components/UseTemplateDialog'
import { useWorkspace } from '@/features/workspace/context'
import { ApiError, apiFetch } from '@/lib/api/client'
import { atLeast } from '@/lib/authz'
import { FRAMEWORK_LABELS } from '@/lib/contracts/common'
import { useCreateProject } from '../hooks/use-projects'

type Tab = 'build' | 'import' | 'template'

export function DashboardPrompt() {
  const { workspace, role } = useWorkspace()
  const router = useRouter()
  const params = useSearchParams()
  const create = useCreateProject()
  const [tab, setTab] = useState<Tab>('build')
  const [importSource, setImportSource] = useState<'github' | 'zip' | null>(null)
  const [template, setTemplate] = useState<TemplateSummary | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const canCreate = atLeast(role, 'editor')

  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: () => apiFetch<{ items: TemplateSummary[] }>('/api/templates'),
    enabled: tab === 'template',
    staleTime: 5 * 60_000,
  })

  // Hand off a prompt typed on the landing page before sign-in.
  useEffect(() => {
    let pending: string | null = null
    try { pending = sessionStorage.getItem('pending_prompt') } catch { pending = null }
    if (pending && canCreate) {
      try { sessionStorage.removeItem('pending_prompt') } catch { /* noop */ }
      startFromPrompt(pending)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (params.get('new') === '1') document.getElementById('dashboard-prompt')?.querySelector('textarea')?.focus()
  }, [params])

  async function startFromPrompt(prompt: string) {
    try {
      const { project } = await create.mutateAsync({ workspaceId: workspace.id, source: 'prompt', initialPrompt: prompt })
      router.push(`/w/${workspace.slug}/p/${project.id}/build?step=clarify`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not create the project')
    }
  }

  async function blank() {
    try {
      const { project } = await create.mutateAsync({ workspaceId: workspace.id, source: 'blank', name: 'Untitled project' })
      router.push(`/w/${workspace.slug}/p/${project.id}/build?tab=agents`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not create the project')
    }
  }

  async function demo() {
    setDemoLoading(true)
    try {
      const { projectId } = await apiFetch<{ projectId: string }>(`/api/workspaces/${workspace.slug}/demo`, { method: 'POST' })
      toast.success('Demo project ready — it includes a live deployment and 30 days of runs')
      router.push(`/w/${workspace.slug}/p/${projectId}/build?tab=studio`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not create the demo project')
      setDemoLoading(false)
    }
  }

  if (!canCreate) return null

  return (
    <section id="dashboard-prompt" aria-label="Start a project" className="rounded-2xl border border-border bg-surface/60 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Start from" value={tab} onChange={setTab} options={[{ value: 'build', label: 'Build' }, { value: 'import', label: 'Import' }, { value: 'template', label: 'Template' }]} />
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={demo} loading={demoLoading}><Sparkles className="size-4" aria-hidden /> Try the demo project</Button>
          <Button variant="ghost" size="sm" onClick={blank} disabled={create.isPending}><SquarePlus className="size-4" aria-hidden /> Blank project</Button>
        </div>
      </div>

      {tab === 'build' && <PromptComposer onSubmit={startFromPrompt} submitting={create.isPending} />}

      {tab === 'import' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ImportCard icon={Github} title="GitHub repository" body="LangGraph, CrewAI, OpenAI Agents SDK, Architect ADK or any Next.js app." onClick={() => setImportSource('github')} />
          <ImportCard icon={FileArchive} title="Zip upload" body="Upload a project archive, or an export from Architect v1, Lovable, Bolt or Replit." onClick={() => setImportSource('zip')} />
        </div>
      )}

      {tab === 'template' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.isLoading && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          {templates.isError && <p className="text-sm text-danger">Could not load templates. <button className="underline" onClick={() => templates.refetch()}>Retry</button></p>}
          {templates.data?.items.map((t) => (
            <button key={t.slug} onClick={() => setTemplate(t)} className="card-interactive rounded-xl border border-border bg-surface p-4 text-left">
              <p className="font-medium">{t.name}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{t.description}</p>
              <p className="mt-3 text-xs text-muted">{t.agentsCount} agents · <span className="font-mono">{FRAMEWORK_LABELS[t.framework] ?? t.framework}</span></p>
            </button>
          ))}
        </div>
      )}

      <ImportWizard source={importSource} onClose={() => setImportSource(null)} />
      <UseTemplateDialog template={template} onOpenChange={(o) => !o && setTemplate(null)} />
    </section>
  )
}

function ImportCard({ icon: Icon, title, body, onClick }: { icon: typeof Github; title: string; body: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card-interactive flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left">
      <span className="rounded-lg bg-surface-2 p-2 text-primary-text"><Icon className="size-5" aria-hidden /></span>
      <span><span className="block font-medium">{title}</span><span className="mt-1 block text-sm text-muted">{body}</span></span>
    </button>
  )
}
