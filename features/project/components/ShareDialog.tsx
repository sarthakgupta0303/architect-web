'use client'

import { Copy, Link2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { useWorkspace } from '@/features/workspace/context'
import { useProject } from '../context'

export function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { project } = useProject()
  const { workspace } = useWorkspace()
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/w/${workspace.slug}/p/${project.id}`
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Share project" description="Workspace members can open this project. Invite teammates from workspace settings.">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input readOnly value={link} className="pl-9 font-mono text-xs" aria-label="Project link" onFocus={(e) => e.target.select()} />
        </div>
        <Button variant="secondary" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copied'))}><Copy className="size-4" aria-hidden /> Copy</Button>
      </div>
      <div className="mt-5 flex justify-end">
        <Button asChild><Link href={`/w/${workspace.slug}/settings`}>Invite teammates</Link></Button>
      </div>
    </Dialog>
  )
}
