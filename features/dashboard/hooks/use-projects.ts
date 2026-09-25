'use client'

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api/client'
import type { Paginated } from '@/lib/contracts/common'
import type { ProjectCardDto, ProjectDto } from '@/lib/contracts/projects'

export type ProjectFilter = 'all' | 'mine' | 'shared' | 'deployed'

export function useProjects(slug: string, filter: ProjectFilter, q: string) {
  return useInfiniteQuery({
    queryKey: ['projects', slug, filter, q],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ filter, limit: '24' })
      if (q) params.set('q', q)
      if (pageParam) params.set('cursor', pageParam)
      return apiFetch<Paginated<ProjectCardDto>>(`/api/workspaces/${slug}/projects?${params}`, { signal })
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { workspaceId: string; source: 'prompt' | 'blank' | 'template'; initialPrompt?: string; templateSlug?: string; templateAnswers?: Record<string, string>; name?: string }) =>
      apiFetch<{ project: ProjectDto }>('/api/projects', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}
