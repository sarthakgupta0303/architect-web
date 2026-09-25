'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { FieldError, Input, Label } from '@/components/ui/Input'
import { Alert } from '@/components/ui/States'
import { useCreateProject } from '@/features/dashboard/hooks/use-projects'
import { useWorkspace } from '@/features/workspace/context'
import { ApiError } from '@/lib/api/client'
import { FRAMEWORK_LABELS } from '@/lib/contracts/common'

export type TemplateSummary = {
  slug: string
  name: string
  description: string
  category: string
  framework: string
  agentsCount: number
  integrations: string[]
  questions: { id: string; label: string; type: 'text' | 'select'; required: boolean; placeholder?: string; options?: string[] }[]
  agents: { key: string; name: string; type: string }[]
}

export function UseTemplateDialog({ template, onOpenChange }: { template: TemplateSummary | null; onOpenChange: (o: boolean) => void }) {
  const { workspace } = useWorkspace()
  const router = useRouter()
  const create = useCreateProject()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAnswers({})
    setFieldErrors({})
    setError(null)
  }, [template?.slug])

  async function submit() {
    if (!template) return
    const missing = template.questions.filter((q) => q.required && !answers[q.id]?.trim())
    if (missing.length) {
      setFieldErrors(Object.fromEntries(missing.map((m) => [m.id, 'Required'])))
      return
    }
    try {
      const { project } = await create.mutateAsync({ workspaceId: workspace.id, source: 'template', templateSlug: template.slug, templateAnswers: answers })
      onOpenChange(false)
      router.push(`/w/${workspace.slug}/p/${project.id}/build?tab=agents`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the project')
    }
  }

  return (
    <Dialog open={!!template} onOpenChange={onOpenChange} title={template ? `Use “${template.name}”` : ''} description={template?.description} size="lg"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} loading={create.isPending}>Create project</Button></>}>
      {template && (
        <div className="grid gap-5">
          <div className="grid gap-3 rounded-xl bg-surface-2 p-4 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-muted">Agents</p><p className="mt-0.5 font-medium">{template.agents.map((a) => a.name).join(', ')}</p></div>
            <div><p className="text-xs text-muted">Framework</p><p className="mt-0.5 font-medium">{FRAMEWORK_LABELS[template.framework] ?? template.framework}</p></div>
            <div><p className="text-xs text-muted">Integrations</p><p className="mt-0.5 font-medium">{template.integrations.length ? template.integrations.join(', ') : 'None'}</p></div>
          </div>
          {error && <Alert>{error}</Alert>}
          {template.questions.map((q) => (
            <div key={q.id}>
              <Label htmlFor={`q-${q.id}`}>{q.label}{!q.required && <span className="font-normal text-muted"> (optional)</span>}</Label>
              <Input id={`q-${q.id}`} placeholder={q.placeholder} value={answers[q.id] ?? ''} maxLength={500} invalid={!!fieldErrors[q.id]}
                onChange={(e) => { setAnswers((a) => ({ ...a, [q.id]: e.target.value })); setFieldErrors((f) => ({ ...f, [q.id]: '' })) }} />
              <FieldError>{fieldErrors[q.id]}</FieldError>
            </div>
          ))}
          {template.questions.length === 0 && <p className="text-sm text-muted">No setup questions — the project is ready to customize.</p>}
        </div>
      )}
    </Dialog>
  )
}
