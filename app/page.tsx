import { Navbar } from '@/components/layout/navbar'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-4">
        <h1 className="text-5xl font-bold tracking-tight">
          <span className="text-primary">Play</span>Scout
        </h1>
        <p className="text-muted-foreground text-lg max-w-md">
          AI-powered scouting platform. Coming soon.
        </p>
      </main>
    </div>
  )
}
