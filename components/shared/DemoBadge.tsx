import { FlaskConical } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'

/** Marks panels that show sample data in the prototype (docs/specs/mock-mode.md §4). */
export function DemoBadge() {
  return (
    <Tooltip content="This panel shows sample data in the prototype — the real service plugs into the same API.">
      <span tabIndex={0}><Badge tone="info"><FlaskConical className="size-3" aria-hidden /> Demo data</Badge></span>
    </Tooltip>
  )
}
