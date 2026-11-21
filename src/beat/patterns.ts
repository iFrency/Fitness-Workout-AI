import type { DanceTier, SegmentType } from '../catalog/types'
import type { BeatEvent, DanceBeatInfo } from './events'

export type SoundId = 'kick' | 'snare' | 'hat' | 'bass' | 'duang' | 'muyu' | 'gong' | 'quack' | 'tick' | 'clap'
export type StyleId = 'guichu' | 'guangchang' | 'muyu'
export type GrooveId = StyleId | 'dance'

export const STYLE_LABELS: Readonly<Record<StyleId, string>> = {
  guichu: '电子鬼畜',
  guangchang: '广场舞',
  muyu: '木鱼禅意',
}

export interface Hit {
  readonly sound: SoundId
  readonly gain: number
  readonly rate: number
  readonly offsetBeats?: 0 | 0.5
}

const ACCENT: Readonly<Record<StyleId, SoundId>> = { guichu: 'duang', guangchang: 'gong', muyu: 'muyu' }

export function styleForSegment(segment: SegmentType, mainStyle: StyleId): StyleId {
  if (segment === 'warmup') return 'guangchang'
  if (segment === 'stretch') return 'muyu'
  return mainStyle
}

function groove(barPos: number, style: StyleId): Hit[] {
  const hit = (sound: SoundId, gain: number): Hit => ({ sound, gain, rate: 1 })
  if (style === 'guichu') return [hit('kick', 1)]
  if (style === 'guangchang') return [barPos % 2 === 0 ? hit('kick', 1) : hit('snare', 0.8)]
  return barPos === 0 ? [hit('muyu', 0.5), hit('bass', 0.6)] : [hit('muyu', 0.5)]
}

function addOnce(hits: Hit[], sound: SoundId, gain: number): Hit[] {
  return hits.some(h => h.sound === sound) ? hits : [...hits, { sound, gain, rate: 1 }]
}

function workHits(e: BeatEvent, style: StyleId): Hit[] {
  let hits = groove(e.beatInStep % 4, style)
  if (e.isRepEnd) hits = [...hits, { sound: ACCENT[style], gain: 1, rate: 1 }]
  if (e.repsLeft > 3) return hits
  hits = addOnce(hits, 'hat', 0.5)
  if (e.repsLeft <= 2) hits = addOnce(hits, 'snare', 0.6)
  if (e.repsLeft === 1) hits = addOnce(hits, 'bass', 0.7)
  const rate = 2 ** ((4 - e.repsLeft) / 12)
  return hits.map(h => ({ ...h, rate }))
}

function danceGroove(tier: DanceTier, b: number): Hit[] {
  const hit = (sound: SoundId, gain: number, offsetBeats?: 0.5): Hit => ({ sound, gain, rate: 1, ...(offsetBeats ? { offsetBeats } : {}) })
  const even = b % 2 === 0
  if (tier === 1) {
    return [...(even ? [hit('clap', 0.5)] : [hit('kick', 1)]), ...(b === 1 ? [hit('bass', 0.6)] : [])]
  }
  if (tier === 2) {
    return [hit('kick', 1), ...(even ? [hit('clap', 0.8)] : [hit('bass', 0.7)]), hit('hat', 0.4, 0.5)]
  }
  return [
    hit('kick', 1), hit('bass', 0.7), hit('hat', 0.4), hit('hat', 0.4, 0.5),
    ...(even ? [hit('clap', 0.8), hit('snare', 0.6)] : []),
    ...(b === 1 ? [hit('duang', 0.9)] : []),
  ]
}

function danceHits(e: BeatEvent, dance: DanceBeatInfo): Hit[] {
  let hits = danceGroove(dance.tier, e.beatInStep % 8 + 1)
  if (dance.blockStart) hits = [...hits, { sound: 'gong', gain: 0.6, rate: 1 }]
  const left = e.beatsLeftInStep
  if (left <= 4) {
    const gain = 0.3 + 0.2 * (4 - left)
    hits = [...hits, { sound: 'snare', gain, rate: 1 }, { sound: 'snare', gain, rate: 1, offsetBeats: 0.5 }]
  }
  if (dance.nextTier === 3 && left <= 8) {
    const rate = 2 ** ((9 - left) / 2 / 12)
    const extraHat: Hit = { sound: 'hat', gain: 0.4, rate: 1, offsetBeats: 0.5 }
    hits = [...hits, extraHat].map(h => ({ ...h, rate: h.rate * rate }))
  }
  return hits
}

export function hitsForEvent(e: BeatEvent, groove: GrooveId): Hit[] {
  if (groove === 'dance' && e.dance) return danceHits(e, e.dance)
  const style = groove === 'dance' ? 'guichu' : groove
  if (e.kind === 'work') return workHits(e, style)
  if (e.beatsLeftInStep <= 3) return [{ sound: 'tick', gain: 1, rate: 1 }]
  return [{ sound: 'hat', gain: 0.3, rate: 1 }]
}
