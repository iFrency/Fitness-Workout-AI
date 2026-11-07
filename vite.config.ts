import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pwa = VitePWA({
  registerType: 'autoUpdate',
  // Icons are already matched by globPatterns; adding them again makes workbox throw on duplicate entries.
  includeManifestIcons: false,
  manifest: {
    name: '魔性健身',
    short_name: '魔性健身',
    display: 'standalone',
    theme_color: '#111111',
    background_color: '#111111',
    icons: [
      { src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,json,glb,png,mp3,mp4,wav,svg}'],
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    clientsClaim: true,
    skipWaiting: true,
  },
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), pwa],
  define: {
    'import.meta.env.VITE_ALLOW_SPEED': JSON.stringify(mode === 'e2e' ? 'true' : 'false'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      include: ['src/planner/**', 'src/player/**', 'src/beat/**'],
      thresholds: { lines: 80, branches: 80, functions: 80 },
    },
  },
}))
