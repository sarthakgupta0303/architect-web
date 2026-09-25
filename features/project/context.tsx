'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'
import { apiFetch } from '@/lib/api/client'
import type { ProjectDto } from '@/lib/contracts/projects'

type Ctx = { project: ProjectDto; canEdit: boolean; canDelete: boolean; isDeveloper: boolean; setProject: (p: ProjectDto) => void; refresh: () => void }
const ProjectCtx = createContext<Ctx | null>(null)

export function ProjectProvider({ initial, canEdit, canDelete, isDeveloper, children }: { initial: ProjectDto; canEdit: boolean; canDelete: boolean; isDeveloper: boolean; children: ReactNode }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['project', initial.id],
    queryFn: () => apiFetch<{ project: ProjectDto }>(`/api/projects/${initial.id}`).then((r) => r.project),
    initialData: initial,
  })
  return (
    <ProjectCtx.Provider value={{
      project: data,
      canEdit,
      canDelete,
      isDeveloper,
      setProject: (p) => qc.setQueryData(['project', initial.id], p),
      refresh: () => { qc.invalidateQueries({ queryKey: ['project', initial.id] }); qc.invalidateQueries({ queryKey: ['projects'] }) },
    }}>
      {children}
    </ProjectCtx.Provider>
  )
}

export function useProject() {
  const v = useContext(ProjectCtx)
  if (!v) throw new Error('useProject must be used inside ProjectProvider')
  return v
}
