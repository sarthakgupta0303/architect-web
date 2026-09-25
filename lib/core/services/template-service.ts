import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError, fromPostgrest } from '@/lib/api/errors'
import { PROJECT_COLS } from '@/lib/core/access'
import { toProjectDto } from '@/lib/core/mappers'
import type { ProjectRow, TemplateRow } from '@/lib/db/types'

const TEMPLATE_COLS = 'id, slug, name, description, category, framework, agents_count, integrations, graph, questions, preview_media_url'

export type TemplateDto = {
  slug: string
  name: string
  description: string
  category: string
  framework: string
  agentsCount: number
  integrations: string[]
  questions: TemplateRow['questions']
  agents: { key: string; name: string; type: string }[]
}

function toDto(t: TemplateRow): TemplateDto {
  return {
    slug: t.slug,
    name: t.name,
    description: t.description,
    category: t.category,
    framework: t.framework,
    agentsCount: t.agents_count,
    integrations: t.integrations,
    questions: t.questions ?? [],
    agents: (t.graph?.agents ?? []).map((a) => ({ key: a.key, name: a.name, type: a.type })),
  }
}

export async function listTemplates(supabase: SupabaseClient, category?: string) {
  let q = supabase.from('templates').select(TEMPLATE_COLS).eq('published', true).order('is_official', { ascending: false }).order('name')
  if (category) q = q.eq('category', category)
  const { data, error } = await q
  if (error) throw fromPostgrest(error, 'Could not load templates')
  return { items: ((data ?? []) as TemplateRow[]).map(toDto) }
}

function fillVars(text: string | undefined, answers: Record<string, string>): string | null {
  if (!text) return null
  return text.replace(/\{\{\s*var\.([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => answers[key]?.trim() || key.replace(/_/g, ' '))
}

/** Creates a project from a published template: project + agents + edges + PRD v1. */
export async function instantiateTemplate(
  supabase: SupabaseClient, userId: string, workspaceId: string, slug: string, answers: Record<string, string>, name?: string,
) {
  const { data: tpl, error: tErr } = await supabase.from('templates').select(TEMPLATE_COLS).eq('slug', slug).eq('published', true).maybeSingle()
  if (tErr) throw fromPostgrest(tErr, 'Could not load template')
  if (!tpl) throw new AppError('NOT_FOUND', 'Template not found')
  const template = tpl as TemplateRow

  const missing = (template.questions ?? []).filter((q) => q.required && !answers[q.id]?.trim())
  if (missing.length) {
    throw new AppError('VALIDATION_FAILED', `Please answer: ${missing.map((m) => m.label).join(', ')}`, {
      fieldErrors: Object.fromEntries(missing.map((m) => [m.id, ['Required']])),
    })
  }

  const { data: proj, error: pErr } = await supabase
    .from('projects')
    .insert({
      workspace_id: workspaceId,
      name: name ?? template.name,
      description: template.description,
      source: 'template',
      template_id: template.id,
      framework: template.framework,
      created_by: userId,
    })
    .select(PROJECT_COLS)
    .single()
  if (pErr) throw fromPostgrest(pErr, 'Could not create project')
  const project = proj as unknown as ProjectRow

  const agentsIn = template.graph?.agents ?? []
  const { data: agents, error: aErr } = await supabase
    .from('agents')
    .insert(agentsIn.map((a, i) => ({
      project_id: project.id,
      key: a.key,
      name: a.name,
      role: a.role ?? null,
      type: a.type,
      instructions: fillVars(a.instructions, answers),
      position: a.position,
      is_entry: i === 0,
    })))
    .select('id, key')
  if (aErr) throw fromPostgrest(aErr, 'Could not create agents')

  const idByKey = new Map((agents ?? []).map((a: { id: string; key: string }) => [a.key, a.id]))
  const edges = (template.graph?.edges ?? [])
    .map((e) => ({ project_id: project.id, from_agent_id: idByKey.get(e.from), to_agent_id: idByKey.get(e.to), condition: e.condition ?? '' }))
    .filter((e) => e.from_agent_id && e.to_agent_id)
  if (edges.length) {
    const { error } = await supabase.from('agent_edges').insert(edges)
    if (error) throw fromPostgrest(error, 'Could not connect agents')
  }

  const answerLines = Object.entries(answers).filter(([, v]) => v?.trim()).map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${v}`).join('\n')
  const { error: prdErr } = await supabase.from('prds').insert({
    project_id: project.id,
    version: 1,
    created_by: userId,
    content: {
      title: project.name,
      summary: template.description,
      sections: [
        { key: 'overview', title: 'Overview', bodyMd: template.description },
        { key: 'agents', title: 'Agents', bodyMd: agentsIn.map((a) => `- **${a.name}** — ${a.role ?? a.type}`).join('\n') },
        { key: 'integrations', title: 'Integrations', bodyMd: template.integrations.length ? template.integrations.map((i) => `- ${i}`).join('\n') : 'None required.' },
        { key: 'goals', title: 'Goals', bodyMd: answerLines || 'Customize this section with your goals.' },
        { key: 'ui', title: 'UI', bodyMd: 'Chat console for the entry agent and an activity page listing recent runs.' },
      ],
    },
  })
  if (prdErr) throw fromPostgrest(prdErr, 'Could not create PRD')

  return { project: toProjectDto(project) }
}
