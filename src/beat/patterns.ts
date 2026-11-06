import type { SegmentType } from '../catalog/types'
import type { BeatEvent } from './events'

export type SoundId = 'kick' | 'snare' | 'hat' | 'bass' | 'duang' | 'muyu' | 'gong' | 'quack' | 'tick'
export type StyleId = 'guichu' | 'guangchang' | 'muyu'

export const STYLE_LABELS: Readonly<Record<StyleId, string>> = {
  guichu: '电子鬼畜',
  guangchang: '广场舞',
  muyu: '木鱼禅意',
}

export interface Hit {
  readonly sound: SoundId
  readonly gain: number
  readonly rate: number
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

export function hitsForEvent(e: BeatEvent, style: StyleId): Hit[] {
  if (e.kind === 'work') return workHits(e, style)
  if (e.beatsLeftInStep <= 3) return [{ sound: 'tick', gain: 1, rate: 1 }]
  return [{ sound: 'hat', gain: 0.3, rate: 1 }]
}
