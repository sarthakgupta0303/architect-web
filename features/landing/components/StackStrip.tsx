import { STACK } from '../data'

export function StackStrip() {
  return (
    <section aria-labelledby="stack-title" className="border-y border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h2 id="stack-title" className="text-center text-xs font-medium uppercase tracking-wider text-muted">
          Works with the frameworks and tools your team already uses
        </h2>
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:gap-x-10">
          {STACK.map((name) => (
            <li key={name} className="font-mono text-sm font-medium text-fg/80">{name}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
