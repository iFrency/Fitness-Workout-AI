import { generatePlan } from '../../src/planner/generatePlan'
import type { PlanInput } from '../../src/planner/types'
import { fixtureCatalog } from '../fixtures/catalog'

const input = (p: Partial<PlanInput> = {}): PlanInput => ({ parts: ['腰腹'], minutes: 10, level: 1, ...p })
const byId = new Map(fixtureCatalog.map(e => [e.id, e]))

it('is deterministic for the same seed and differs for another seed', () => {
  expect(generatePlan(input(), fixtureCatalog, 7)).toEqual(generatePlan(input(), fixtureCatalog, 7))
  const ids = (s: number) =>
    generatePlan(input({ parts: ['全身'], minutes: 20, level: 3 }), fixtureCatalog, s).items.map(i => i.exerciseId)
  expect(ids(1)).not.toEqual(ids(2))
})

it('orders segments warmup, main, stretch with at least one each', () => {
  const rank = { warmup: 0, main: 1, stretch: 2 }
  const segs = generatePlan(input(), fixtureCatalog, 1).items.map(i => i.segment)
  expect(new Set(segs)).toEqual(new Set(['warmup', 'main', 'stretch']))
  segs.slice(1).forEach((s, k) => expect(rank[s]).toBeGreaterThanOrEqual(rank[segs[k]]))
})

it.each([5, 10, 15, 20] as const)('full-body %i min lands within ±30s', m => {
  const p = generatePlan(input({ parts: ['全身'], minutes: m, level: 3 }), fixtureCatalog, 3)
  expect(Math.abs(p.totalSeconds - m * 60)).toBeLessThanOrEqual(30)
  expect(p.shortfallSeconds).toBe(0)
})

it('5 min with two parts fits (Review Focus 2)', () => {
  const p = generatePlan(input({ parts: ['腰腹', '臀腿'], minutes: 5, level: 2 }), fixtureCatalog, 1)
  expect(Math.abs(p.totalSeconds - 300)).toBeLessThanOrEqual(30)
})

it('never exceeds level and excludes high impact at level 1', () => {
  const p = generatePlan(input({ parts: ['全身'], minutes: 30, level: 1 }), fixtureCatalog, 1)
  expect(p.items.every(i => byId.get(i.exerciseId)!.level === 1)).toBe(true)
  expect(p.items.some(i => i.exerciseId === 'jumping-jack')).toBe(false)
})

it('has no duplicates, first rest is 0, reps within bounds', () => {
  const p = generatePlan(input({ parts: ['全身'], minutes: 20, level: 2 }), fixtureCatalog, 5)
  expect(new Set(p.items.map(i => i.exerciseId)).size).toBe(p.items.length)
  expect(p.items[0].restBeforeSeconds).toBe(0)
  expect(p.items.every(i => i.reps >= 4 && i.reps <= 16)).toBe(true)
})

it('reports shortfall for a narrow long request (Review Focus 1)', () => {
  const p = generatePlan(input({ parts: ['肩颈'], minutes: 30 }), fixtureCatalog, 1)
  expect(p.shortfallSeconds).toBeGreaterThan(0)
  expect(p.items.length).toBeGreaterThanOrEqual(3)
})

it('alternates parts when two are chosen', () => {
  const p = generatePlan(input({ parts: ['腰腹', '臀腿'], minutes: 20, level: 3 }), fixtureCatalog, 2)
  const mains = p.items.filter(i => i.segment === 'main').map(i => byId.get(i.exerciseId)!.parts[0])
  mains.slice(1).forEach((part, k) => expect(part).not.toBe(mains[k]))
})

it('throws on empty parts', () => {
  expect(() => generatePlan(input({ parts: [] }), fixtureCatalog, 1)).toThrow('至少选择一个部位')
})
