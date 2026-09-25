import type { AgentDto, EdgeDto } from '@/lib/contracts/agents'
import type { ProjectCardDto, ProjectDto } from '@/lib/contracts/projects'
import type { AgentRow, EdgeRow, ProjectRow } from '@/lib/db/types'

export function toProjectCard(p: ProjectRow): ProjectCardDto {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    thumbnailUrl: p.thumbnail_url,
    framework: p.framework,
    status: p.status,
    liveUrl: p.live_url,
    updatedAt: p.updated_at,
    createdBy: p.creator ? { id: p.creator.id, name: p.creator.full_name } : p.created_by ? { id: p.created_by, name: null } : null,
  }
}

export function toProjectDto(p: ProjectRow): ProjectDto {
  return {
    ...toProjectCard(p),
    workspaceId: p.workspace_id,
    initialPrompt: p.initial_prompt,
    modeDefault: p.mode_default,
    language: p.language,
    source: p.source,
    repoProvider: p.repo_provider,
    repoOwner: p.repo_owner,
    repoName: p.repo_name,
    workingBranch: p.working_branch,
    autoCommit: p.auto_commit,
    // Previews are always served by /preview/[projectId]; older seeds stored other paths.
    previewUrl: p.preview_url ? (p.preview_url.startsWith('/preview/') ? p.preview_url : `/preview/${p.id}`) : null,
    createdAt: p.created_at,
  }
}

export function toAgentDto(a: AgentRow): AgentDto {
  return {
    id: a.id,
    key: a.key,
    name: a.name,
    role: a.role,
    type: a.type,
    framework: a.framework,
    model: a.model,
    instructions: a.instructions,
    memory: a.memory ?? { mode: 'none' },
    position: a.position ?? { x: 0, y: 0 },
    isEntry: a.is_entry,
    managed: a.managed,
    locked: a.locked,
    hasCustomCode: a.has_custom_code,
    updatedAt: a.updated_at,
    tools: (a.agent_tools ?? []).map((t) => ({ id: t.id, toolType: t.tool_type, name: t.name })),
  }
}

export function toEdgeDto(e: EdgeRow): EdgeDto {
  return { id: e.id, fromAgentId: e.from_agent_id, toAgentId: e.to_agent_id, condition: e.condition, label: e.label }
}
