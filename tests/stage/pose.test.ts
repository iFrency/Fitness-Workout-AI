import { IDLE_CLIP } from '../../src/catalog/constants'
import { generatePlan } from '../../src/planner/generatePlan'
import { buildTimeline, stateAt } from '../../src/player/timeline'
import { blendWeight, computePose, shouldMirror } from '../../src/stage/pose'
import { fixtureCatalog } from '../fixtures/catalog'

const plan = generatePlan({ parts: ['全身'], minutes: 10, level: 2 }, fixtureCatalog, 1)
const steps = buildTimeline(plan)
const work = steps.find(s => s.kind === 'work')!
const workState = stateAt(steps, work.start)
const restState = stateAt(steps, 0)

it('work pose follows rep progress', () => {
  const st = { ...workState, repProgress: 0.25 }
  expect(computePose(st, 0, () => ({ clip: 'Squat', clipSeconds: 2 }), 3)).toEqual({ clip: 'Squat', clipTime: 0.5 })
})

it('rest pose loops idle', () => {
  expect(computePose(restState, 7, () => ({ clip: 'X', clipSeconds: 2 }), 3)).toEqual({ clip: IDLE_CLIP, clipTime: 1 })
})

it('blend weight ramps over 0.3s', () => {
  expect(blendWeight(10.15, 10)).toBeCloseTo(0.5)
  expect(blendWeight(11, 10)).toBe(1)
})

it('mirrors for the right side, inverted by the mirror setting', () => {
  expect(shouldMirror(true, 'left')).toBe(true)
  expect(shouldMirror(true, 'right')).toBe(false)
  expect(shouldMirror(false, 'right')).toBe(true)
  expect(shouldMirror(false, null)).toBe(false)
})
