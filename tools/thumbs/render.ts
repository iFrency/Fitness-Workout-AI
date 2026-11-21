/**
 * Renders public/assets/thumbs/<clip>.png for every catalog exercise and the PWA icons.
 * Usage: npx tsx tools/thumbs/render.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const PORT = 5180
const ICON_HTML = (size: number) => `<div id="icon" style="width:${size}px;height:${size}px;background:#ffd23f;display:flex;
align-items:center;justify-content:center;font:900 ${Math.round(size * 0.62)}px 'Microsoft YaHei',sans-serif;color:#15110f;
border-radius:${Math.round(size * 0.22)}px">魔</div>`

async function main(): Promise<void> {
  const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' })
  await server.listen()
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}/tools/thumbs/index.html`)
    await page.waitForFunction(() => window.thumbsReady === true, undefined, { timeout: 60_000 })
    const catalog = JSON.parse(readFileSync('public/assets/catalog/exercises.json', 'utf8')) as { clip: string }[]
    mkdirSync('public/assets/thumbs', { recursive: true })
    for (const { clip } of catalog) {
      const dataUrl = await page.evaluate(name => window.renderClip!(name), clip)
      writeFileSync(`public/assets/thumbs/${clip}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'))
    }
    mkdirSync('public/assets/icons', { recursive: true })
    for (const size of [192, 512]) {
      await page.setContent(ICON_HTML(size))
      await page.locator('#icon').screenshot({ path: `public/assets/icons/icon-${size}.png`, omitBackground: true })
    }
    console.log(`rendered ${catalog.length} thumbnails and 2 icons`)
  } finally {
    await browser.close()
    await server.close()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
