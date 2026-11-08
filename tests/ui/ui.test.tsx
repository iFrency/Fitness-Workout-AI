import { readFileSync } from 'node:fs'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { generatePlan, computeTotal } from '../../src/planner/generatePlan'
import type { Plan } from '../../src/planner/types'
import { DEFAULT_SETTINGS } from '../../src/storage/storage'
import { buildTimeline, stateAt } from '../../src/player/timeline'
import { formatDuration, secondsLabel } from '../../src/ui/format'
import { StatusPanel, TrainingStatus } from '../../src/ui/pages/Training'
import { Home } from '../../src/ui/pages/Home'
import { Preview } from '../../src/ui/pages/Preview'
import { useAppStore } from '../../src/ui/store'
import { fixtureCatalog } from '../fixtures/catalog'
import { parseCatalog } from '../../src/catalog/types'
import { compileRoutine } from '../../src/dance/compileRoutine'
import { generateRoutine } from '../../src/dance/generateRoutine'
import { beatSeconds } from '../../src/planner/timing'
import { DanceStatus } from '../../src/ui/components/DanceStatus'
import { Done } from '../../src/ui/pages/Done'

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

const realCatalog = parseCatalog(JSON.parse(readFileSync('public/assets/catalog/exercises.json', 'utf8')))
const dancePlan = compileRoutine(generateRoutine({ mode: 'dance', minutes: 10, level: 2, quiet: false }, realCatalog, 3), realCatalog)
const realById = new Map(realCatalog.map(e => [e.id, e]))

function setDance() {
  useAppStore.setState({ catalog: realCatalog, plan: dancePlan, page: 'preview' })
}

it('dance preview groups 热身, 第 1 段 · 118 BPM and 放松 and has no 删除', () => {
  setDance()
  render(<Preview />)
  expect(screen.getByRole('heading', { name: '热身' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /^第 1 段 · 118 BPM/ })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '放松' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '删除' })).toBeNull()
})

it('replace in a block updates the list', async () => {
  setDance()
  render(<Preview />)
  const before = dancePlan.routine!.blocks[0].moves[1]
  const section = screen.getByRole('heading', { name: /^第 1 段/ }).closest('section')!
  await userEvent.click(within(section).getAllByRole('button', { name: '替换' })[1])
  const options = section.querySelectorAll('.candidates button')
  expect(options.length).toBeGreaterThan(0)
  const name = options[0].textContent!
  await userEvent.click(options[0])
  const after = useAppStore.getState().plan!.routine!.blocks[0].moves[1]
  expect(after).not.toBe(before)
  expect(within(screen.getByRole('heading', { name: /^第 1 段/ }).closest('section')!).getByText(name)).toBeInTheDocument()
})

function danceState(itemIndex: number, beats: number) {
  const steps = buildTimeline(dancePlan)
  const step = steps.find(s => s.kind === 'work' && s.itemIndex === itemIndex)!
  return { steps, state: stateAt(steps, step.start + beats * beatSeconds(step.bpm) + 0.01), step }
}

it('dance status lights the beat dot for the current beat', () => {
  const idx = dancePlan.items.findIndex(i => i.dance?.phase === 'learn')
  const { state } = danceState(idx, 11)
  render(<DanceStatus state={state} plan={dancePlan} byId={realById} />)
  const dots = within(screen.getByTestId('beat-dots')).getAllByTestId('beat-dot')
  expect(dots).toHaveLength(8)
  expect(dots.map(d => d.getAttribute('data-lit'))).toEqual(dots.map((_, i) => String(i === 3)))
  expect(screen.getByText('学动作')).toBeInTheDocument()
})

it('opening prepare step of a dance plan shows 准备 and item 0 as next, no beat dots', () => {
  const state = stateAt(buildTimeline(dancePlan), 0)
  expect(state.step.kind).toBe('prepare')
  render(<TrainingStatus state={state} plan={dancePlan} byId={realById} />)
  expect(screen.getByText('准备')).toBeInTheDocument()
  expect(screen.getByText(`下一个：${realById.get(dancePlan.items[0].exerciseId)!.name}`)).toBeInTheDocument()
  expect(screen.queryByTestId('beat-dots')).toBeNull()
})

it('next card appears in the last 8 beats only', () => {
  const idx = dancePlan.items.findIndex(i => i.dance?.phase === 'learn')
  const early = render(<DanceStatus state={danceState(idx, 10).state} plan={dancePlan} byId={realById} />)
  expect(screen.queryByText('下一个')).toBeNull()
  early.unmount()
  render(<DanceStatus state={danceState(idx, 25).state} plan={dancePlan} byId={realById} />)
  expect(screen.getByText('下一个')).toBeInTheDocument()
})

it('done page shows 燃脂跳操 · 10 分钟', () => {
  const record = { id: 'r', date: '2026-11-08T00:00:00Z', plan: dancePlan, completedItems: dancePlan.items.map(() => true), actualSeconds: 600 }
  useAppStore.setState({ lastResult: { record, saved: true }, page: 'done' })
  render(<Done />)
  expect(screen.getByRole('heading', { name: '燃脂跳操 · 10 分钟' })).toBeInTheDocument()
})
