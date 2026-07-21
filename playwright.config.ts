import { defineConfig, devices } from '@playwright/test'

/**
 * @smoke here covers only PUBLIC, unauthenticated routes — real page
 * boot, real rendering, no mocking. There is deliberately no authenticated
 * signup → team → upload → dashboard flow yet: that needs either a local
 * Supabase stack (this sandbox has no Docker to run `supabase start`) or a
 * dedicated staging Supabase project with seeded fixtures, and neither
 * exists. Building that flow untested against real infrastructure would
 * violate this repo's own verification standard more than not having it at
 * all — tracked as a follow-up, not silently declared done.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
