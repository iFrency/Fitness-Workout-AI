import type { BeatEvent } from './events'

type NumberVoice = `n${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20}`
export type VoiceId = NumberVoice | 'start' | 'switch' | 'rest' | 'last3' | 'done' | 'hey'

export const VOICE_IDS: readonly VoiceId[] = [
  ...Array.from({ length: 20 }, (_, i) => `n${i + 1}` as NumberVoice),
  'start', 'switch', 'rest', 'last3', 'done', 'hey',
]

const MAX_COUNT = 20

export function voiceForEvent(e: BeatEvent): VoiceId | null {
  if (e.kind !== 'work') {
    if (e.beatsLeftInStep >= 1 && e.beatsLeftInStep <= 3) return `n${e.beatsLeftInStep}` as NumberVoice
    return e.kind === 'rest' && e.beatInStep === 0 ? 'rest' : null
  }
  if (e.beatInStep === 0) return e.side === 'right' ? 'switch' : 'start'
  if (e.isRepEnd) {
    if (e.repsLeft === 1) return 'hey'
    return e.repIndex + 1 <= MAX_COUNT ? (`n${e.repIndex + 1}` as NumberVoice) : null
  }
  return e.beatInRep === 0 && e.repsLeft === 3 ? 'last3' : null
}
