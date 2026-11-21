import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.moxing.fitness',
  appName: '魔性健身',
  webDir: 'dist',
  backgroundColor: '#111111',
  plugins: {
    SystemBars: {
      // The app is dark, so the status and navigation bars need light icons.
      style: 'DARK',
    },
  },
  android: {
    // Every asset ships in the APK; the app never needs plain-http content.
    allowMixedContent: false,
  },
}

export default config
