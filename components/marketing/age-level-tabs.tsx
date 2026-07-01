'use client'

import { motion } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { AGE_LEVELS } from '@/lib/content/age-levels'
import { SectionHeading } from '@/components/marketing/section-heading'
import { CheckCircle2, XCircle } from 'lucide-react'

export function AgeLevelTabs() {
  return (
    <section className="container mx-auto px-4 py-24">
      <SectionHeading
        eyebrow="Age-Level Intelligence"
        title="Calibrated to exactly where your players are"
        description="Every rubric, drill, and recommendation is filtered through age band and game type before it ever reaches a coach."
        className="mb-12"
      />

      <Tabs defaultValue="10U" className="w-full">
        <TabsList className="mx-auto mb-8 flex w-full max-w-xl flex-wrap justify-center gap-1 bg-transparent">
          {AGE_LEVELS.map((level) => (
            <TabsTrigger
              key={level.level}
              value={level.level}
              className="rounded-full border border-black/10 px-5 py-2 data-[state=active]:bg-playscout-primary data-[state=active]:text-white"
            >
              {level.level}
            </TabsTrigger>
          ))}
        </TabsList>

        {AGE_LEVELS.map((level) => (
          <TabsContent key={level.level} value={level.level}>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="glass-card mx-auto grid max-w-4xl gap-8 rounded-3xl p-8 md:grid-cols-2"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-playscout-primary text-white">{level.ages}</Badge>
                  <Badge variant="outline">{level.gameType}</Badge>
                </div>
                <dl className="grid gap-2 text-sm">
                  <div>
                    <dt className="font-semibold text-playscout-ink">Practice</dt>
                    <dd className="text-muted-foreground">{level.practice}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-playscout-ink">Contact emphasis</dt>
                    <dd className="text-muted-foreground">{level.contact}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-playscout-ink">Success looks like</dt>
                    <dd className="text-muted-foreground">{level.successLooksLike}</dd>
                  </div>
                </dl>
              </div>

              <div className="flex flex-col gap-5">
                <div>
                  <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-playscout-ink">
                    <CheckCircle2 className="size-4 text-playscout-primary" /> What to install
                  </h4>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {level.install.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-playscout-ink">
                    <XCircle className="size-4 text-destructive" /> What to avoid
                  </h4>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {level.avoid.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}
