'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { MemberRole, PlanTier } from '@/lib/contracts/common'

export type WorkspaceSummary = { id: string; slug: string; name: string; role: MemberRole }
export type WorkspaceCtx = {
  workspace: { id: string; slug: string; name: string; plan: PlanTier; creditsBalance: number; codeModeRestricted: boolean }
  role: MemberRole
  isDeveloper: boolean
  user: { id: string; email: string | null; name: string | null; avatarUrl: string | null }
  workspaces: WorkspaceSummary[]
}

const Ctx = createContext<WorkspaceCtx | null>(null)

export function WorkspaceProvider({ value, children }: { value: WorkspaceCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return v
}
