import type { Part } from '../../src/catalog/types'
import { eligible, generatePlan, itemActualSeconds } from '../../src/planner/generatePlan'
import { repSeconds, workSecondsFor } from '../../src/planner/timing'
import type { PlanInput } from '../../src/planner/types'
import { fixtureCatalog, makeExercise } from '../fixtures/catalog'

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

it.each([1, 2, 3] as const)('level %i: every duration lands within ±30s or reports shortfall at 3 rounds', level => {
  for (const minutes of [5, 10, 15, 20, 30] as const) {
    for (const parts of [['全身'], ['腰腹'], ['肩颈', '臀腿']] as Part[][]) {
      const p = generatePlan({ parts, minutes, level }, fixtureCatalog, 7)
      const ok = Math.abs(p.totalSeconds - minutes * 60) <= 30 || (p.rounds === 3 && p.shortfallSeconds > 0)
      expect(ok, `${level} ${minutes} ${parts.join('+')} total=${p.totalSeconds} rounds=${p.rounds}`).toBe(true)
    }
  }
})

it('work items run for their target within one rep, and targets stay within 50%-150% of the level duration', () => {
  const p = generatePlan(input({ parts: ['全身'], minutes: 15, level: 2 }), fixtureCatalog, 1)
  p.items.forEach(it => {
    const perSide = itemActualSeconds(it) / (it.sided ? 2 : 1)
    expect(Math.abs(perSide - it.workSeconds)).toBeLessThanOrEqual(repSeconds(it.beatsPerRep, it.bpm))
    const level = workSecondsFor(it.segment, 2)
    expect(it.workSeconds).toBeGreaterThanOrEqual(level * 0.5 - 1e-9)
    expect(it.workSeconds).toBeLessThanOrEqual(level * 1.5 + 1e-9)
    if (it.segment !== 'main') expect(it.workSeconds).toBe(level)
  })
})

it('narrow long request repeats the main circuit before reporting shortfall', () => {
  const p = generatePlan(input({ parts: ['肩颈'], minutes: 30 }), fixtureCatalog, 1)
  expect(p.rounds).toBe(3)
  expect(p.items.filter(i => i.segment === 'main').map(i => i.round)).toContain(3)
})

it('no duplicate exercise within one round', () => {
  const p = generatePlan(input({ parts: ['全身'], minutes: 30, level: 3 }), fixtureCatalog, 5)
  for (let r = 1; r <= p.rounds; r++) {
    const ids = p.items.filter(i => i.round === r && i.segment === 'main').map(i => i.exerciseId)
    expect(new Set(ids).size).toBe(ids.length)
  }
})

it('never exceeds level and excludes high impact at level 1', () => {
  const p = generatePlan(input({ parts: ['全身'], minutes: 30, level: 1 }), fixtureCatalog, 1)
  expect(p.items.every(i => byId.get(i.exerciseId)!.level === 1)).toBe(true)
  expect(p.items.some(i => i.exerciseId === 'jumping-jack')).toBe(false)
})

it('first rest is 0', () => {
  expect(generatePlan(input({ parts: ['全身'], minutes: 20, level: 2 }), fixtureCatalog, 5).items[0].restBeforeSeconds).toBe(0)
})

it('alternates parts when two are chosen', () => {
  const p = generatePlan(input({ parts: ['腰腹', '臀腿'], minutes: 20, level: 3 }), fixtureCatalog, 2)
  const mains = p.items.filter(i => i.segment === 'main' && i.round === 1).map(i => byId.get(i.exerciseId)!.parts[0])
  mains.slice(1).forEach((part, k) => expect(part).not.toBe(mains[k]))
})

it('throws on empty parts', () => {
  expect(() => generatePlan(input({ parts: [] }), fixtureCatalog, 1)).toThrow('至少选择一个部位')
})

it('eligible excludes dance-only moves', () => {
  expect(eligible(makeExercise({ pools: ['dance'], danceTier: 2 }), input({ parts: ['全身'], level: 3 }))).toBe(false)
})
