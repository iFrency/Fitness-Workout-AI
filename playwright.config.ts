import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { ...devices['Pixel 7'], baseURL: 'http://localhost:4183' },
  webServer: {
    command: 'npm run build:e2e && npx vite preview --port 4183 --strictPort',
    url: 'http://localhost:4183',
    timeout: 180_000,
    reuseExistingServer: false,
  },
})
