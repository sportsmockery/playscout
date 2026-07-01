const SOURCES = ['USA Football', 'NFHS', 'CDC', 'NATA', 'AAP', 'NOCSAE']

export function TrustBar() {
  return (
    <section className="border-y border-black/5 bg-white/40">
      <div className="container mx-auto flex flex-col items-center gap-4 px-4 py-8 text-center md:flex-row md:justify-between md:text-left">
        <p className="text-sm font-medium text-muted-foreground">
          Every recommendation traces back to recognized youth football and athlete-safety standards
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
          {SOURCES.map((source) => (
            <span key={source} className="text-sm font-semibold tracking-wide text-playscout-primary/70">
              {source}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
