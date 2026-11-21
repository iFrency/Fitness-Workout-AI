import { expect, test, type Page } from '@playwright/test'
import { preview } from 'vite'

async function runWorkout(page: Page) {
  await page.getByRole('tab', { name: '部位塑形' }).click()
  await page.getByRole('button', { name: '腰腹' }).click()
  await page.getByRole('button', { name: '5 分钟', exact: true }).click()
  await page.getByRole('button', { name: '生成方案' }).click()
  await expect(page.getByText(/预计/)).toBeVisible({ timeout: 3000 })
  await page.getByRole('button', { name: '开始训练' }).click()
  await expect(page.getByText(/完成 \d+ \/ \d+ 个动作/)).toBeVisible({ timeout: 30000 })
}

test('select, preview, train, finish, record', async ({ page }) => {
  await page.goto('/?speed=60')
  await page.getByRole('button', { name: '我已了解并同意' }).click()
  await runWorkout(page)
  await expect(page.getByText('本次记录无法保存')).toHaveCount(0)
})

test('dance class: select, preview, train', async ({ page }) => {
  await page.goto('/?speed=60')
  await page.getByRole('button', { name: '我已了解并同意' }).click()
  await page.getByRole('tab', { name: '燃脂跳操' }).click()
  await page.getByRole('button', { name: '10 分钟', exact: true }).click()
  await page.getByRole('button', { name: '进阶' }).click()
  await page.getByRole('button', { name: '生成方案' }).click()
  await expect(page.getByRole('heading', { name: '热身' })).toBeVisible({ timeout: 3000 })
  await expect(page.getByRole('heading', { name: /第 1 段/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: '放松' })).toBeVisible()
  await page.getByRole('button', { name: '开始训练' }).click()
  await expect(page.getByTestId('beat-dots')).toBeVisible()
  await expect(page.getByText('下一个')).toBeVisible({ timeout: 30000 })
})

test('works offline after first visit', async ({ page }) => {
  // Browser network emulation blocks navigations before the service worker sees them,
  // so serve the build from a private server and shut it down to make the network truly unavailable.
  const PORT = 4175
  const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'error' })
  const url = `http://localhost:${PORT}/?speed=60`
  try {
    await page.goto(url)
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
    await page.reload()
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  } finally {
    const http = server.httpServer
    if ('closeAllConnections' in http) http.closeAllConnections()
    await new Promise<void>(resolve => server.httpServer.close(() => resolve()))
  }
  await page.reload()
  await page.getByRole('button', { name: '我已了解并同意' }).click()
  await runWorkout(page)
})
