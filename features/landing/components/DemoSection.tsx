import { ProductDemo } from './demo/ProductDemo'
import { SectionHeading } from './SectionHeading'

export function DemoSection() {
  return (
    <section id="demo" aria-labelledby="demo-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeading
        id="demo-title"
        eyebrow="See it in action"
        title="From one sentence to a live support agent"
        intro="Watch Architect turn a request for an e-commerce support agent into a planned, built, tested and deployed app. Hover to pause, or pick a step."
      />
      <div className="mt-10">
        <ProductDemo />
      </div>
    </section>
  )
}
