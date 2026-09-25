import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Lowercase, hyphen-separated slug (a–z, 0–9, -). */
export function slugify(input: string, max = 40): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
}

/** Project name from a prompt: first 6 meaningful words, title-cased, ≤ 80 chars. */
export function projectNameFromPrompt(prompt: string): string {
  const stop = new Set(['build', 'create', 'make', 'a', 'an', 'the', 'me', 'please', 'that', 'which', 'for', 'our', 'my', 'i', 'want', 'to'])
  const words = prompt
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const meaningful = words.filter((w) => !stop.has(w.toLowerCase()))
  const picked = (meaningful.length >= 2 ? meaningful : words).slice(0, 6)
  const name = picked.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  return (name || 'Untitled project').slice(0, 80)
}

/** Agent key: lowercase snake case starting with a letter, ≤ 40 chars. */
export function agentKeyFromName(name: string): string {
  let key = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!/^[a-z]/.test(key)) key = `agent_${key}`
  return key.slice(0, 40).replace(/_+$/g, '') || 'agent'
}

/** Only allow same-origin relative paths for post-auth redirects. */
export function safeNext(next: string | null | undefined, fallback = '/app'): string {
  if (!next || next.length > 512) return fallback
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?'
}

export function firstName(name: string | null | undefined): string | null {
  if (!name) return null
  return name.trim().split(/\s+/)[0] ?? null
}

export function formatCredits(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function formatUsd(n: number, digits = 2): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** Deterministic PRNG (mulberry32) seeded from a string — used by demo data. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
