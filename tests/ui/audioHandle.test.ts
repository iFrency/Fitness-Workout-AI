import { disposeAudio, getAudio } from '../../src/ui/audio'

class FakeParam { value = 1; setValueAtTime() {} linearRampToValueAtTime() {} cancelScheduledValues() {} }
class FakeNode { gain = new FakeParam(); connect(n: unknown) { return n } disconnect() {} }
class FakeAudioContext {
  static created = 0
  closed = false
  currentTime = 0
  sampleRate = 44100
  destination = {}
  constructor() { FakeAudioContext.created++ }
  createGain() { return new FakeNode() }
  close() { this.closed = true; return Promise.resolve() }
  resume() { return Promise.resolve() }
}

beforeAll(() => vi.stubGlobal('AudioContext', FakeAudioContext))
afterAll(() => vi.unstubAllGlobals())

it('disposeAudio stops the engine, closes the context and lets a fresh one be created', () => {
  const first = getAudio()
  const stop = vi.spyOn(first.engine, 'stop')
  disposeAudio()
  expect(stop).toHaveBeenCalled()
  expect((first.ctx as unknown as FakeAudioContext).closed).toBe(true)
  expect(getAudio()).not.toBe(first)
})

it('getAudio reuses the same handle until disposed', () => {
  expect(getAudio()).toBe(getAudio())
})
