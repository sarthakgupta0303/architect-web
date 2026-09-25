/** Row shapes for tables read by the web app (docs/specs/supabase-schema.sql). */
export type MemberRoleRow = 'viewer' | 'editor' | 'admin' | 'owner'

export type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  default_mode: 'build' | 'code'
  use_case: string | null
  preferred_framework: string
  preferred_language: 'python' | 'typescript'
  theme: 'light' | 'dark' | 'system'
  mode_prefs: Record<string, 'build' | 'code'>
  onboarded_at: string | null
  last_workspace_id: string | null
}

export type WorkspaceRow = {
  id: string
  name: string
  slug: string
  owner_id: string
  plan: 'free' | 'pro' | 'team' | 'enterprise'
  credits_balance: number | string
  code_mode_restricted: boolean
  prod_deploy_role: MemberRoleRow
  created_at: string
}

export type MembershipRow = { workspace_id: string; user_id: string; role: MemberRoleRow; is_developer: boolean }

export type ProjectRow = {
  id: string
  workspace_id: string
  name: string
  description: string | null
  initial_prompt: string | null
  status: 'draft' | 'building' | 'preview' | 'live' | 'archived'
  mode_default: 'build' | 'code'
  framework: string
  language: 'python' | 'typescript'
  source: string
  template_id: string | null
  repo_provider: 'architect' | 'github'
  repo_owner: string | null
  repo_name: string | null
  working_branch: string
  auto_commit: boolean
  thumbnail_url: string | null
  preview_url: string | null
  live_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  creator?: { id: string; full_name: string | null } | null
}

export type AgentRow = {
  id: string
  project_id: string
  key: string
  name: string
  role: string | null
  type: 'autonomous' | 'workflow' | 'human_approval' | 'code'
  framework: string | null
  model: string | null
  instructions: string | null
  memory: { mode: 'none' | 'short' | 'long' }
  position: { x: number; y: number }
  is_entry: boolean
  managed: boolean
  locked: boolean
  has_custom_code: boolean
  updated_at: string
  agent_tools?: { id: string; tool_type: 'integration' | 'mcp' | 'builtin' | 'code'; name: string }[]
}

export type EdgeRow = { id: string; project_id: string; from_agent_id: string; to_agent_id: string; condition: string; label: string | null }

export type TemplateRow = {
  id: string
  slug: string
  name: string
  description: string
  category: string
  framework: string
  agents_count: number
  integrations: string[]
  graph: {
    agents: { key: string; name: string; type: 'autonomous' | 'workflow' | 'human_approval'; role?: string; instructions?: string; position: { x: number; y: number } }[]
    edges: { from: string; to: string; condition: string }[]
  }
  questions: { id: string; label: string; type: 'text' | 'select'; required: boolean; placeholder?: string; options?: string[] }[]
  preview_media_url: string | null
}

export type RunRow = {
  id: string
  project_id: string
  deployment_id: string | null
  environment: 'development' | 'preview' | 'production'
  entry_agent_id: string | null
  end_user_ref: string | null
  status: 'success' | 'error' | 'escalated' | 'awaiting_approval' | 'blocked'
  latency_ms: number
  tokens_in: number
  tokens_out: number
  cost: number | string
  input_preview: string | null
  output_preview: string | null
  created_at: string
}
