'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SectionHeading } from '@/components/marketing/section-heading'
import {
  OFFENSIVE_FAMILIES,
  OFFENSIVE_PLAY_FAMILY,
  DEFENSIVE_STRUCTURES,
  DEFENSIVE_CONCEPTS,
} from '@/lib/content/offense-defense'

export function OffenseDefenseTabs() {
  return (
    <section className="bg-white py-20 md:py-24">
      <div className="container mx-auto px-4">
        <SectionHeading
          eyebrow="Scheme Intelligence"
          title="Offense & defense philosophies"
          description="Concept families matched to age band, plus the mistakes PlayScout watches for on film."
          className="mb-12"
        />

        <Tabs defaultValue="offense" className="mx-auto max-w-5xl">
          <TabsList className="mx-auto mb-8 flex w-full max-w-xs gap-1 bg-transparent">
            <TabsTrigger
              value="offense"
              className="flex-1 rounded-full border border-black/10 data-[state=active]:bg-playscout-primary data-[state=active]:text-white"
            >
              Offense
            </TabsTrigger>
            <TabsTrigger
              value="defense"
              className="flex-1 rounded-full border border-black/10 data-[state=active]:bg-playscout-primary data-[state=active]:text-white"
            >
              Defense
            </TabsTrigger>
          </TabsList>

          <TabsContent value="offense" className="grid gap-8 md:grid-cols-2">
            <div className="glass-card rounded-2xl p-6">
              <h3 className="mb-4 font-semibold text-playscout-ink">Concept families</h3>
              <div className="space-y-4">
                {OFFENSIVE_FAMILIES.map((f) => (
                  <div key={f.name} className="border-b border-black/5 pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-semibold text-playscout-ink">{f.name}</p>
                    <p className="text-xs text-muted-foreground">Best fit: {f.bestFit}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{f.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-card rounded-2xl p-6">
              <h3 className="mb-1 font-semibold text-playscout-ink">Core play family structure</h3>
              <p className="mb-4 text-xs text-muted-foreground">{OFFENSIVE_PLAY_FAMILY.title}</p>
              <div className="space-y-4">
                {OFFENSIVE_PLAY_FAMILY.plays.map((p) => (
                  <div key={p.name} className="border-b border-black/5 pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-semibold text-playscout-ink">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.rationale}</p>
                    <p className="mt-1 text-xs text-playscout-primary">Common error: {p.commonError}</p>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="defense" className="grid gap-8 md:grid-cols-2">
            <div className="glass-card rounded-2xl p-6">
              <h3 className="mb-4 font-semibold text-playscout-ink">Structure recommendations</h3>
              <div className="space-y-4">
                {DEFENSIVE_STRUCTURES.map((f) => (
                  <div key={f.name} className="border-b border-black/5 pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-semibold text-playscout-ink">{f.name}</p>
                    <p className="text-xs text-muted-foreground">Best fit: {f.bestFit}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{f.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-card rounded-2xl p-6">
              <h3 className="mb-4 font-semibold text-playscout-ink">Core concepts & common errors</h3>
              <div className="space-y-4">
                {DEFENSIVE_CONCEPTS.map((c) => (
                  <div key={c.name} className="border-b border-black/5 pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-semibold text-playscout-ink">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.steps}</p>
                    <p className="mt-1 text-xs text-playscout-primary">Common error: {c.commonError}</p>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}
