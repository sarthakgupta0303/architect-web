'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Check, ClipboardList, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { ApiError, apiFetch } from '@/lib/api/client'
import type { PrdContent, PrdDto } from '@/lib/contracts/generation'

/** Minimal, safe markdown: headings, bullets, numbered lists, bold, inline code. No HTML injection. */
function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: JSX.Element[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(<Tag key={blocks.length} className={list.ordered ? 'ml-5 list-decimal space-y-1' : 'ml-5 list-disc space-y-1'}>{list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</Tag>)
    list = null
  }
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('`') ? <code key={i} className="rounded bg-surface-2 px-1 font-mono text-xs">{part.slice(1, -1)}</code> : part)
  lines.forEach((line) => {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    const num = line.match(/^\s*\d+\.\s+(.*)$/)
    if (bullet || num) {
      const ordered = !!num
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] } }
      list.items.push((bullet ?? num)![1])
      return
    }
    flush()
    if (!line.trim()) return
    blocks.push(<p key={blocks.length}>{inline(line)}</p>)
  })
  flush()
  return <div className="space-y-2 text-sm leading-relaxed text-fg/90">{blocks}</div>
}

export function PrdPanel({ projectId, canEdit, onGenerate }: { projectId: string; canEdit: boolean; onGenerate: () => void }) {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['prd', projectId], queryFn: () => apiFetch<{ prd: PrdDto | null }>(`/api/projects/${projectId}/prd`) })
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ title: '', body: '' })
  const save = useMutation({
    mutationFn: (content: PrdContent) => apiFetch<{ prd: PrdDto }>(`/api/projects/${projectId}/prd`, { method: 'PUT', body: { content } }),
    onSuccess: (res) => { qc.setQueryData(['prd', projectId], res); setEditing(null); toast.success(`Saved as version ${res.prd.version}`) },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save PRD'),
  })

  if (query.isLoading) return <div className="mx-auto max-w-3xl space-y-4 p-8">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
  if (query.isError) return <ErrorState message="Could not load the PRD" onRetry={() => query.refetch()} />
  const prd = query.data?.prd
  if (!prd) {
    return <EmptyState icon={ClipboardList} className="h-full" title="No PRD yet" body="Describe your app in the chat and I’ll write a product requirements document you can edit before anything is built."
      action={canEdit && <Button onClick={onGenerate}>Plan from prompt</Button>} />
  }

  const content = prd.content
  function commit(sections: PrdContent['sections']) { save.mutate({ ...content, sections }) }

  return (
    <div className="h-full overflow-y-auto">
      <article className="mx-auto max-w-3xl px-6 py-8">
        <header className="mb-8">
          <p className="text-xs text-muted">Version {prd.version} · updated {formatDistanceToNow(new Date(prd.createdAt), { addSuffix: true })}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{content.title}</h1>
          <p className="mt-2 text-muted">{content.summary}</p>
        </header>
        <div className="space-y-4">
          {content.sections.map((s, idx) => (
            <section key={`${s.key}-${idx}`} className="group rounded-xl border border-border bg-surface p-5">
              {editing === s.key ? (
                <div className="space-y-3">
                  <Input value={draft.title} maxLength={120} aria-label="Section title" onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
                  <Textarea rows={8} value={draft.body} maxLength={8000} aria-label="Section content" className="font-mono text-xs" onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditing(null)}><X className="size-3.5" aria-hidden />Cancel</Button>
                    <Button size="sm" loading={save.isPending} disabled={!draft.title.trim()}
                      onClick={() => commit(content.sections.map((x, i) => (i === idx ? { ...x, title: draft.title.trim(), bodyMd: draft.body } : x)))}><Check className="size-3.5" aria-hidden />Save</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-semibold">{s.title}</h2>
                    {canEdit && (
                      <div className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <Button variant="ghost" size="sm" onClick={() => { setDraft({ title: s.title, body: s.bodyMd }); setEditing(s.key) }}><Pencil className="size-3.5" aria-hidden />Edit</Button>
                        {content.sections.length > 1 && <Button variant="ghost" size="sm" aria-label={`Remove ${s.title}`} onClick={() => commit(content.sections.filter((_, i) => i !== idx))}><Trash2 className="size-3.5" /></Button>}
                      </div>
                    )}
                  </div>
                  <Markdown text={s.bodyMd} />
                </>
              )}
            </section>
          ))}
        </div>
        {canEdit && (
          <Button variant="secondary" className="mt-4" onClick={() => {
            const key = `custom_${Date.now().toString(36).slice(-5)}`.replace(/[^a-z_]/g, 'x')
            commit([...content.sections, { key, title: 'New section', bodyMd: 'Describe this part of the product.' }])
          }}><Plus className="size-4" aria-hidden />Add section</Button>
        )}
      </article>
    </div>
  )
}
