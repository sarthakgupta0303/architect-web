'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Database, Download, Search, ShieldCheck, Table2 } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { ApiError, apiFetch } from '@/lib/api/client'
import type { DataPageDto, DataTable, DataTableSummaryDto } from '@/lib/core/services/data-service'
import { cn } from '@/lib/utils'
import { useProject } from '../context'

type Cell = DataPageDto['rows'][number][string]

const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)

function display(v: Cell): string {
  if (v === null) return '—'
  return String(v)
}

function csvEscape(v: Cell): string {
  if (v === null) return ''
  let s = String(v)
  // Neutralise spreadsheet formula injection for values opened in Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(filename: string, columns: string[], rows: DataPageDto['rows']) {
  const lines = [columns.join(','), ...rows.map((r) => columns.map((c) => csvEscape(r[c] ?? null)).join(','))]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function DataPanel() {
  const { project } = useProject()
  const base = `/api/projects/${project.id}/data`
  const tables = useQuery({ queryKey: ['data', project.id, 'tables'], queryFn: () => apiFetch<{ tables: DataTableSummaryDto[] }>(base) })
  const [selected, setSelected] = useState<DataTable | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const searchId = useId()

  useEffect(() => {
    const list = tables.data?.tables
    if (list?.length && (!selected || !list.some((t) => t.name === selected))) setSelected(list[0]!.name)
  }, [tables.data, selected])

  const rows = useQuery({
    queryKey: ['data', project.id, 'rows', selected, page],
    queryFn: () => apiFetch<DataPageDto>(`${base}/${selected}?page=${page}`),
    enabled: !!selected,
    placeholderData: keepPreviousData,
  })

  function pick(name: DataTable) {
    setSelected(name)
    setPage(1)
    setSearch('')
  }

  const filtered = useMemo(() => {
    const data = rows.data
    if (!data) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.rows
    return data.rows.filter((r) => data.columns.some((c) => display(r[c] ?? null).toLowerCase().includes(q)))
  }, [rows.data, search])

  const data = rows.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
        <div>
          <h1 className="text-xl font-semibold">Data</h1>
          <p className="text-sm text-muted">Your project’s rows, read-only.</p>
        </div>

        {tables.isPending ? (
          <div className="grid gap-4 md:grid-cols-[220px_1fr]"><Skeleton className="h-40" /><Skeleton className="h-80" /></div>
        ) : tables.isError ? (
          <Card><ErrorState message={errMsg(tables.error, 'Could not load tables')} onRetry={() => tables.refetch()} /></Card>
        ) : tables.data.tables.length === 0 ? (
          <Card><EmptyState icon={Database} title="No tables to show" body="None of this project’s tables are readable with your access." /></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <Card className="h-fit p-2">
              <p id="data-tables-label" className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted">Tables</p>
              <ul aria-labelledby="data-tables-label" className="space-y-0.5">
                {tables.data.tables.map((t) => (
                  <li key={t.name}>
                    <button
                      type="button"
                      onClick={() => pick(t.name)}
                      aria-current={selected === t.name ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                        selected === t.name ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg',
                      )}
                    >
                      <Table2 className="size-4 shrink-0" aria-hidden />
                      <span className="flex-1 truncate font-mono text-[13px]">{t.name}</span>
                      <span className="text-xs tabular-nums text-muted" aria-label={`${t.rowCount} rows`}>{t.rowCount.toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="min-w-0 p-0">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <h2 className="mr-auto font-mono text-[13px] font-semibold">{selected}</h2>
                <div className="relative">
                  <label htmlFor={searchId} className="sr-only">Search this page</label>
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
                  <Input id={searchId} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this page" className="h-8 w-52 pl-8 text-xs" />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!data || filtered.length === 0}
                  onClick={() => {
                    if (!data) return
                    downloadCsv(`${data.table}-page-${data.page}.csv`, data.columns, filtered)
                    toast.success(`Exported ${filtered.length} ${filtered.length === 1 ? 'row' : 'rows'}`)
                  }}
                >
                  <Download className="size-4" aria-hidden />Export CSV
                </Button>
              </div>

              {rows.isPending ? (
                <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
              ) : rows.isError ? (
                <ErrorState message={errMsg(rows.error, 'Could not load rows')} onRetry={() => rows.refetch()} />
              ) : !data || data.rows.length === 0 ? (
                <EmptyState icon={Table2} title="No rows yet" body={`${selected} has no rows for this project.`} />
              ) : filtered.length === 0 ? (
                <EmptyState icon={Search} title="No matches on this page" body="Try a different search, or move to another page." />
              ) : (
                <div className={cn('overflow-x-auto', rows.isFetching && 'opacity-60')} aria-busy={rows.isFetching}>
                  <table className="w-full text-sm">
                    <caption className="sr-only">{`${data.table}, page ${data.page} of ${totalPages}`}</caption>
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted">
                        {data.columns.map((c) => <th key={c} scope="col" className="whitespace-nowrap px-4 py-3 font-mono font-medium">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r, i) => (
                        <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-2">
                          {data.columns.map((c) => {
                            const v = display(r[c] ?? null)
                            return <td key={c} className="max-w-[320px] truncate px-4 py-2.5" title={v}>{v}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {data && data.total > 0 && (
                <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted">
                  <span>
                    {`Rows ${(data.page - 1) * data.pageSize + 1}–${(data.page - 1) * data.pageSize + data.rows.length} of ${data.total.toLocaleString()}`}
                    {search.trim() && ` · ${filtered.length} shown`}
                  </span>
                  <nav className="flex items-center gap-1" aria-label="Pagination">
                    <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page <= 1 || rows.isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="size-4" aria-hidden /></Button>
                    <span aria-live="polite">Page {data.page} of {totalPages}</span>
                    <Button variant="ghost" size="icon" aria-label="Next page" disabled={!data.hasMore || rows.isFetching} onClick={() => setPage((p) => p + 1)}><ChevronRight className="size-4" aria-hidden /></Button>
                  </nav>
                </div>
              )}
            </Card>
          </div>
        )}

        <p className="flex items-center gap-2 text-xs text-muted">
          <ShieldCheck className="size-3.5 text-success" aria-hidden />
          Every table has row-level security — you only see rows your role in this workspace can read.
        </p>
      </div>
    </div>
  )
}
