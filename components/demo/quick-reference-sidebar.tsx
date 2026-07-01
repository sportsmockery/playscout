'use client'

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { QUICK_REFERENCE } from '@/lib/content/demo-data'
import { EXAMPLE_QUERIES } from '@/lib/content/demo-data'

interface QuickReferenceSidebarProps {
  onSelectQuery: (query: string) => void
}

export function QuickReferenceSidebar({ onSelectQuery }: QuickReferenceSidebarProps) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6 p-4">
        <div>
          <h3 className="mb-3 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Try asking
          </h3>
          <div className="flex flex-col gap-1.5">
            {EXAMPLE_QUERIES.map((query) => (
              <button
                key={query}
                onClick={() => onSelectQuery(query)}
                className="rounded-lg border border-black/10 bg-white/60 px-3 py-2 text-left text-xs leading-snug text-playscout-ink transition-colors hover:border-playscout-primary/40 hover:bg-playscout-primary/5"
              >
                {query}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-1 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Quick Reference
          </h3>
          <Accordion multiple className="w-full">
            {QUICK_REFERENCE.map((section) => (
              <AccordionItem key={section.title} value={section.title}>
                <AccordionTrigger className="text-sm font-semibold text-playscout-ink">
                  {section.title}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-3 pb-2">
                    {section.items.map((item) => (
                      <div key={item.title}>
                        <p className="text-xs font-semibold text-playscout-primary">{item.title}</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">{item.content}</p>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </ScrollArea>
  )
}
