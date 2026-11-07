import { generatePlan } from '../../src/planner/generatePlan'
import { TrainingSession } from '../../src/player/session'
import { buildTimeline, stateAt, timelineEnd } from '../../src/player/timeline'
import { fixtureCatalog } from '../fixtures/catalog'

const steps = buildTimeline(generatePlan({ parts: ['全身'], minutes: 10, level: 2 }, fixtureCatalog, 1))

function fake() {
  let t = 100
  return { now: () => t, advance: (dt: number) => { t += dt } }
}

it('advances with clock and freezes while paused (Review Focus 3)', () => {
  const c = fake(); const s = new TrainingSession(steps, c); s.start()
  c.advance(10); s.pause(); c.advance(100)
  expect(s.time()).toBeCloseTo(10)
  s.resume(); c.advance(5)
  expect(s.time()).toBeCloseTo(15)
  expect(s.activeSeconds()).toBeCloseTo(15)
})

it('applies rate', () => {
  const c = fake(); const s = new TrainingSession(steps, c, 60); s.start(); c.advance(1)
  expect(s.time()).toBeCloseTo(60)
})

it('clockTimeOf inverts time', () => {
  const c = fake(); const s = new TrainingSession(steps, c, 2); s.start(); c.advance(3)
  expect(s.clockTimeOf(s.time() + 4)).toBeCloseTo(c.now() + 2)
})

it('skip moves to next item and records skipped', () => {
  const c = fake(); const s = new TrainingSession(steps, c); s.start()
  c.advance(steps[1].start + 1)
  const cur = stateAt(steps, s.time()).step.itemIndex
  s.skip()
  expect(stateAt(steps, s.time()).step.itemIndex).toBe(cur + 1)
  expect(s.skippedItems().has(cur)).toBe(true)
})

it('skip on the last item ends the session (Review Focus 3)', () => {
  const c = fake(); const s = new TrainingSession(steps, c); s.start()
  c.advance(timelineEnd(steps) - 1); s.skip()
  expect(stateAt(steps, s.time()).done).toBe(true)
})

it('prev returns to previous work and clears its skipped flag', () => {
  const c = fake(); const s = new TrainingSession(steps, c); s.start()
  c.advance(steps[1].start + 1); s.skip(); s.prev()
  const st = stateAt(steps, s.time())
  expect(st.step.kind).toBe('work')
  expect(st.stepElapsed).toBeCloseTo(0)
  expect(s.skippedItems().size).toBe(0)
})

it('notifies jump listeners on skip and resume', () => {
  const c = fake(); const s = new TrainingSession(steps, c); const fn = vi.fn()
  s.onJump(fn); s.start(); s.skip(); s.pause(); s.resume()
  expect(fn).toHaveBeenCalledTimes(2)
})

it('skip during a rest shortens the rest instead of skipping the upcoming exercise', () => {
  const c = fake(); const s = new TrainingSession(steps, c); s.start()
  const rest = steps.find(x => x.kind === 'rest')!
  c.advance(rest.start + 1); s.skip()
  const st = stateAt(steps, s.time())
  expect(st.step.kind).toBe('work')
  expect(st.step.itemIndex).toBe(rest.itemIndex)
  expect(st.stepElapsed).toBeCloseTo(0)
  expect(s.skippedItems().size).toBe(0)
})

it('skip during a switch starts the right side (Review Focus 2)', () => {
  const sw = steps.find(x => x.kind === 'switch')!
  const c = fake(); const s = new TrainingSession(steps, c); s.start()
  c.advance(sw.start + 1); s.skip()
  const st = stateAt(steps, s.time())
  expect(st.step.kind).toBe('work')
  expect(st.step.side).toBe('right')
  expect(s.skippedItems().size).toBe(0)
})

it('skip during prepare starts the first exercise', () => {
  const c = fake(); const s = new TrainingSession(steps, c); s.start()
  c.advance(0.5); s.skip()
  const st = stateAt(steps, s.time())
  expect(st.step.kind).toBe('work')
  expect(st.step.itemIndex).toBe(0)
  expect(s.skippedItems().size).toBe(0)
})

it('skipping the last item while paused finishes instead of staying paused (Review Focus 3)', () => {
  const c = fake(); const s = new TrainingSession(steps, c); s.start()
  c.advance(timelineEnd(steps) - 1); s.pause(); s.skip()
  expect(s.isPaused()).toBe(false)
  expect(stateAt(steps, s.time()).done).toBe(true)
})

it('startAt restores a saved position paused, with its skipped items', () => {
  const c = fake(); const s = new TrainingSession(steps, c)
  s.startAt(30, [1])
  expect(s.isStarted()).toBe(true)
  expect(s.isPaused()).toBe(true)
  expect(s.time()).toBeCloseTo(30)
  expect([...s.skippedItems()]).toEqual([1])
  c.advance(5)
  expect(s.time()).toBeCloseTo(30)
  s.resume(); c.advance(2)
  expect(s.time()).toBeCloseTo(32)
})

it('time is zero before start and clamps at the end', () => {
  const c = fake(); const s = new TrainingSession(steps, c)
  expect(s.time()).toBe(0)
  s.start(); c.advance(1e6)
  expect(s.time()).toBeCloseTo(timelineEnd(steps))
})
