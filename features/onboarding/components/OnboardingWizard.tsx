'use client'

import { ArrowLeft, ArrowRight, Blocks, Code2, Layers, X } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { Alert } from '@/components/ui/States'
import { Logo } from '@/components/shared/Logo'
import { ApiError, apiFetch } from '@/lib/api/client'
import { FRAMEWORK_LABELS } from '@/lib/contracts/common'
import { OnboardingSchema, type OnboardingInput } from '@/lib/contracts/onboarding'
import { cn } from '@/lib/utils'

type Mode = 'build' | 'code' | 'both'
type State = {
  mode: Mode | null
  useCase: OnboardingInput['useCase'] | null
  workspaceName: string
  invites: string[]
  framework: OnboardingInput['preferredFramework']
  language: OnboardingInput['preferredLanguage']
}

const STORAGE_KEY = 'architect_onboarding'
const USE_CASES: { value: OnboardingInput['useCase']; label: string }[] = [
  { value: 'support', label: 'Customer support' }, { value: 'sales', label: 'Sales' }, { value: 'ops', label: 'Internal ops' },
  { value: 'research', label: 'Research' }, { value: 'content', label: 'Content' }, { value: 'personal', label: 'Personal' }, { value: 'other', label: 'Something else' },
]
const MODES: { value: Mode; title: string; body: string; icon: typeof Blocks }[] = [
  { value: 'build', title: 'I describe what I want', body: 'Prompt, review a plan and edit visually. No code needed.', icon: Blocks },
  { value: 'code', title: 'I write code', body: 'Files, terminal, diffs, Git and your favorite agent framework.', icon: Code2 },
  { value: 'both', title: 'Both', body: 'Start visually and drop into code whenever you want.', icon: Layers },
]

function readPendingPrompt(params: URLSearchParams): string | null {
  const fromUrl = params.get('prompt')
  if (fromUrl) return fromUrl.slice(0, 10000)
  try { return sessionStorage.getItem('pending_prompt')?.slice(0, 10000) || null } catch { return null }
}

