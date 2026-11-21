import { mp3Duration } from '../../scripts/mp3'

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}
const frame = (header: number[], length: number) => { const f = new Uint8Array(length); f.set(header); return f }

it('measures MPEG1 Layer III frames', () => {
  const bytes = concat(Array.from({ length: 10 }, () => frame([0xff, 0xfb, 0x90, 0x64], 417)))
  expect(mp3Duration(bytes)).toBeCloseTo((10 * 1152) / 44100, 4)
})

it('measures MPEG2 Layer III 24kHz frames and skips ID3v2', () => {
  const id3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 10, ...new Array(10).fill(0)])
  const bytes = concat([id3, ...Array.from({ length: 10 }, () => frame([0xff, 0xf3, 0x44, 0xc4], 96))])
  expect(mp3Duration(bytes)).toBeCloseTo((10 * 576) / 24000, 4)
})

it('stops at the first invalid header', () => {
  const bytes = concat([frame([0xff, 0xfb, 0x90, 0x64], 417), new Uint8Array(50)])
  expect(mp3Duration(bytes)).toBeCloseTo(1152 / 44100, 4)
})
