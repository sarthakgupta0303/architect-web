'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/Card'
import { Input, Label, Select } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Switch'
import { useProject } from '../context'
import { FRAMEWORK_LABELS } from '@/lib/contracts/common'
import { ApiError, apiFetch } from '@/lib/api/client'
import type { ProjectDto } from '@/lib/contracts/projects'

export function SettingsPanel() {
  const { project, setProject, canEdit, canDelete } = useProject()
  const [description, setDescription] = useState(project.description ?? '')
  const [saving, setSaving] = useState(false)
  async function patch(body: Record<string, unknown>, ok = 'Settings saved') {
    setSaving(true)
    try {
      const { project: p } = await apiFetch<{ project: ProjectDto }>(`/api/projects/${project.id}`, { method: 'PATCH', body })
      setProject(p); toast.success(ok)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not save') } finally { setSaving(false) }
  }
  return (
    <div className="h-full overflow-y-auto"><div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
      <div><h1 className="text-xl font-semibold">Project settings</h1><p className="text-sm text-muted">Framework, language and defaults</p></div>
      <Card className="space-y-4">
        <div><Label htmlFor="desc">Description</Label><Input id="desc" value={description} maxLength={500} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== (project.description ?? '') && patch({ description })} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="fw">Agent framework</Label>
            <Select id="fw" disabled={!canEdit || saving} value={project.framework} onChange={(e) => patch({ framework: e.target.value }, 'Framework updated')}>
              {(['lyzr_adk', 'langgraph', 'crewai', 'openai_agents'] as const).map((f) => <option key={f} value={f}>{FRAMEWORK_LABELS[f]}</option>)}
            </Select>
          </div>
          <div><Label htmlFor="lang">Language</Label>
            <Select id="lang" disabled={!canEdit || saving} value={project.language} onChange={(e) => patch({ language: e.target.value }, 'Language updated')}>
              <option value="python">Python</option><option value="typescript">TypeScript</option>
            </Select>
          </div>
          <div><Label htmlFor="mode">Default mode</Label>
            <Select id="mode" disabled={!canEdit || saving} value={project.modeDefault} onChange={(e) => patch({ modeDefault: e.target.value })}>
              <option value="build">Build</option><option value="code">Code</option>
            </Select>
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">Commit every accepted change automatically<Switch checked={project.autoCommit} disabled={!canEdit} onCheckedChange={(v) => patch({ autoCommit: v })} label="Auto-commit" /></label>
      </Card>
      {canDelete && (
        <Card className="border-danger/40">
          <h2 className="font-semibold text-danger">Danger zone</h2>
          <p className="mt-1 text-sm text-muted">Delete this project from the dashboard’s project menu. Deleted projects can be restored for 30 days.</p>
        </Card>
      )}
    </div></div>
  )
}
