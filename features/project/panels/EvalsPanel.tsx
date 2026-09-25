'use client'

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, ChevronRight, FlaskConical, Play, Plus, Trash2, Upload, XCircle } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge, StatusPill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { FieldError, FieldHint, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { Alert, EmptyState, ErrorState } from '@/components/ui/States'
import { Switch } from '@/components/ui/Switch'
import { ApiError, apiFetch } from '@/lib/api/client'
import {
  CreateCaseSchema,
  describeExpectation,
  EVAL_LIMITS,
  parseEvalCsv,
  type CreateCaseInput,
  type CsvParseResult,
  type ExpectationType,
} from '@/lib/core/services/eval-logic'
import type { EvalCaseDto, EvalGateDto, EvalResultDto, EvalRunDetailDto, EvalRunSummaryDto } from '@/lib/core/services/eval-service'
import { cn } from '@/lib/utils'
import { useProject } from '../context'

type RunsResponse = { items: EvalRunSummaryDto[]; latest: EvalRunDetailDto | null }

const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString()
}

const TYPE_LABELS: Record<ExpectationType, string> = {
  contains: 'Output contains',
  not_contains: 'Output does not contain',
  escalates: 'Escalation',
  agent: 'Handled by agent',
}

export function EvalsPanel() {
  const { project, canEdit, isDeveloper } = useProject()
  const qc = useQueryClient()
  const base = `/api/projects/${project.id}/evals`
  const keys = { cases: ['evals', project.id, 'cases'], runs: ['evals', project.id, 'runs'], gate: ['evals', project.id, 'gate'] } as const

  const cases = useQuery({ queryKey: keys.cases, queryFn: () => apiFetch<{ items: EvalCaseDto[] }>(`${base}/cases`) })
  const runs = useQuery({ queryKey: keys.runs, queryFn: () => apiFetch<RunsResponse>(`${base}/runs`) })
  const gate = useQuery({ queryKey: keys.gate, queryFn: () => apiFetch<{ gate: EvalGateDto }>(`${base}/gate`).then((r) => r.gate) })

  const [addOpen, setAddOpen] = useState(false)
  const [toDelete, setToDelete] = useState<EvalCaseDto | null>(null)
  const [importPreview, setImportPreview] = useState<{ fileName: string; csv: string; parsed: CsvParseResult } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const run = useMutation({
    mutationFn: () => apiFetch<{ run: EvalRunDetailDto }>(`${base}/runs`, { body: {} }),
    onSuccess: ({ run: r }) => {
      qc.setQueryData(keys.runs, (old: RunsResponse | undefined) => ({
        items: [r, ...(old?.items ?? []).filter((x) => x.id !== r.id)].slice(0, EVAL_LIMITS.HISTORY),
        latest: r,
      }))
      toast.success(`Eval run finished — ${r.score ?? 0}% (${r.passed} passed, ${r.failed} failed)`)
    },
    onError: (e) => { toast.error(errMsg(e, 'Could not run evals')); qc.invalidateQueries({ queryKey: keys.runs }) },
  })

  const del = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`${base}/cases/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      qc.setQueryData(keys.cases, (old: { items: EvalCaseDto[] } | undefined) => ({ items: (old?.items ?? []).filter((c) => c.id !== id) }))
      setToDelete(null)
      toast.success('Eval case deleted')
    },
    onError: (e) => toast.error(errMsg(e, 'Could not delete the case')),
  })

  const importCsv = useMutation({
    mutationFn: (csv: string) => apiFetch<{ imported: number; items: EvalCaseDto[] }>(`${base}/cases/import`, { body: { csv } }),
    onSuccess: ({ imported, items }) => {
      qc.setQueryData(keys.cases, (old: { items: EvalCaseDto[] } | undefined) => ({ items: [...(old?.items ?? []), ...items] }))
      setImportPreview(null)
      toast.success(`Imported ${imported} ${imported === 1 ? 'case' : 'cases'}`)
    },
    onError: (e) => toast.error(errMsg(e, 'Could not import the file')),
  })

  async function onFile(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) return toast.error('Choose a .csv file')
    if (file.size > EVAL_LIMITS.MAX_CSV_BYTES) return toast.error(`CSV files can be at most ${EVAL_LIMITS.MAX_CSV_BYTES / 1000} KB`)
    try {
      const csv = await file.text()
      setImportPreview({ fileName: file.name, csv, parsed: parseEvalCsv(csv) })
    } catch {
      toast.error('Could not read the file')
    }
  }

  const resultsByCase = useMemo(() => new Map((runs.data?.latest?.results ?? []).map((r) => [r.caseId, r])), [runs.data])
  const items = cases.data?.items ?? []
  const writesDisabled = !canEdit

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Evals</h1>
            <p className="text-sm text-muted">Test cases your agents must pass before production deploys.</p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="secondary" size="sm" disabled={writesDisabled} onClick={() => fileRef.current?.click()}><Upload className="size-4" aria-hidden />Import CSV</Button>
            <Button variant="secondary" size="sm" disabled={writesDisabled} onClick={() => setAddOpen(true)}><Plus className="size-4" aria-hidden />Add case</Button>
            <Button size="sm" disabled={writesDisabled || items.length === 0} loading={run.isPending} onClick={() => run.mutate()}>
              {!run.isPending && <Play className="size-4" aria-hidden />}Run evals
            </Button>
          </div>
        </div>

        {!canEdit && <Alert tone="info">You have view access — ask an editor to add cases or run evals.</Alert>}

        {run.isPending && (
          <div className="space-y-2" aria-live="polite">
            <p className="text-sm text-muted">Running {items.length} {items.length === 1 ? 'case' : 'cases'} through your agents…</p>
            <div role="progressbar" aria-label="Eval run in progress" className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
            </div>
          </div>
        )}

        <ScoreCard runs={runs} threshold={gate.data?.threshold ?? null} />

        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-semibold">Cases{cases.data ? ` · ${items.length}` : ''}</h2>
            {runs.data?.latest && <span className="text-xs text-muted">Results from the run {timeAgo(runs.data.latest.createdAt)}</span>}
          </div>
          {cases.isPending ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : cases.isError ? (
            <ErrorState message={errMsg(cases.error, 'Could not load eval cases')} onRetry={() => cases.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title="No eval cases yet"
              body="Add questions your users might ask and what a good answer looks like, or import a CSV with input,expected columns."
              action={canEdit ? <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="size-4" aria-hidden />Add case</Button> : undefined}
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="w-8 px-2 py-2"><span className="sr-only">Details</span></th>
                  <th scope="col" className="px-4 py-2 font-medium">Input</th>
                  <th scope="col" className="px-4 py-2 font-medium">Expectation</th>
                  <th scope="col" className="px-4 py-2 font-medium">Result</th>
                  <th scope="col" className="w-12 px-2 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <CaseRow
                    key={c.id}
                    c={c}
                    result={resultsByCase.get(c.id)}
                    open={expanded === c.id}
                    onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                    canDelete={canEdit}
                    onDelete={() => setToDelete(c)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <GateCard gate={gate} canWrite={isDeveloper} queryKey={keys.gate} base={base} />
      </div>

      <AddCaseDialog open={addOpen} onOpenChange={setAddOpen} base={base} onCreated={(c) => qc.setQueryData(keys.cases, (old: { items: EvalCaseDto[] } | undefined) => ({ items: [...(old?.items ?? []), c] }))} />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this eval case?"
        body={toDelete ? <>“{toDelete.input.slice(0, 120)}{toDelete.input.length > 120 ? '…' : ''}” and its past results will be removed.</> : null}
        confirmLabel="Delete case"
        loading={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
      />

      <Dialog
        open={!!importPreview}
        onOpenChange={(o) => !o && setImportPreview(null)}
        title="Import eval cases"
        description={importPreview?.fileName}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportPreview(null)}>Cancel</Button>
            <Button
              loading={importCsv.isPending}
              disabled={!importPreview || importPreview.parsed.errors.length > 0 || importPreview.parsed.cases.length === 0}
              onClick={() => importPreview && importCsv.mutate(importPreview.csv)}
            >
              Import {importPreview?.parsed.cases.length ?? 0} {importPreview?.parsed.cases.length === 1 ? 'case' : 'cases'}
            </Button>
          </>
        }
      >
        {importPreview && <ImportPreview parsed={importPreview.parsed} />}
      </Dialog>
    </div>
  )
}

function CaseRow({ c, result, open, onToggle, canDelete, onDelete }: {
  c: EvalCaseDto
  result: EvalResultDto | undefined
  open: boolean
  onToggle: () => void
  canDelete: boolean
  onDelete: () => void
}) {
  const detailId = `case-detail-${c.id}`
  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-surface-2">
        <td className="px-2 py-2 align-top">
          <button
            type="button"
            onClick={onToggle}
            disabled={!result}
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={result ? (open ? 'Hide output' : 'Show output') : 'No output yet'}
            className="rounded-md p-1 text-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
          >
            {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
          </button>
        </td>
        <td className="max-w-[360px] px-4 py-2.5 align-top"><p className="line-clamp-2 break-words">{c.input}</p></td>
        <td className="px-4 py-2.5 align-top text-muted">{describeExpectation(c.expectation)}</td>
        <td className="px-4 py-2.5 align-top">
          {!result ? <span className="text-muted">Not run</span> : result.passed
            ? <span className="flex items-center gap-1 text-success"><CheckCircle2 className="size-4" aria-hidden />Pass</span>
            : <span className="flex items-center gap-1 text-danger"><XCircle className="size-4" aria-hidden />Fail</span>}
        </td>
        <td className="px-2 py-2 align-top">
          {canDelete && (
            <Button variant="ghost" size="icon" aria-label="Delete case" onClick={onDelete}><Trash2 className="size-4" aria-hidden /></Button>
          )}
        </td>
      </tr>
      {open && result && (
        <tr id={detailId} className="border-b border-border bg-surface-2/50 last:border-0">
          <td />
          <td colSpan={4} className="space-y-2 px-4 py-3">
            <p className="text-xs font-medium text-muted">{result.reason}</p>
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-sm">{result.output || '—'}</p>
            {result.trace.length > 0 && (
              <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
                <span>Route:</span>
                {result.trace.map((t, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="rounded-md bg-surface px-1.5 py-0.5">{t}</span>
                    {i < result.trace.length - 1 && <ChevronRight className="size-3" aria-hidden />}
                  </span>
                ))}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function ScoreCard({ runs, threshold }: { runs: UseQueryResult<RunsResponse>; threshold: number | null }) {
  if (runs.isPending) return <Skeleton className="h-28 w-full" />
  if (runs.isError) return <Card><ErrorState title="Could not load run history" message={errMsg(runs.error, 'Please try again')} onRetry={() => runs.refetch()} className="py-6" /></Card>
  const items = runs.data.items
  const latest = items.find((r) => r.status === 'succeeded') ?? null
  if (items.length === 0) {
    return <Card><p className="text-sm text-muted">No runs yet. Run your evals to get a score and start the history.</p></Card>
  }
  const done = items.filter((r) => r.status === 'succeeded' && r.score !== null).slice().reverse()
  return (
    <Card className="grid gap-5 sm:grid-cols-[180px_1fr_220px]">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Latest score</p>
        <p className="mt-1 text-3xl font-semibold">{latest?.score ?? '—'}{latest?.score !== null && latest ? '%' : ''}</p>
        {latest && <p className="mt-1 text-xs text-muted">{latest.passed} passed · {latest.failed} failed · {timeAgo(latest.createdAt)}</p>}
      </div>
      <Sparkline scores={done.map((r) => r.score ?? 0)} threshold={threshold} />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Recent runs</p>
        <ul className="mt-2 space-y-1.5 text-sm">
          {items.slice(0, 5).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span className="text-muted">{timeAgo(r.createdAt)}</span>
              {r.status === 'succeeded'
                ? <Badge tone={threshold === null || (r.score ?? 0) >= threshold ? 'success' : 'warning'}>{r.score ?? 0}%</Badge>
                : <StatusPill status={r.status === 'failed' ? 'failed' : r.status === 'running' ? 'running' : 'queued'} />}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function Sparkline({ scores, threshold }: { scores: number[]; threshold: number | null }) {
  const w = 240
  const h = 64
  if (scores.length === 0) return <div />
  const step = scores.length > 1 ? w / (scores.length - 1) : 0
  const yFor = (s: number) => h - (s / 100) * (h - 8) - 4
  const pts = scores.map((s, i) => [scores.length > 1 ? i * step : w / 2, yFor(s)] as const)
  const label = `Score trend over the last ${scores.length} ${scores.length === 1 ? 'run' : 'runs'}: ${scores.map((s) => `${s}%`).join(', ')}${threshold === null ? '' : `; minimum ${threshold}%`}`
  return (
    <div className="flex flex-col justify-center">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Trend</p>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="mt-2 h-16 w-full text-primary-text">
        {threshold !== null && <line x1={0} x2={w} y1={yFor(threshold)} y2={yFor(threshold)} stroke="rgb(var(--color-muted))" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        {pts.length > 1 && <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.5} fill="currentColor" />)}
      </svg>
    </div>
  )
}

function ImportPreview({ parsed }: { parsed: CsvParseResult }) {
  return (
    <div className="space-y-3 text-sm">
      {parsed.errors.length > 0 ? (
        <Alert tone="danger">
          <p className="font-medium">Fix {parsed.errors.length === 1 ? 'this problem' : `these ${parsed.errors.length} problems`} and choose the file again:</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {parsed.errors.slice(0, 8).map((e, i) => <li key={i}>Line {e.line}: {e.message}</li>)}
            {parsed.errors.length > 8 && <li>…and {parsed.errors.length - 8} more</li>}
          </ul>
        </Alert>
      ) : (
        <Alert tone="success">{parsed.cases.length} {parsed.cases.length === 1 ? 'case is' : 'cases are'} ready to import.</Alert>
      )}
      {parsed.cases.length > 0 && parsed.errors.length === 0 && (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th scope="col" className="px-3 py-2 font-medium">Input</th><th scope="col" className="px-3 py-2 font-medium">Expectation</th></tr></thead>
            <tbody>
              {parsed.cases.slice(0, 50).map((c, i) => (
                <tr key={i} className="border-b border-border last:border-0"><td className="px-3 py-2"><p className="line-clamp-2 break-words">{c.input}</p></td><td className="px-3 py-2 text-muted">{describeExpectation(c.expectation)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">
        Format: <code className="font-mono">input,expected</code> — expected can be plain text (must contain), <code className="font-mono">not_contains: text</code>, <code className="font-mono">escalates</code>, <code className="font-mono">escalates: no</code> or <code className="font-mono">agent: key</code>. Up to {EVAL_LIMITS.MAX_IMPORT_ROWS} rows.
      </p>
    </div>
  )
}

function AddCaseDialog({ open, onOpenChange, base, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; base: string; onCreated: (c: EvalCaseDto) => void }) {
  const [input, setInput] = useState('')
  const [type, setType] = useState<ExpectationType>('contains')
  const [value, setValue] = useState('')
  const [escalates, setEscalates] = useState<'yes' | 'no'>('yes')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const ids = { input: useId(), type: useId(), value: useId(), inputErr: useId(), valueErr: useId(), hint: useId() }

  useEffect(() => {
    if (!open) { setInput(''); setType('contains'); setValue(''); setEscalates('yes'); setErrors({}) }
  }, [open])

  const create = useMutation({
    mutationFn: (body: CreateCaseInput) => apiFetch<{ case: EvalCaseDto }>(`${base}/cases`, { body }),
    onSuccess: ({ case: c }) => { onCreated(c); onOpenChange(false); toast.success('Eval case added') },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDATION_FAILED') {
        const fe = e.fieldErrors()
        setErrors({ input: fe.input?.[0], value: fe.expectation?.[0] ?? (fe.input ? undefined : e.message) })
      } else toast.error(errMsg(e, 'Could not add the case'))
    },
  })

  function submit() {
    const candidate = { input, expectation: type === 'escalates' ? { type, value: escalates } : { type, value } }
    const parsed = CreateCaseSchema.safeParse(candidate)
    if (!parsed.success) {
      const next: Record<string, string | undefined> = {}
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] === 'input' ? 'input' : 'value'
        next[k] ??= issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    create.mutate(parsed.data)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add eval case"
      description="A message to send to your agents and what the answer must satisfy."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={create.isPending} onClick={submit}>Add case</Button></>}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit() }} noValidate>
        <div>
          <Label htmlFor={ids.input}>Input</Label>
          <Textarea id={ids.input} rows={3} value={input} maxLength={EVAL_LIMITS.MAX_INPUT} invalid={!!errors.input}
            aria-describedby={errors.input ? ids.inputErr : ids.hint} onChange={(e) => setInput(e.target.value)} placeholder="How do I reset my password?" />
          {errors.input ? <FieldError id={ids.inputErr}>{errors.input}</FieldError> : <FieldHint id={ids.hint}>{input.length}/{EVAL_LIMITS.MAX_INPUT}</FieldHint>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={ids.type}>Expectation</Label>
            <Select id={ids.type} value={type} onChange={(e) => { setType(e.target.value as ExpectationType); setErrors((x) => ({ ...x, value: undefined })) }}>
              {(Object.keys(TYPE_LABELS) as ExpectationType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor={ids.value}>{type === 'escalates' ? 'Should escalate?' : type === 'agent' ? 'Agent key or name' : 'Text'}</Label>
            {type === 'escalates' ? (
              <Select id={ids.value} value={escalates} onChange={(e) => setEscalates(e.target.value as 'yes' | 'no')}>
                <option value="yes">Yes — hands off to a human</option>
                <option value="no">No — answered by agents</option>
              </Select>
            ) : (
              <Input id={ids.value} value={value} maxLength={type === 'agent' ? 60 : EVAL_LIMITS.MAX_VALUE} invalid={!!errors.value}
                aria-describedby={errors.value ? ids.valueErr : undefined} onChange={(e) => setValue(e.target.value)} placeholder={type === 'agent' ? 'support_agent' : 'reset'} />
            )}
            <FieldError id={ids.valueErr}>{errors.value}</FieldError>
          </div>
        </div>
        <button type="submit" className="sr-only" tabIndex={-1}>Add case</button>
      </form>
    </Dialog>
  )
}

function GateCard({ gate, canWrite, queryKey, base }: { gate: UseQueryResult<EvalGateDto>; canWrite: boolean; queryKey: readonly unknown[]; base: string }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<number | null>(null)
  const sliderId = useId()
  const hintId = useId()

  const save = useMutation({
    mutationFn: (body: { threshold?: number; blockProd?: boolean }) => apiFetch<{ gate: EvalGateDto }>(`${base}/gate`, { method: 'PATCH', body }).then((r) => r.gate),
    onSuccess: (g) => { qc.setQueryData(queryKey, g); setDraft(null) },
    onError: (e) => { setDraft(null); toast.error(errMsg(e, 'Could not save the deploy gate')) },
  })

  // Persist the slider after the user stops moving it.
  useEffect(() => {
    if (draft === null || !gate.data || draft === gate.data.threshold) return
    const t = setTimeout(() => save.mutate({ threshold: draft }), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, gate.data])

  const threshold = draft ?? gate.data?.threshold ?? 0

  return (
    <Card>
      <h2 className="flex items-center gap-2 font-semibold"><FlaskConical className="size-4 text-primary-text" aria-hidden />Deploy gate</h2>
      {gate.isPending ? (
        <Skeleton className="mt-4 h-12 w-full" />
      ) : gate.isError ? (
        <ErrorState title="Could not load the deploy gate" message={errMsg(gate.error, 'Please try again')} onRetry={() => gate.refetch()} className="py-6" />
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={sliderId}>Minimum score: {threshold}%</Label>
              <input id={sliderId} type="range" min={0} max={100} step={1} value={threshold} disabled={!canWrite}
                aria-describedby={hintId} aria-valuetext={`${threshold} percent`}
                onChange={(e) => setDraft(Number(e.target.value))}
                className="w-full accent-[rgb(var(--color-primary))] disabled:opacity-50" />
            </div>
            <label className={cn('flex items-center justify-between gap-3 text-sm', !canWrite && 'text-muted')}>
              Block production deploys below the minimum
              <Switch checked={gate.data.blockProd} disabled={!canWrite || save.isPending} onCheckedChange={(v) => save.mutate({ blockProd: v })} label="Block production deploys below the minimum score" />
            </label>
          </div>
          <p id={hintId} className="mt-3 text-xs text-muted" aria-live="polite">
            {!canWrite ? 'Only developers can change the deploy gate.' : save.isPending ? 'Saving…' : gate.data.configured ? 'Saved automatically.' : 'Not configured yet — the default minimum is shown.'}
          </p>
        </>
      )}
    </Card>
  )
}
