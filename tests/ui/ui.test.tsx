import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { generatePlan, computeTotal } from '../../src/planner/generatePlan'
import type { Plan } from '../../src/planner/types'
import { DEFAULT_SETTINGS } from '../../src/storage/storage'
import { buildTimeline, stateAt } from '../../src/player/timeline'
import { formatDuration, secondsLabel } from '../../src/ui/format'
import { StatusPanel } from '../../src/ui/pages/Training'
import { Home } from '../../src/ui/pages/Home'
import { Preview } from '../../src/ui/pages/Preview'
import { useAppStore } from '../../src/ui/store'
import { fixtureCatalog } from '../fixtures/catalog'

const accepted = { ...DEFAULT_SETTINGS, disclaimerAccepted: true }

function onePlan(): Plan {
  const p = generatePlan({ mode: 'shape', parts: ['腰腹'], minutes: 5, level: 1 }, fixtureCatalog, 1)
  const items = [{ ...p.items[0], restBeforeSeconds: 0 }]
  return { ...p, items, totalSeconds: computeTotal(items), shortfallSeconds: 0 }
}

beforeEach(() => {
  useAppStore.setState({ catalog: fixtureCatalog, settings: { ...accepted, homeMode: 'dance' }, plan: null, page: 'home', shapeInput: { mode: 'shape', parts: [], minutes: 10, level: 1 } })
})

it('formats durations', () => {
  expect(formatDuration(65.4)).toBe('01:05')
})

it('secondsLabel', () => {
  expect(secondsLabel(30.4, false)).toBe('30 秒')
  expect(secondsLabel(30, true)).toBe('左右各 30 秒')
})

it('rest panel shows a countdown and the next exercise', () => {
  const plan = generatePlan({ mode: 'shape', parts: ['全身'], minutes: 10, level: 2 }, fixtureCatalog, 1)
  const steps = buildTimeline(plan)
  const rest = steps.find(s => s.kind === 'rest')!
  const byId = new Map(fixtureCatalog.map(e => [e.id, e]))
  render(<StatusPanel state={stateAt(steps, rest.start + 1)} plan={plan} byId={byId} />)
  expect(screen.getByTestId('countdown')).toHaveTextContent(String(Math.ceil(rest.end - rest.start - 1)))
  expect(screen.getByText(/下一个：/)).toBeInTheDocument()
})

it('Preview groups main items by round', () => {
  useAppStore.setState({ plan: generatePlan({ mode: 'shape', parts: ['肩颈'], minutes: 30, level: 1 }, fixtureCatalog, 1), page: 'preview' })
  render(<Preview />)
  expect(screen.getByText('主训 · 第 2 轮')).toBeInTheDocument()
})

it('Home disables generate until a part is chosen', async () => {
  render(<Home />)
  await userEvent.click(screen.getByRole('tab', { name: '部位塑形' }))
  expect(screen.getByRole('button', { name: '生成方案' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: '腰腹' }))
  expect(screen.getByRole('button', { name: '生成方案' })).toBeEnabled()
})

it('home shows the dance panel by default and switches to 部位塑形', async () => {
  render(<Home />)
  expect(screen.getByRole('tab', { name: '燃脂跳操' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('checkbox', { name: '安静模式（不跳）' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '腰腹' })).toBeNull()
  await userEvent.click(screen.getByRole('tab', { name: '部位塑形' }))
  expect(screen.getByRole('tab', { name: '部位塑形' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('button', { name: '腰腹' })).toBeInTheDocument()
})

it('quiet switch is checked and disabled at 入门', () => {
  render(<Home />)
  const box = screen.getByRole('checkbox', { name: '安静模式（不跳）' })
  expect(box).toBeChecked()
  expect(box).toBeDisabled()
  expect(screen.getByText('适合办公室和楼下有邻居')).toBeInTheDocument()
})

it('Home shows the disclaimer until accepted', () => {
  useAppStore.setState({ settings: DEFAULT_SETTINGS })
  render(<Home />)
  expect(screen.getByRole('button', { name: '我已了解并同意' })).toBeInTheDocument()
})

it('Preview disables delete with one item but keeps start enabled (Review Focus 4)', () => {
  useAppStore.setState({ plan: onePlan(), page: 'preview' })
  render(<Preview />)
  expect(screen.getByRole('button', { name: '删除' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '开始训练' })).toBeEnabled()
})

it('Preview shows shortfall notice', () => {
  useAppStore.setState({ plan: { ...onePlan(), shortfallSeconds: 120 }, page: 'preview' })
  render(<Preview />)
  expect(screen.getByText(/可选动作不足/)).toBeInTheDocument()
})
