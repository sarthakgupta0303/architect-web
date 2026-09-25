'use client'

import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Kbd } from '@/components/ui/Kbd'

export const PROMPT_EXAMPLES = [
  { label: 'Support agent', prompt: 'Build a customer support agent that reads our Zendesk tickets, answers FAQs from our Notion docs and escalates angry customers to Slack.' },
  { label: 'SDR agent', prompt: 'Build an SDR agent that researches inbound leads, scores them against our ICP and drafts personalised outreach emails in Gmail.' },
  { label: 'Research assistant', prompt: 'Build a research assistant that searches the web, summarises sources with citations and saves reports to Google Drive.' },
  { label: 'Invoice processor', prompt: 'Build an invoice processor that extracts line items from emailed PDFs, validates totals and asks a manager to approve anything over $1,000.' },
]

/** Prompt box used on the landing page and the dashboard (design-system §4.9). */
export function PromptComposer({ onSubmit, submitting, submitLabel = 'Plan my app', autoFocus, initial = '' }: {
  onSubmit: (prompt: string) => void
  submitting?: boolean
  submitLabel?: string
  autoFocus?: boolean
  initial?: string
}) {
  const [prompt, setPrompt] = useState(initial)
  const trimmed = prompt.trim()

  function submit() {
    if (!trimmed || submitting) return
    onSubmit(trimmed.slice(0, 10000))
  }

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => { e.preventDefault(); submit() }}
        className="rounded-2xl border border-border bg-surface p-3 shadow-glow transition-colors focus-within:border-primary"
      >
        <label className="block">
          <span className="sr-only">Describe the agentic app you want to build</span>
          <textarea
            value={prompt}
            autoFocus={autoFocus}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }}
            rows={4}
            maxLength={10000}
            placeholder="Describe the agentic app you want to build…"
            className="w-full resize-none bg-transparent px-2 py-1 text-base text-fg placeholder:text-muted focus:outline-none"
          />
        </label>
        <div className="flex items-center justify-end gap-3 px-1 pt-2 sm:justify-between">
          <span className="hidden text-xs text-muted sm:inline">You review the plan and cost before anything is built · <Kbd>⌘</Kbd> <Kbd>Enter</Kbd></span>
          <Button type="submit" className="rounded-full" disabled={!trimmed} loading={submitting}>
            {submitLabel} {!submitting && <ArrowRight className="size-4" aria-hidden />}
          </Button>
        </div>
      </form>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {PROMPT_EXAMPLES.map((ex) => (
          <button key={ex.label} type="button" className="chip" onClick={() => setPrompt(ex.prompt)}>{ex.label}</button>
        ))}
      </div>
    </div>
  )
}
