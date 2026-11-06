import { SOUND_RECIPES } from '../../src/audio/synth'
import { decodeUserMusic } from '../../src/audio/userMusic'
import type { SoundId } from '../../src/beat/patterns'
import { VOICE_IDS } from '../../src/beat/voiceCues'
import { VOICE_TEXTS, parseTtsStream } from '../../scripts/gen-voice'

it('returns decode error for non-audio blobs (Review Focus 5)', async () => {
  const ctx = { decodeAudioData: vi.fn().mockRejectedValue(new DOMException('bad')) } as unknown as BaseAudioContext
  expect(await decodeUserMusic(ctx, new Blob(['not audio']))).toEqual({ ok: false, error: 'decode' })
})

it('returns buffer on success', async () => {
  const buf = {} as AudioBuffer
  const ctx = { decodeAudioData: vi.fn().mockResolvedValue(buf) } as unknown as BaseAudioContext
  expect(await decodeUserMusic(ctx, new Blob(['x']))).toEqual({ ok: true, buffer: buf })
})

it('has a recipe for every SoundId lasting at most 1.5s', () => {
  const ids: SoundId[] = ['kick', 'snare', 'hat', 'bass', 'duang', 'muyu', 'gong', 'quack', 'tick']
  ids.forEach(id => expect(SOUND_RECIPES[id].duration).toBeLessThanOrEqual(1.5))
})

it('has a text for every voice id', () => {
  VOICE_IDS.forEach(id => expect(VOICE_TEXTS[id].length).toBeGreaterThan(0))
})

it('joins base64 audio chunks from the TTS stream', () => {
  const b64 = (s: string) => Buffer.from(s).toString('base64')
  const stream = [
    JSON.stringify({ code: 0, data: b64('ab') }),
    JSON.stringify({ code: 0, data: b64('cd'), sentence: {} }),
    JSON.stringify({ code: 20000000, message: 'ok', data: null }),
    '',
  ].join('\n')
  expect(Buffer.from(parseTtsStream(stream)).toString()).toBe('abcd')
})

it('throws with the server message on an error line', () => {
  expect(() => parseTtsStream(JSON.stringify({ code: 45000001, message: 'invalid speaker' }))).toThrow('invalid speaker')
})
