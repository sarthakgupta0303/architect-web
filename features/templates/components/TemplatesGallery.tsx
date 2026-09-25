'use client'

import { useQuery } from '@tanstack/react-query'
import { Bot, LayoutTemplate, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageContainer, PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Chips } from '@/components/ui/Chips'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Select } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Tooltip } from '@/components/ui/Tooltip'
import { useWorkspace } from '@/features/workspace/context'
import { ApiError, apiFetch } from '@/lib/api/client'
import { atLeast } from '@/lib/authz'
import { FRAMEWORK_LABELS } from '@/lib/contracts/common'
import { catalogEntry } from '@/lib/core/integrations/catalog'
import { UseTemplateDialog, type TemplateSummary } from './UseTemplateDialog'

const CATEGORIES = [
  { value: 'support', label: 'Support' }, { value: 'sales', label: 'Sales' }, { value: 'ops', label: 'Operations' },
  { value: 'research', label: 'Research' }, { value: 'content', label: 'Content' }, { value: 'hr', label: 'HR' },
  { value: 'voice', label: 'Voice' }, { value: 'other', label: 'Other' },
] as const
type Category = (typeof CATEGORIES)[number]['value']

const integrationName = (p: string) => catalogEntry(p)?.name ?? p

export function TemplatesGallery() {
  const { role } = useWorkspace()
  const canCreate = atLeast(role, 'editor')
  const [category, setCategory] = useState<Category | null>(null)
  const [framework, setFramework] = useState('')
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<TemplateSummary | null>(null)
  const [using, setUsing] = useState<TemplateSummary | null>(null)

  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: () => apiFetch<{ items: TemplateSummary[] }>('/api/templates'),
    staleTime: 5 * 60_000,
  })

  const items = templates.data?.items ?? []
  const frameworks = useMemo(() => [...new Set(items.map((t) => t.framework))], [items])
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((t) => (!category || t.category === category) && (!framework || t.framework === framework) &&
      (!needle || `${t.name} ${t.description}`.toLowerCase().includes(needle)))
  }, [items, category, framework, q])
  const presentCategories = CATEGORIES.filter((c) => items.some((t) => t.category === c.value))

  return (
    <PageContainer>
      <PageHeader title="Templates" description="Production-ready agent blueprints. Answer a few questions and get the full agent graph, PRD and app." />

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Chips label="Category" value={category} onChange={setCategory} options={presentCategories.map((c) => ({ value: c.value, label: c.label }))} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select aria-label="Framework" value={framework} onChange={(e) => setFramework(e.target.value)} className="sm:w-48">
            <option value="">All frameworks</option>
            {frameworks.map((f) => <option key={f} value={f}>{FRAMEWORK_LABELS[f] ?? f}</option>)}
          </Select>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input aria-label="Search templates" placeholder="Search templates" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
        </div>
      </div>

      <div className="mt-6">
        {templates.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}</div>
        ) : templates.isError ? (
          <ErrorState message={templates.error instanceof ApiError ? templates.error.message : 'Could not load templates'} onRetry={() => templates.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={LayoutTemplate} title="No templates published yet" body="Run database.sql (it includes the seed) to add the eight official templates." />
        ) : visible.length === 0 ? (
          <EmptyState icon={Search} title="No templates match" body="Try another category, framework or search."
            action={<Button variant="secondary" onClick={() => { setCategory(null); setFramework(''); setQ('') }}>Clear filters</Button>} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((t) => (
              <li key={t.slug} className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
                <GraphThumb template={t} />
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-medium">{t.name}</h2>
                    <Badge className="shrink-0 font-mono">{FRAMEWORK_LABELS[t.framework] ?? t.framework}</Badge>
                  </div>
                  <p className="mt-1.5 line-clamp-2 flex-1 text-sm text-muted">{t.description}</p>
                  <p className="mt-3 text-xs text-muted">
                    {t.agentsCount} agents{t.integrations.length ? ` · ${t.integrations.map(integrationName).join(', ')}` : ''}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setPreview(t)}>Preview</Button>
                    {canCreate ? (
                      <Button size="sm" onClick={() => setUsing(t)}>Use template</Button>
                    ) : (
                      <Tooltip content="Viewers can’t create projects"><span tabIndex={0}><Button size="sm" disabled>Use template</Button></span></Tooltip>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)} title={preview?.name ?? ''} description={preview?.description} size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => setPreview(null)}>Close</Button>
          {canCreate && <Button onClick={() => { setUsing(preview); setPreview(null) }}>Use template</Button>}
        </>}>
        {preview && (
          <div className="grid gap-5">
            <GraphThumb template={preview} large />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Agents</h3>
                <ul className="mt-2 space-y-1.5">
                  {preview.agents.map((a) => (
                    <li key={a.key} className="flex items-center gap-2 text-sm"><Bot className="size-4 text-primary-text" aria-hidden />{a.name}<span className="text-xs text-muted">{a.type}</span></li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Integrations</h3>
                <p className="mt-2 text-sm text-muted">{preview.integrations.length ? preview.integrations.map(integrationName).join(', ') : 'None required'}</p>
                <h3 className="mt-4 text-sm font-semibold">Setup questions</h3>
                <p className="mt-2 text-sm text-muted">{preview.questions.length ? preview.questions.map((x) => x.label).join(' · ') : 'None'}</p>
              </div>
            </div>
          </div>
        )}
      </Dialog>
      <UseTemplateDialog template={using} onOpenChange={(o) => !o && setUsing(null)} />
    </PageContainer>
  )
}

/** Lightweight preview of the agent chain (entry → …), no canvas dependency. */
function GraphThumb({ template, large = false }: { template: TemplateSummary; large?: boolean }) {
  const agents = template.agents.slice(0, 5)
  return (
    <div className={`flex items-center gap-2 overflow-hidden border-b border-border bg-surface-2/60 px-5 ${large ? 'rounded-xl border py-8' : 'py-6'}`} aria-hidden>
      {agents.map((a, i) => (
        <div key={a.key} className="flex min-w-0 items-center gap-2">
          {i > 0 && <span className="h-px w-4 shrink-0 bg-border" />}
          <span className={`truncate rounded-lg border px-2.5 py-1 text-xs ${i === 0 ? 'border-primary/50 bg-primary/10 text-primary-text' : 'border-border bg-surface text-muted'}`}>{a.name}</span>
        </div>
      ))}
    </div>
  )
}
