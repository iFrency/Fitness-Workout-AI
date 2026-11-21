/**
 * Captures README screenshots of the main screens on a phone-sized viewport.
 * Usage: npx tsx tools/screenshots/capture.ts   (writes docs/screenshots/*.png)
 */
import { mkdirSync } from 'node:fs'
import { chromium, devices, type Page } from '@playwright/test'
import { createServer } from 'vite'

const PORT = 5181
const OUT = 'docs/screenshots'

const tap = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).first().click()

async function main(): Promise<void> {
  const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' })
  await server.listen()
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--autoplay-policy=no-user-gesture-required'] })
  try {
    mkdirSync(OUT, { recursive: true })
    const page = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage()
    const shot = (name: string) => page.screenshot({ path: `${OUT}/${name}.png` })
    await page.goto(`http://localhost:${PORT}/`)
    await tap(page, '我已了解并同意')

    await page.getByRole('tab', { name: '部位塑形' }).click()
    await tap(page, '腰腹')
    await tap(page, '臀腿')
    await tap(page, '10 分钟')
    await shot('home')
    await tap(page, '生成方案')
    await page.getByText(/预计/).waitFor()
    await shot('preview')
    await tap(page, '开始训练')
    await page.waitForTimeout(14_000)
    await shot('training')
    await tap(page, '跳过')
    await page.waitForTimeout(3_000)
    await shot('rest')

    await page.goto(`http://localhost:${PORT}/`)
    await page.getByRole('button', { name: '放弃' }).click().catch(() => {})
    await page.getByRole('tab', { name: '燃脂跳操' }).click()
    await tap(page, '生成方案')
    await tap(page, '开始训练')
    await page.waitForTimeout(16_000)
    await shot('dance')
    console.log(`saved screenshots to ${OUT}`)
  } finally {
    await browser.close()
    await server.close()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
