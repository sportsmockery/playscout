import { ShieldCheck } from 'lucide-react'

const SOURCES = ['USA Football', 'NFHS', 'CDC', 'NATA', 'AAP', 'NOCSAE']

export function TrustBar() {
  return (
    <section className="border-y border-black/5 bg-white">
      <div className="container mx-auto flex flex-col items-center gap-5 px-4 py-10 text-center md:flex-row md:justify-between md:text-left">
        <p className="max-w-sm text-sm font-medium text-muted-foreground">
          Every recommendation traces back to recognized youth football and athlete-safety standards
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {SOURCES.map((source) => (
            <span
              key={source}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-playscout-bg-alt px-3.5 py-1.5 text-xs font-semibold tracking-wide text-playscout-primary/80"
            >
              <ShieldCheck className="size-3.5 text-playscout-gold" />
              {source}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
