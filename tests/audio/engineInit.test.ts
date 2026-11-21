import { AudioEngine } from '../../src/audio/engine'

vi.mock('../../src/audio/synth', () => ({ renderSounds: vi.fn().mockResolvedValue({}) }))

class FakeParam { value = 1; setValueAtTime() {} linearRampToValueAtTime() {} cancelScheduledValues() {} }
class FakeNode { gain = new FakeParam(); connect(n: unknown) { return n } disconnect() {} }

it('a second init while voices are still downloading waits for the same load (no silent session)', async () => {
  let releaseDecode: () => void = () => {}
  const decoded = new Promise<AudioBuffer>(resolve => { releaseDecode = () => resolve({ duration: 1 } as AudioBuffer) })
  const ctx = {
    currentTime: 0, sampleRate: 44100, destination: {},
    createGain: () => new FakeNode(),
    decodeAudioData: () => decoded,
  } as unknown as AudioContext
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => ({ start: 0.6 }),
    arrayBuffer: async () => new ArrayBuffer(8),
    url,
  })))
  const engine = new AudioEngine(ctx)
  void engine.init()
  for (let i = 0; i < 10; i++) await Promise.resolve()
  const second = engine.init()
  releaseDecode()
  await second
  expect(engine.manifest()).toEqual({ start: 0.6 })
  vi.unstubAllGlobals()
})
