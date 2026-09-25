import { Skeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-20 sm:px-6 lg:pt-10" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="mt-3 h-5 w-96" />
      <Skeleton className="mt-6 h-52 w-full rounded-2xl" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
    </div>
  )
}
