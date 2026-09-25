import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError, fromPostgrest } from '@/lib/api/errors'
import { getProjectAccess } from '@/lib/core/access'

/**
 * Read-only browser over the project's own rows. Always uses the caller's session client, so
 * row-level security decides what is visible; tables the caller cannot read (or that do not
 * exist yet, e.g. chat_messages before migration 002) are left out.
 */

export const DATA_TABLES = ['agents', 'runs', 'chat_messages'] as const
export type DataTable = (typeof DATA_TABLES)[number]
export const DATA_PAGE_SIZE = 50

type Cell = string | number | boolean | null
type TableSpec = { columns: string[]; order: string; numeric?: string[]; truncate?: Record<string, number> }

const SPECS: Record<DataTable, TableSpec> = {
  agents: { columns: ['key', 'name', 'type', 'model', 'updated_at'], order: 'updated_at' },
  runs: { columns: ['created_at', 'status', 'latency_ms', 'cost', 'input_preview', 'output_preview'], order: 'created_at', numeric: ['latency_ms', 'cost'] },
  chat_messages: { columns: ['role', 'content', 'context_type', 'created_at'], order: 'created_at', truncate: { content: 200 } },
}

export type DataTableSummaryDto = { name: DataTable; rowCount: number; columns: string[] }
export type DataPageDto = { table: DataTable; columns: string[]; rows: Record<string, Cell>[]; page: number; pageSize: number; total: number; hasMore: boolean }

function unavailable(err: { code?: string }): boolean {
  // 42P01/PGRST205: table missing · 42501: no privilege for this role
  return err.code === '42P01' || err.code === 'PGRST205' || err.code === '42501'
}

function toCell(value: unknown, column: string, spec: TableSpec): Cell {
  if (value === null || value === undefined) return null
  if (spec.numeric?.includes(column)) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  if (typeof value === 'string') {
    const max = spec.truncate?.[column]
    return max && value.length > max ? `${value.slice(0, max)}…` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  return JSON.stringify(value)
}

export async function listDataTables(supabase: SupabaseClient, userId: string, projectId: string): Promise<{ tables: DataTableSummaryDto[] }> {
  await getProjectAccess(supabase, projectId, userId, 'project:read')
  const counts = await Promise.all(
    DATA_TABLES.map(async (name) => {
      const { count, error } = await supabase.from(name).select('id', { count: 'exact', head: true }).eq('project_id', projectId)
      if (error) {
        if (unavailable(error)) return null
        throw fromPostgrest(error, `Could not count rows in ${name}`)
      }
      return { name, rowCount: count ?? 0, columns: SPECS[name].columns }
    }),
  )
  return { tables: counts.filter((t): t is DataTableSummaryDto => t !== null) }
}

export async function getDataPage(supabase: SupabaseClient, userId: string, projectId: string, table: DataTable, page: number): Promise<DataPageDto> {
  await getProjectAccess(supabase, projectId, userId, 'project:read')
  const spec = SPECS[table]
  const from = (page - 1) * DATA_PAGE_SIZE
  const { data, error, count } = await supabase
    .from(table)
    .select(spec.columns.join(', '), { count: 'exact' })
    .eq('project_id', projectId)
    .order(spec.order, { ascending: false })
    .range(from, from + DATA_PAGE_SIZE - 1)
  if (error) {
    if (unavailable(error)) throw new AppError('NOT_FOUND', 'Table not found')
    // Asking for a page past the end returns 416 / PGRST103 — treat it as an empty page.
    if (error.code === 'PGRST103') return { table, columns: spec.columns, rows: [], page, pageSize: DATA_PAGE_SIZE, total: count ?? 0, hasMore: false }
    throw fromPostgrest(error, `Could not load rows from ${table}`)
  }
  const raw = (data ?? []) as unknown as Record<string, unknown>[]
  const rows = raw.map((r) => Object.fromEntries(spec.columns.map((c) => [c, toCell(r[c], c, spec)])))
  const total = count ?? rows.length
  return { table, columns: spec.columns, rows, page, pageSize: DATA_PAGE_SIZE, total, hasMore: from + rows.length < total }
}
