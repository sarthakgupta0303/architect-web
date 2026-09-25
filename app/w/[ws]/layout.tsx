import { notFound, redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AppShell } from '@/features/workspace/components/AppShell'
import { WorkspaceProvider, type WorkspaceCtx } from '@/features/workspace/context'
import { isDeveloper } from '@/lib/authz'
import type { MemberRole, PlanTier } from '@/lib/contracts/common'
import { createClient } from '@/lib/supabase/server'

export default async function WorkspaceLayout({ children, params }: { children: ReactNode; params: { ws: string } }) {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect(`/login?next=/w/${params.ws}`)

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('full_name, avatar_url, email, onboarded_at, last_workspace_id').eq('id', auth.user.id).maybeSingle(),
    supabase.from('workspace_members').select('role, is_developer, workspaces(id, slug, name, plan, credits_balance, code_mode_restricted, prod_deploy_role)').eq('user_id', auth.user.id),
  ])
  if (!profile?.onboarded_at) redirect('/onboarding')

  type M = { role: MemberRole; is_developer: boolean; workspaces: { id: string; slug: string; name: string; plan: PlanTier; credits_balance: number | string; code_mode_restricted: boolean; prod_deploy_role: MemberRole } | null }
  const list = ((memberships ?? []) as unknown as M[]).filter((m) => m.workspaces)
  const current = list.find((m) => m.workspaces!.slug === params.ws)
  if (!current) notFound()
  const ws = current.workspaces!

  if (profile.last_workspace_id !== ws.id) {
    await supabase.from('profiles').update({ last_workspace_id: ws.id }).eq('id', auth.user.id)
  }

  const value: WorkspaceCtx = {
    workspace: { id: ws.id, slug: ws.slug, name: ws.name, plan: ws.plan, creditsBalance: Number(ws.credits_balance), codeModeRestricted: ws.code_mode_restricted },
    role: current.role,
    isDeveloper: isDeveloper({ role: current.role, isDeveloper: current.is_developer, codeModeRestricted: ws.code_mode_restricted, prodDeployRole: ws.prod_deploy_role }),
    user: { id: auth.user.id, email: profile.email ?? auth.user.email ?? null, name: profile.full_name, avatarUrl: profile.avatar_url },
    workspaces: list.map((m) => ({ id: m.workspaces!.id, slug: m.workspaces!.slug, name: m.workspaces!.name, role: m.role })),
  }

  return (
    <WorkspaceProvider value={value}>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  )
}
