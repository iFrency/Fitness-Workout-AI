import { computeTotal, generatePlan } from '../../src/planner/generatePlan'
import { removeItem, replaceItem, replacementCandidates } from '../../src/planner/editPlan'
import type { Plan } from '../../src/planner/types'
import { fixtureCatalog } from '../fixtures/catalog'

const base = () => generatePlan({ mode: 'shape', parts: ['全身'], minutes: 10, level: 2 }, fixtureCatalog, 1)
const mainIndex = (p: Plan) => p.items.findIndex(i => i.segment === 'main')

it('candidates exclude exercises already in plan and other segment types', () => {
  const p = base()
  const i = mainIndex(p)
  const inPlan = new Set(p.items.map(x => x.exerciseId))
  const c = replacementCandidates(p, i, fixtureCatalog)
  expect(c.length).toBeGreaterThan(0)
  expect(c.every(e => !inPlan.has(e.id) && e.type === 'main')).toBe(true)
})

it('replace changes the item, recomputes total, and does not mutate input', () => {
  const p = base()
  const i = mainIndex(p)
  const before = JSON.stringify(p)
  const next = replaceItem(p, i, replacementCandidates(p, i, fixtureCatalog)[0])
  expect(JSON.stringify(p)).toBe(before)
  expect(next.items[i].exerciseId).not.toBe(p.items[i].exerciseId)
  expect(next.totalSeconds).toBeCloseTo(computeTotal(next.items))
})

it('replacing an item in round 2 keeps its round and work seconds', () => {
  const p = generatePlan({ mode: 'shape', parts: ['肩颈'], minutes: 30, level: 1 }, fixtureCatalog, 1)
  const i = p.items.findIndex(x => x.round === 2)
  // Rounds repeat only once the candidates run out, so pick an outside exercise directly.
  const other = fixtureCatalog.find(e => e.type === 'main' && e.level === 1 && !p.items.some(x => x.exerciseId === e.id))!
  const next = replaceItem(p, i, other)
  expect(next.items[i].round).toBe(2)
  expect(next.items[i].workSeconds).toBe(p.items[i].workSeconds)
})

it('removing a round-1 item leaves round 2 untouched', () => {
  const p = generatePlan({ mode: 'shape', parts: ['肩颈'], minutes: 30, level: 1 }, fixtureCatalog, 1)
  const i = p.items.findIndex(x => x.round === 1 && x.segment === 'main')
  const id = p.items[i].exerciseId
  const next = removeItem(p, i)
  expect(next.items.filter(x => x.round === 2 && x.exerciseId === id)).toHaveLength(1)
})

it('removing first item zeroes the new first rest (Review Focus 4)', () => {
  expect(removeItem(base(), 0).items[0].restBeforeSeconds).toBe(0)
})

it('refuses to remove the last remaining item (Review Focus 4)', () => {
  let p = base()
  while (p.items.length > 1) p = removeItem(p, 0)
  expect(() => removeItem(p, 0)).toThrow('至少保留一个动作')
})
