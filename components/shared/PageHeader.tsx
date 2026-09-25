import type { ReactNode } from 'react'

/** Standard top-of-page header for workspace-level pages. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <main id="main" className="mx-auto w-full max-w-7xl px-4 pb-16 pt-20 sm:px-6 lg:pt-10">{children}</main>
}
