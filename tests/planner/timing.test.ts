import type { Level } from '../../src/catalog/types'
import {
  barsCeil, bpmFor, fitBeats, itemSeconds, repsForSeconds, restSeconds, workSecondsFor,
} from '../../src/planner/timing'

it('work seconds table', () => {
  expect(workSecondsFor('main', 1)).toBe(30)
  expect(workSecondsFor('main', 3)).toBe(45)
  expect(workSecondsFor('stretch', 3)).toBe(30)
})

it('repsForSeconds rounds to whole reps with a minimum of 1', () => {
  expect(repsForSeconds(30, 4, 120)).toBe(15)
  expect(repsForSeconds(30, 4, 110)).toBe(14)
  expect(repsForSeconds(0.5, 4, 120)).toBe(1)
})

it('barsCeil rounds up to whole bars', () => {
  expect(barsCeil(5, 120)).toBeCloseTo(6)
  expect(barsCeil(8, 100)).toBeCloseTo(9.6)
})

it('bpm table', () => {
  expect(bpmFor('warmup', 3)).toBe(100)
  expect(([1, 2, 3] as Level[]).map(l => bpmFor('main', l))).toEqual([110, 120, 128])
  expect(bpmFor('stretch', 1)).toBe(80)
})

it('item seconds doubles for sided', () => {
  expect(itemSeconds(8, 4, 120, false)).toBeCloseTo(16)
  expect(itemSeconds(8, 4, 120, true)).toBeCloseTo(32)
})

it('fitBeats keeps original when in range', () => {
  expect(fitBeats(2.4, 4, 100)).toEqual({ beatsPerRep: 4, timeScale: 1 })
})

it('fitBeats doubles beats when too fast', () => {
  expect(fitBeats(6, 4, 120)).toEqual({ beatsPerRep: 8, timeScale: 1.5 })
})

it('fitBeats halves beats when too slow', () => {
  expect(fitBeats(1, 4, 120)).toEqual({ beatsPerRep: 2, timeScale: 1 })
})

it('fitBeats returns null when nothing fits', () => {
  expect(fitBeats(0.5, 4, 80)).toBeNull()
})

it('fitBeats accepts the exact boundaries', () => {
  expect(fitBeats(1.2, 4, 120)?.timeScale).toBeCloseTo(0.6)
  expect(fitBeats(3.2, 4, 120)?.timeScale).toBeCloseTo(1.6)
})

it('rest rounds up to whole bars', () => {
  expect(restSeconds(1, 110)).toBeCloseTo(21.818, 2)
  expect(restSeconds(2, 120)).toBeCloseTo(16)
  expect(restSeconds(3, 128)).toBeCloseTo(11.25)
})
