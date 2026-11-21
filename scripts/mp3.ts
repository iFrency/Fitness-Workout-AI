/** Duration of an MPEG Layer III stream, by summing its frames (works for CBR and VBR). */

const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
const SAMPLE_RATES: Readonly<Record<number, readonly number[]>> = {
  3: [44100, 48000, 32000], // MPEG1
  2: [22050, 24000, 16000], // MPEG2
  0: [11025, 12000, 8000], // MPEG2.5
}

function id3Size(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0
  const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]
  const footer = bytes[5] & 0x10 ? 10 : 0
  return 10 + size + footer
}

interface Frame { readonly length: number; readonly seconds: number }

function readFrame(bytes: Uint8Array, at: number): Frame | null {
  if (at + 4 > bytes.length || bytes[at] !== 0xff || (bytes[at + 1] & 0xe0) !== 0xe0) return null
  const version = (bytes[at + 1] >> 3) & 3
  const layer = (bytes[at + 1] >> 1) & 3
  const bitrateIndex = (bytes[at + 2] >> 4) & 0xf
  const rateIndex = (bytes[at + 2] >> 2) & 3
  const padding = (bytes[at + 2] >> 1) & 1
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null
  const mpeg1 = version === 3
  const bitrate = (mpeg1 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex] * 1000
  const sampleRate = SAMPLE_RATES[version][rateIndex]
  const samples = mpeg1 ? 1152 : 576
  const length = Math.floor(((mpeg1 ? 144 : 72) * bitrate) / sampleRate) + padding
  return { length, seconds: samples / sampleRate }
}

export function mp3Duration(bytes: Uint8Array): number {
  let at = id3Size(bytes)
  let seconds = 0
  for (let frame = readFrame(bytes, at); frame; frame = readFrame(bytes, at)) {
    seconds += frame.seconds
    at += frame.length
  }
  return seconds
}
