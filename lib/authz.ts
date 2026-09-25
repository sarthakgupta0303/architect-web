import type { MemberRole } from '@/lib/contracts/common'

/** Authorization matrix — docs/specs/api-conventions.md §4. */
export type Action =
  | 'workspace:read' | 'workspace:update' | 'workspace:delete' | 'members:manage' | 'invitations:manage'
  | 'billing:manage' | 'spend:write'
  | 'project:read' | 'project:create' | 'project:update' | 'project:delete' | 'project:code'
  | 'prompt:write' | 'canvas:write' | 'comment:write'
  | 'deploy:preview' | 'deploy:production' | 'deploy:rollback'
  | 'evals:write' | 'integrations:connect' | 'integrations:revoke'
  | 'git:write' | 'secrets:read' | 'secrets:write' | 'mcp:write' | 'settings:runtime'
  | 'guardrails:write' | 'alerts:write' | 'domains:write' | 'approvals:decide'

export type MembershipContext = {
  role: MemberRole
  isDeveloper: boolean
  codeModeRestricted: boolean
  prodDeployRole: MemberRole
}

const RANK: Record<MemberRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 }

const MIN_ROLE: Partial<Record<Action, MemberRole>> = {
  'workspace:read': 'viewer',
  'project:read': 'viewer',
  'comment:write': 'viewer',
  'project:create': 'editor',
  'project:update': 'editor',
  'prompt:write': 'editor',
  'canvas:write': 'editor',
  'deploy:preview': 'editor',
  'evals:write': 'editor',
  'integrations:connect': 'editor',
  'workspace:update': 'admin',
  'members:manage': 'admin',
  'invitations:manage': 'admin',
  'guardrails:write': 'admin',
  'alerts:write': 'admin',
  'domains:write': 'admin',
  'integrations:revoke': 'admin',
  'project:delete': 'admin',
  'approvals:decide': 'admin',
  'billing:manage': 'owner',
  'workspace:delete': 'owner',
  'spend:write': 'owner',
}

const DEVELOPER_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'project:code', 'git:write', 'secrets:read', 'secrets:write', 'mcp:write', 'settings:runtime',
])

export function atLeast(role: MemberRole, min: MemberRole): boolean {
  return RANK[role] >= RANK[min]
}

export function isDeveloper(m: MembershipContext): boolean {
  if (atLeast(m.role, 'admin')) return true
  if (m.role !== 'editor') return false
  return m.isDeveloper || !m.codeModeRestricted
}

export function can(m: MembershipContext | null | undefined, action: Action): boolean {
  if (!m) return false
  if (DEVELOPER_ACTIONS.has(action)) return isDeveloper(m)
  if (action === 'deploy:production' || action === 'deploy:rollback') {
    if (!atLeast(m.role, m.prodDeployRole)) return false
    return m.role !== 'editor' || !m.codeModeRestricted || m.isDeveloper
  }
  const min = MIN_ROLE[action]
  return min ? atLeast(m.role, min) : false
}
