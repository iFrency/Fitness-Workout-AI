import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { generatePlan, computeTotal } from '../../src/planner/generatePlan'
import type { Plan } from '../../src/planner/types'
import { DEFAULT_SETTINGS } from '../../src/storage/storage'
import { formatDuration, repsLabel } from '../../src/ui/format'
import { Home } from '../../src/ui/pages/Home'
import { Preview } from '../../src/ui/pages/Preview'
import { useAppStore } from '../../src/ui/store'
import { fixtureCatalog } from '../fixtures/catalog'

const accepted = { ...DEFAULT_SETTINGS, disclaimerAccepted: true }

function onePlan(): Plan {
  const p = generatePlan({ parts: ['腰腹'], minutes: 5, level: 1 }, fixtureCatalog, 1)
  const items = [{ ...p.items[0], restBeforeSeconds: 0 }]
  return { ...p, items, totalSeconds: computeTotal(items), shortfallSeconds: 0 }
}

beforeEach(() => {
  useAppStore.setState({ catalog: fixtureCatalog, settings: accepted, plan: null, page: 'home', input: { parts: [], minutes: 10, level: 1 } })
})

it('formats durations and reps', () => {
  expect(formatDuration(65.4)).toBe('01:05')
  expect(repsLabel(8, true)).toBe('左右各 8 次')
  expect(repsLabel(8, false)).toBe('8 次')
})

it('Home disables generate until a part is chosen', async () => {
  render(<Home />)
  expect(screen.getByRole('button', { name: '生成方案' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: '腰腹' }))
  expect(screen.getByRole('button', { name: '生成方案' })).toBeEnabled()
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
