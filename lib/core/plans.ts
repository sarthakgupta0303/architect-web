import type { PlanTier } from '@/lib/contracts/common'

/** Plan limits — single source of truth (docs/specs/billing-and-credits.md §1). */
export const PLANS: Record<PlanTier, {
  label: string
  priceMonthly: number | null
  monthlyCredits: number
  maxActiveProjects: number | null
  /** Projects that can be live in production at once (null = unlimited). */
  maxLiveApps: number | null
  agentRunsPerMonth: number | null
  features: string[]
}> = {
  free: { label: 'Free', priceMonthly: 0, monthlyCredits: 30, maxActiveProjects: 10, maxLiveApps: 5, agentRunsPerMonth: 1000, features: ['10 projects', '5 live apps', '30 build credits / month', '1,000 agent runs', 'Architect subdomain'] },
  pro: { label: 'Pro', priceMonthly: 25, monthlyCredits: 150, maxActiveProjects: null, maxLiveApps: null, agentRunsPerMonth: 20000, features: ['Unlimited projects', '150 credits / month', '20K agent runs', 'Custom domains', 'GitHub, Code mode, CLI', 'Evals'] },
  team: { label: 'Team', priceMonthly: 40, monthlyCredits: 150, maxActiveProjects: null, maxLiveApps: null, agentRunsPerMonth: 50000, features: ['Pooled credits per seat', 'Roles and comments', 'Studio alerts', 'Human-in-the-loop queue', 'Priority support'] },
  enterprise: { label: 'Enterprise', priceMonthly: null, monthlyCredits: 0, maxActiveProjects: null, maxLiveApps: null, agentRunsPerMonth: null, features: ['SSO / SCIM', 'Audit logs', 'VPC / self-host', 'SLAs'] },
}
