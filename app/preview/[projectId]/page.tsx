import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TestConsole } from '@/features/preview/TestConsole'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Preview' }

/** The built app's preview: a chat console for the entry agent with per-message traces (PRD Flow 2 step 7). */
export default async function PreviewPage({ params }: { params: { projectId: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.projectId)) notFound()
  const supabase = createClient()
  const [{ data: project }, { data: agents }, { data: edges }] = await Promise.all([
    supabase.from('projects').select('id, name, description').eq('id', params.projectId).is('deleted_at', null).maybeSingle(),
    supabase.from('agents').select('id, key, name, role, type, is_entry').eq('project_id', params.projectId),
    supabase.from('agent_edges').select('from_agent_id, to_agent_id, condition, label').eq('project_id', params.projectId),
  ])
  if (!project) notFound()
  return (
    <TestConsole
      name={project.name}
      description={project.description}
      agents={(agents ?? []).map((a) => ({ id: a.id, name: a.name, role: a.role, type: a.type, isEntry: a.is_entry }))}
      edges={(edges ?? []).map((e) => ({ from: e.from_agent_id, to: e.to_agent_id, condition: e.condition, label: e.label }))}
    />
  )
}
