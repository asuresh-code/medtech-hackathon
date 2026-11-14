import { defineConfig, devices } from '@playwright/test'

// Load .env.local so the tests (and the admin client they use) see Supabase keys.
try {
  process.loadEnvFile('.env.local')
} catch {
  /* no .env.local — rely on the real environment */
}

// E2E runs against a live app + seeded Supabase.
//   Local:   npm run dev:full   (vercel dev → http://localhost:3000), then npm run e2e
//   Preview: E2E_BASE_URL=https://<preview>.vercel.app npm run e2e
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1, // tests share the seeded patient
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'pixel', use: { ...devices['Pixel 7'] } },
  ],
})
