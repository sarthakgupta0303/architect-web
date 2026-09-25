import { z } from 'zod'
import { LIMITS } from './tokenLimiter'

/**
 * Upload validation (docs/security/security-plan.md §7). Shared by the browser (early
 * feedback) and the server (authoritative). Order: extension blocklist → allowlist → MIME → size.
 */
export type UploadKind = 'attachment' | 'import'

const BLOCKED_EXTENSIONS = ['exe', 'js', 'mjs', 'cjs', 'php', 'sh', 'bat', 'cmd', 'py', 'rb', 'ps1', 'msi', 'dll', 'com', 'scr', 'jar', 'vbs', 'html', 'htm', 'svg']

const ALLOWED: Record<UploadKind, Record<string, string[]>> = {
  attachment: {
    pdf: ['application/pdf'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    md: ['text/markdown', 'text/x-markdown', 'text/plain'],
    txt: ['text/plain'],
    csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
    png: ['image/png'],
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    webp: ['image/webp'],
  },
  // Imports are the only place archives are accepted; they are scanned in an isolated sandbox (zip-slip and size checks).
  import: { zip: ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip'] },
}

const MAX_BYTES: Record<UploadKind, number> = { attachment: LIMITS.MAX_ATTACHMENT_BYTES, import: LIMITS.MAX_IMPORT_BYTES }

export type FileMeta = { name: string; type: string; size: number }
export type FileCheck = { ok: true; extension: string } | { ok: false; code: 'BLOCKED_TYPE' | 'UNSUPPORTED_TYPE' | 'MIME_MISMATCH' | 'TOO_LARGE' | 'EMPTY' | 'BAD_NAME'; message: string }

export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function validateFileUpload(file: FileMeta, kind: UploadKind): FileCheck {
  const name = file.name.normalize('NFKC')
  if (!name || name.length > 200 || /[\u0000-\u001F]/.test(name) || name.includes('..')) return { ok: false, code: 'BAD_NAME', message: 'That file name is not allowed' }
  // Double extensions like "report.pdf.exe" — check every segment against the blocklist.
  const segments = name.toLowerCase().split('.').slice(1)
  if (segments.some((s) => BLOCKED_EXTENSIONS.includes(s))) return { ok: false, code: 'BLOCKED_TYPE', message: 'Executable and script files cannot be uploaded' }
  const ext = fileExtension(name)
  const allowed = ALLOWED[kind][ext]
  if (!allowed) return { ok: false, code: 'UNSUPPORTED_TYPE', message: `Allowed types: ${Object.keys(ALLOWED[kind]).map((e) => `.${e}`).join(', ')}` }
  if (!allowed.includes(file.type)) return { ok: false, code: 'MIME_MISMATCH', message: `The file content type (${file.type || 'unknown'}) does not match .${ext}` }
  if (file.size <= 0) return { ok: false, code: 'EMPTY', message: 'The file is empty' }
  if (file.size > MAX_BYTES[kind]) return { ok: false, code: 'TOO_LARGE', message: `Files can be at most ${Math.round(MAX_BYTES[kind] / 1024 / 1024)} MB` }
  return { ok: true, extension: ext }
}

/** Magic-byte check on the first bytes of an uploaded object (server side, after upload). */
export function sniffMatchesExtension(bytes: Uint8Array, ext: string): boolean {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b)
  switch (ext) {
    case 'pdf': return starts([0x25, 0x50, 0x44, 0x46])
    case 'docx':
    case 'zip': return starts([0x50, 0x4b, 0x03, 0x04]) || starts([0x50, 0x4b, 0x05, 0x06])
    case 'png': return starts([0x89, 0x50, 0x4e, 0x47])
    case 'jpg':
    case 'jpeg': return starts([0xff, 0xd8, 0xff])
    case 'webp': return starts([0x52, 0x49, 0x46, 0x46])
    default: return !bytes.slice(0, 512).some((b) => b === 0)
  }
}

export const UploadRequestSchema = z.object({
  kind: z.enum(['attachment', 'import']),
  projectId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  filename: z.string().min(1).max(200),
  contentType: z.string().max(120),
  size: z.number().int().positive(),
}).refine((v) => (v.kind === 'attachment' ? !!v.projectId : !!v.workspaceId), { message: 'Missing project or workspace', path: ['projectId'] })

// Re-export request schemas so routes import validation from one place.
export * from '@/lib/contracts/auth'
export * from '@/lib/contracts/onboarding'
export * from '@/lib/contracts/projects'
export * from '@/lib/contracts/agents'
export * from '@/lib/contracts/generation'