export function OnboardingWizard({ firstName }: { firstName: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [step, setStep] = useState(0)
  const [state, setState] = useState<State>({ mode: null, useCase: null, workspaceName: `${firstName}'s workspace`, invites: [], framework: 'lyzr_adk', language: 'python' })
  const [inviteDraft, setInviteDraft] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { step: number; state: State }
        setState(parsed.state)
        setStep(parsed.step)
      }
    } catch { /* ignore corrupt storage */ }
  }, [])
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ step, state })) } catch { /* storage unavailable */ }
  }, [step, state])

  const steps = useMemo(() => (state.mode && state.mode !== 'build' ? 4 : 3), [state.mode])
  const nameError = state.workspaceName.trim().length === 0 ? 'Name your workspace' : state.workspaceName.trim().length > 60 ? 'Keep it under 60 characters' : null
  const canNext = step === 0 ? !!state.mode : step === 1 ? !!state.useCase : step === 2 ? !nameError : true

  function addInvite() {
    const email = inviteDraft.trim().toLowerCase()
    if (!email) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setInviteError('Enter a valid email')
    if (state.invites.includes(email)) return setInviteError('Already added')
    if (state.invites.length >= 10) return setInviteError('You can invite up to 10 people now')
    setState((s) => ({ ...s, invites: [...s.invites, email] }))
    setInviteDraft('')
    setInviteError(null)
  }

  async function finish() {
    if (!state.mode || !state.useCase) return
    const payload = OnboardingSchema.safeParse({
      defaultMode: state.mode === 'build' ? 'build' : 'code',
      isDeveloper: state.mode !== 'build',
      useCase: state.useCase,
      workspaceName: state.workspaceName,
      invites: state.invites.map((email) => ({ email, role: 'editor' })),
      preferredFramework: state.framework,
      preferredLanguage: state.language,
    })
    if (!payload.success) return setError(payload.error.issues[0]?.message ?? 'Please check your answers')
    setSubmitting(true)
    setError(null)
    try {
      const { workspaceId, workspaceSlug } = await apiFetch<{ workspaceId: string; workspaceSlug: string }>('/api/onboarding', { body: payload.data })
      try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
      const prompt = readPendingPrompt(params)
      if (prompt) {
        const { project } = await apiFetch<{ project: { id: string } }>('/api/projects', { body: { workspaceId, source: 'prompt', initialPrompt: prompt } })
        try { sessionStorage.removeItem('pending_prompt') } catch { /* noop */ }
        router.replace(`/w/${workspaceSlug}/p/${project.id}/build`)
      } else {
        router.replace(`/w/${workspaceSlug}`)
      }
      router.refresh()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CONFLICT') {
        router.replace('/app')
        return
      }
      setError(e instanceof Error ? e.message : 'Could not finish setup')
      setSubmitting(false)
    }
  }

  function next() {
    if (!canNext) return
    if (step === steps - 1) finish()
    else setStep((s) => s + 1)
  }

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(60%_40%_at_50%_0%,rgb(var(--color-primary)/0.16),transparent)]">
      <header className="flex items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <p className="text-xs text-muted" aria-live="polite">Step {step + 1} of {steps}</p>
      </header>
      <div className="mx-auto h-1 w-full max-w-xl overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full bg-primary transition-all duration-250" style={{ width: `${((step + 1) / steps) * 100}%` }} />
      </div>
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 pb-16 pt-10">
        {step === 0 && (
          <Step title="How do you like to build?" subtitle="This sets your default view. You can switch any time.">
            <div className="grid gap-3">
              {MODES.map((m) => (
                <ChoiceCard key={m.value} selected={state.mode === m.value} onClick={() => setState((s) => ({ ...s, mode: m.value }))} icon={<m.icon className="size-5" aria-hidden />} title={m.title} body={m.body} />
              ))}
            </div>
          </Step>
        )}
        {step === 1 && (
          <Step title="What are you building?" subtitle="We'll suggest templates and examples that fit.">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Use case">
              {USE_CASES.map((u) => (
                <button key={u.value} type="button" role="radio" aria-checked={state.useCase === u.value} data-selected={state.useCase === u.value} className="chip" onClick={() => setState((s) => ({ ...s, useCase: u.value }))}>
                  {u.label}
                </button>
              ))}
            </div>
          </Step>
        )}
        {step === 2 && (
          <Step title="Name your workspace" subtitle="Projects, members and billing live in a workspace.">
            <div>
              <Label htmlFor="ws-name">Workspace name</Label>
              <Input id="ws-name" value={state.workspaceName} maxLength={60} invalid={!!nameError} aria-describedby="ws-name-error" onChange={(e) => setState((s) => ({ ...s, workspaceName: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && next()} />
              <FieldError id="ws-name-error">{nameError}</FieldError>
            </div>
            <div className="mt-6">
              <Label htmlFor="invite">Invite teammates <span className="font-normal text-muted">(optional)</span></Label>
              <div className="flex gap-2">
                <Input id="invite" type="email" placeholder="name@company.com" value={inviteDraft} invalid={!!inviteError} aria-describedby="invite-error"
                  onChange={(e) => { setInviteDraft(e.target.value); setInviteError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addInvite() } }} />
                <Button type="button" variant="secondary" onClick={addInvite}>Add</Button>
              </div>
              <FieldError id="invite-error">{inviteError}</FieldError>
              {state.invites.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {state.invites.map((email) => (
                    <li key={email} className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
                      {email}
                      <button type="button" aria-label={`Remove ${email}`} className="rounded-full p-1 text-muted hover:text-fg" onClick={() => setState((s) => ({ ...s, invites: s.invites.filter((i) => i !== email) }))}>
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted">Invitations are saved as pending and appear in workspace settings.</p>
            </div>
          </Step>
        )}
        {step === 3 && (
          <Step title="Developer defaults" subtitle="Used for new projects. Each project can override them.">
            <div className="grid gap-5">
              <div>
                <Label htmlFor="framework">Agent framework</Label>
                <div id="framework" role="radiogroup" aria-label="Agent framework" className="grid gap-2 sm:grid-cols-2">
                  {(['lyzr_adk', 'langgraph', 'crewai', 'openai_agents'] as const).map((f) => (
                    <button key={f} type="button" role="radio" aria-checked={state.framework === f} onClick={() => setState((s) => ({ ...s, framework: f }))}
                      className={cn('rounded-xl border px-4 py-3 text-left text-sm transition-colors', state.framework === f ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-fg/40')}>
                      <span className="font-medium">{FRAMEWORK_LABELS[f]}</span>
                      {f === 'lyzr_adk' && <span className="ml-2 text-xs text-primary-text">Recommended</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium">Language</p>
                <Segmented label="Language" value={state.language} onChange={(v) => setState((s) => ({ ...s, language: v }))} options={[{ value: 'python', label: 'Python' }, { value: 'typescript', label: 'TypeScript' }]} />
              </div>
            </div>
          </Step>
        )}

        {error && <Alert className="mt-6">{error}</Alert>}

        <div className="mt-10 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
            <ArrowLeft className="size-4" aria-hidden /> Back
          </Button>
          <Button onClick={next} disabled={!canNext} loading={submitting}>
            {step === steps - 1 ? 'Finish setup' : 'Continue'} {!submitting && <ArrowRight className="size-4" aria-hidden />}
          </Button>
        </div>
      </main>
    </div>
  )
}

function Step({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="animate-fade-in">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mb-8 mt-2 text-muted">{subtitle}</p>
      {children}
    </section>
  )
}

function ChoiceCard({ selected, onClick, icon, title, body }: { selected: boolean; onClick: () => void; icon: ReactNode; title: string; body: string }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick}
      className={cn('flex items-start gap-4 rounded-2xl border p-5 text-left transition-colors duration-150', selected ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-fg/40')}>
      <span className={cn('rounded-xl p-2.5', selected ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-primary-text')}>{icon}</span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-1 block text-sm text-muted">{body}</span>
      </span>
    </button>
  )
}
