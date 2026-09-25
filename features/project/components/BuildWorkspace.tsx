'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AgentCanvas } from '@/features/canvas/components/AgentCanvas'
import { useGraph } from '@/features/canvas/hooks/use-graph'
import { ChatPanel, type CenterTab } from '@/features/generation/ChatPanel'
import { PrdPanel } from '@/features/prd/components/PrdPanel'
import { StudioPanel } from '@/features/studio/components/StudioPanel'
import { cn } from '@/lib/utils'
import { useProject } from '../context'
import { DeployModal } from './DeployModal'
import { SettingsPanel } from '../panels/DemoPanels'
import { DataPanel } from '../panels/DataPanel'
import { EvalsPanel } from '../panels/EvalsPanel'
import { DeployPanel } from '../panels/DeployPanel'
import { PreviewPanel } from '../panels/PreviewPanel'
import { BuildingView } from '../panels/BuildingView'
import { MessageSquare } from 'lucide-react'

const TABS: { value: CenterTab; label: string }[] = [
  { value: 'preview', label: 'Preview' }, { value: 'agents', label: 'Agents' }, { value: 'prd', label: 'PRD' }, { value: 'data', label: 'Data' },
  { value: 'evals', label: 'Evals' }, { value: 'deploy', label: 'Deploy' }, { value: 'studio', label: 'Studio' }, { value: 'settings', label: 'Settings' },
]

export function BuildWorkspace() {
  const { project, canEdit, isDeveloper } = useProject()
  const params = useSearchParams()
  const router = useRouter()
  const graph = useGraph(project.id)
  const hasAgents = (graph.data?.agents.length ?? 0) > 0
  const requested = params.get('tab') as CenterTab | null
  const defaultTab: CenterTab = project.previewUrl ? 'preview' : 'agents'
  const [tab, setTabState] = useState<CenterTab>(requested && TABS.some((t) => t.value === requested) ? requested : defaultTab)
  const [deployOpen, setDeployOpen] = useState(false)
  const [startSignal, setStartSignal] = useState(0)
  const [buildStep, setBuildStep] = useState<number | null>(null)
  const [mobileChat, setMobileChat] = useState(false)

  // Follow ?tab= changes made elsewhere (e.g. Fix buttons in the deploy preflight).
  useEffect(() => {
    if (requested && TABS.some((t) => t.value === requested)) setTabState(requested)
  }, [requested])

  function setTab(t: CenterTab) {
    setTabState(t)
    setMobileChat(false)
    const sp = new URLSearchParams(params.toString())
    sp.set('tab', t)
    sp.delete('step')
    router.replace(`?${sp.toString()}`, { scroll: false })
  }

  return (
    <div className="flex h-full min-h-0">
      <section aria-label="Agent chat" className={cn('w-full shrink-0 border-r border-border bg-surface md:block md:w-[360px]', mobileChat ? 'block' : 'hidden')}>
        <div className="flex items-center justify-between border-b border-border px-3 py-2 md:hidden">
          <span className="text-sm font-medium">Chat</span>
          <button onClick={() => setMobileChat(false)} className="text-sm text-primary-text">Back to {TABS.find((t) => t.value === tab)?.label}</button>
        </div>
        <ChatPanel startSignal={startSignal} onTab={setTab} autoStart={params.get('step') === 'clarify'} hasAgents={hasAgents} onBuildStep={setBuildStep} />
      </section>
      <section aria-label="Workspace" className={cn('min-w-0 flex-1 flex-col', mobileChat ? 'hidden md:flex' : 'flex')}>
        <div role="tablist" aria-label="Project views" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface px-3">
          <button onClick={() => setMobileChat(true)} className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm text-primary-text md:hidden"><MessageSquare className="size-4" aria-hidden />Chat</button>
          {TABS.map((t) => (
            <button key={t.value} role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)}
              className={cn('relative whitespace-nowrap px-3 py-2.5 text-sm transition-colors', tab === t.value ? 'text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted hover:text-fg')}>
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="min-h-0 flex-1">
          {tab === 'preview' && buildStep !== null && <BuildingView step={buildStep} />}
          {tab === 'preview' && buildStep === null && <PreviewPanel previewUrl={project.previewUrl} onBuild={() => setTab('agents')} />}
          {tab === 'agents' && <AgentCanvas projectId={project.id} canEdit={canEdit} isDeveloper={isDeveloper} onGenerate={() => setStartSignal((k) => k + 1)} />}
          {tab === 'prd' && <PrdPanel projectId={project.id} canEdit={canEdit} onGenerate={() => setTab('agents')} />}
          {tab === 'data' && <DataPanel />}
          {tab === 'evals' && <EvalsPanel />}
          {tab === 'deploy' && <DeployPanel onDeploy={() => setDeployOpen(true)} />}
          {tab === 'studio' && <StudioPanel projectId={project.id} onDeploy={() => setDeployOpen(true)} />}
          {tab === 'settings' && <SettingsPanel />}
        </div>
      </section>
      <DeployModal open={deployOpen} onOpenChange={setDeployOpen} />
    </div>
  )
}
