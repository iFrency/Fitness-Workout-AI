import { generatePlan } from '../../src/planner/generatePlan'
import { buildTimeline, stateAt, timelineEnd } from '../../src/player/timeline'
import { fixtureCatalog } from '../fixtures/catalog'

const plan = generatePlan({ parts: ['全身'], minutes: 10, level: 2 }, fixtureCatalog, 1)
const steps = buildTimeline(plan)

it('starts with a 4-beat prepare and is contiguous', () => {
  expect(steps[0].kind).toBe('prepare')
  expect(steps[0].end).toBeCloseTo((4 * 60) / plan.items[0].bpm)
  steps.slice(1).forEach((s, k) => expect(s.start).toBeCloseTo(steps[k].end))
})

it('total equals prepare plus plan total', () => {
  expect(timelineEnd(steps)).toBeCloseTo(steps[0].end + plan.totalSeconds)
})

it('splits sided items into left then right', () => {
  const idx = plan.items.findIndex(i => i.sided)
  const sides = steps.filter(s => s.itemIndex === idx && s.kind === 'work').map(s => s.side)
  expect(sides).toEqual(['left', 'right'])
})

it('stateAt reports rep index and progress', () => {
  const w = steps.find(s => s.kind === 'work')!
  const rep = (w.beatsPerRep * 60) / w.bpm
  const st = stateAt(steps, w.start + rep * 1.5)
  expect(st.repIndex).toBe(1)
  expect(st.repProgress).toBeCloseTo(0.5)
})

it('stateAt is done at and after the end', () => {
  expect(stateAt(steps, timelineEnd(steps)).done).toBe(true)
  expect(stateAt(steps, 1e9).done).toBe(true)
})
