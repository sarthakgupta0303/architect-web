'use client'

import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { CreditsMeter } from '@/components/shared/CreditsMeter'
import { useWorkspace } from '@/features/workspace/context'
import { apiFetch } from '@/lib/api/client'
import type { Paginated } from '@/lib/contracts/common'
import type { ProjectCardDto } from '@/lib/contracts/projects'
import { firstName, greeting } from '@/lib/utils'
import { DashboardPrompt } from './DashboardPrompt'
import { ProjectGrid } from './ProjectGrid'

export function Dashboard() {
  const { user, workspace } = useWorkspace()
  const [hello, setHello] = useState('Welcome back')
  useEffect(() => setHello(greeting()), [])

  return (
    <main id="main" className="mx-auto w-full max-w-7xl px-4 pb-16 pt-20 sm:px-6 lg:pt-10">
      <h1 className="text-3xl font-semibold tracking-tight">{hello}{firstName(user.name) ? `, ${firstName(user.name)}` : ''}</h1>
      <p className="mt-1 text-muted">What will you build in {workspace.name} today?</p>
      <div className="mt-6"><DashboardPrompt /></div>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_300px]">
        <ProjectGrid />
        <aside className="space-y-4" aria-label="Workspace summary">
          <Card className="p-4"><CreditsMeter /></Card>
          <GettingStarted />
        </aside>
      </div>
    </main>
  )
}

function GettingStarted() {
  const { workspace } = useWorkspace()
  const all = useQuery({
    queryKey: ['projects', 'summary', workspace.slug],
    queryFn: () => apiFetch<Paginated<ProjectCardDto>>(`/api/workspaces/${workspace.slug}/projects?limit=24`),
  })
  const members = useQuery({
    queryKey: ['members', workspace.slug],
    queryFn: () => apiFetch<{ items: unknown[] }>(`/api/workspaces/${workspace.slug}/members`),
  })
  const items = all.data?.items ?? []
  const steps = [
    { label: 'Build your first agent', done: items.length > 0, href: `/w/${workspace.slug}?new=1` },
    { label: 'Deploy an app', done: items.some((p) => p.status === 'live'), href: `/w/${workspace.slug}` },
    { label: 'Invite a teammate', done: (members.data?.items.length ?? 0) > 1, href: `/w/${workspace.slug}/settings` },
  ]
  if (all.isLoading || steps.every((s) => s.done)) return null
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">Getting started</h3>
      <ul className="mt-3 space-y-2">
        {steps.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className="flex items-center gap-2 text-sm hover:text-fg">
              {s.done ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <Circle className="size-4 text-muted" aria-hidden />}
              <span className={s.done ? 'text-muted line-through' : ''}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
