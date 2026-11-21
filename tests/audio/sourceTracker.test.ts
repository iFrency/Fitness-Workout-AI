import { SourceTracker } from '../../src/audio/sourceTracker'

function fakeSource() {
  const src = { stopped: false, onended: null as null | (() => void), stop() { this.stopped = true } }
  return src
}

it('stops every tracked source that has not ended', () => {
  const tracker = new SourceTracker()
  const a = fakeSource(); const b = fakeSource()
  tracker.track(a as unknown as AudioScheduledSourceNode)
  tracker.track(b as unknown as AudioScheduledSourceNode)
  a.onended?.()
  tracker.stopAll()
  expect(a.stopped).toBe(false)
  expect(b.stopped).toBe(true)
  expect(tracker.size()).toBe(0)
})

it('ignores sources that throw because they never started', () => {
  const tracker = new SourceTracker()
  const bad = { onended: null, stop() { throw new Error('InvalidStateError') } }
  tracker.track(bad as unknown as AudioScheduledSourceNode)
  expect(() => tracker.stopAll()).not.toThrow()
})
