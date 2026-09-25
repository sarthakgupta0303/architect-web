import { AppError } from '@/lib/api/errors'

/** Usage limits (docs/security/security-plan.md §5). Server and client safe — no secrets. */
export const LIMITS = {
  /** Prompt attachments (pdf, docx, md, txt, csv, images) — matches the project-attachments bucket. */
  MAX_ATTACHMENT_BYTES: 10 * 1024 * 1024,
  /** Project import archives (.zip) — matches the private imports bucket (docs/specs/import.md). */
  MAX_IMPORT_BYTES: 200 * 1024 * 1024,
  MAX_PDF_PAGES: 200,
  /** Chat messages to the assistant. */
  MAX_MESSAGE_LENGTH: 5000,
  /** App descriptions / generation prompts (PRD spec allows longer briefs). */
  MAX_PROMPT_LENGTH: 10000,
  /** Upper bound on conversation turns ever loaded for the model. */
  MAX_CHAT_HISTORY: clampInt(typeof process !== 'undefined' ? process.env.MAX_CHAT_HISTORY : undefined, 100, 1, 500),
} as const

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function assertMessageLength(text: string, max: number = LIMITS.MAX_MESSAGE_LENGTH): string {
  const trimmed = text.trim()
  if (!trimmed) throw new AppError('VALIDATION_FAILED', 'Type a message')
  if (trimmed.length > max) throw new AppError('VALIDATION_FAILED', `Messages can be at most ${max.toLocaleString()} characters`, { max })
  return trimmed
}

/** Counts pages in a PDF buffer by its page objects (no parser dependency). */
export function countPdfPages(bytes: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(bytes)
  const matches = text.match(/\/Type\s*\/Page(?!s)/g)
  return matches ? matches.length : 0
}

export function assertPdfPageCount(bytes: Uint8Array) {
  const pages = countPdfPages(bytes)
  if (pages > LIMITS.MAX_PDF_PAGES) throw new AppError('TOO_LARGE', `PDFs can have at most ${LIMITS.MAX_PDF_PAGES} pages (this one has ${pages})`, { pages })
  return pages
}

/** Keeps only the most recent turns allowed to reach the model. */
export function capHistory<T>(turns: T[], window: number): T[] {
  return turns.slice(-Math.min(window, LIMITS.MAX_CHAT_HISTORY))
}
