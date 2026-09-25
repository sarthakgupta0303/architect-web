import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { ProjectTopBar } from '@/features/project/components/ProjectTopBar'
import { ProjectProvider } from '@/features/project/context'
import { AppError } from '@/lib/api/errors'
import { can } from '@/lib/authz'
import { getProjectAccess } from '@/lib/core/access'
import { toProjectDto } from '@/lib/core/mappers'
import { createClient } from '@/lib/supabase/server'

async function load(projectId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound()
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) notFound()
  try {
    return await getProjectAccess(supabase, projectId, auth.user.id, 'project:read')
  } catch (e) {
    if (e instanceof AppError && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN')) notFound()
    throw e
  }
}

export async function generateMetadata({ params }: { params: { projectId: string } }): Promise<Metadata> {
  try {
    const { project } = await load(params.projectId)
    return { title: project.name }
  } catch {
    return { title: 'Project' }
  }
}

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: { ws: string; projectId: string } }) {
  const { project, membership, workspace } = await load(params.projectId)
  if (workspace.slug !== params.ws) notFound()
  return (
    <ProjectProvider initial={toProjectDto(project)} canEdit={can(membership, 'canvas:write')} canDelete={can(membership, 'project:delete')} isDeveloper={can(membership, 'project:code')}>
      <div className="flex h-screen flex-col overflow-hidden">
        <ProjectTopBar />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </ProjectProvider>
  )
}
