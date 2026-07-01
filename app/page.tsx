import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Hero } from '@/components/marketing/hero'
import { TrustBar } from '@/components/marketing/trust-bar'
import { FeatureGrid } from '@/components/marketing/feature-grid'
import { IntelligenceModules } from '@/components/marketing/intelligence-modules'
import { PhilosophySection } from '@/components/marketing/philosophy-section'
import { AgeLevelTabs } from '@/components/marketing/age-level-tabs'
import { OffenseDefenseTabs } from '@/components/marketing/offense-defense-tabs'
import { FilmAnalysisSteps } from '@/components/marketing/film-analysis-steps'
import { PracticeGameDay } from '@/components/marketing/practice-game-day'
import { DemoTeaser } from '@/components/marketing/demo-teaser'
import { FinalCta } from '@/components/marketing/final-cta'
import { FloatingAskButton } from '@/components/marketing/floating-ask-button'

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <TrustBar />
        <FilmAnalysisSteps />
        <FeatureGrid />
        <IntelligenceModules />
        <PhilosophySection />
        <AgeLevelTabs />
        <OffenseDefenseTabs />
        <PracticeGameDay />
        <DemoTeaser />
        <FinalCta />
      </main>
      <Footer />
      <FloatingAskButton />
    </div>
  )
}
