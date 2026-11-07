import type { Level, SegmentType } from '../catalog/types'

export const SEGMENT_SHARE: Readonly<Record<SegmentType, number>> = { warmup: 0.15, main: 0.7, stretch: 0.15 }
export const MINUTES_OPTIONS = [5, 10, 15, 20, 30] as const
export type Minutes = (typeof MINUTES_OPTIONS)[number]
export const TOLERANCE_SECONDS = 30
export const MIN_REPS = 4
export const TIME_SCALE_MIN = 0.6
export const TIME_SCALE_MAX = 1.6
export const BEATS_PER_BAR = 4

const MAIN_BPM: Readonly<Record<Level, number>> = { 1: 110, 2: 120, 3: 128 }
const REST_BY_LEVEL: Readonly<Record<Level, number>> = { 1: 20, 2: 15, 3: 10 }
const EPSILON = 1e-9

export function bpmFor(segment: SegmentType, level: Level): number {
  if (segment === 'warmup') return 100
  if (segment === 'stretch') return 80
  return MAIN_BPM[level]
}

export function beatSeconds(bpm: number): number {
  return 60 / bpm
}

export function repSeconds(beatsPerRep: number, bpm: number): number {
  return beatsPerRep * beatSeconds(bpm)
}

export function itemSeconds(reps: number, beatsPerRep: number, bpm: number, sided: boolean): number {
  return reps * repSeconds(beatsPerRep, bpm) * (sided ? 2 : 1)
}

export function fitBeats(
  clipSeconds: number,
  beatsPerRep: number,
  bpm: number,
): { beatsPerRep: number; timeScale: number } | null {
  const options = [beatsPerRep, beatsPerRep * 2, ...(beatsPerRep % 2 === 0 ? [beatsPerRep / 2] : [])]
  for (const beats of options) {
    const timeScale = clipSeconds / repSeconds(beats, bpm)
    if (timeScale >= TIME_SCALE_MIN - EPSILON && timeScale <= TIME_SCALE_MAX + EPSILON) {
      return { beatsPerRep: beats, timeScale }
    }
  }
  return null
}

export function restSeconds(level: Level, bpm: number): number {
  return barsCeil(REST_BY_LEVEL[level], bpm)
}

export const WORK_SECONDS: Readonly<Record<SegmentType, Readonly<Record<Level, number>>>> = {
  warmup: { 1: 30, 2: 30, 3: 30 },
  main: { 1: 30, 2: 40, 3: 45 },
  stretch: { 1: 30, 2: 30, 3: 30 },
}
export const SWITCH_SECONDS = 5
export const PREPARE_SECONDS = 8

export function workSecondsFor(segment: SegmentType, level: Level): number {
  return WORK_SECONDS[segment][level]
}

export function repsForSeconds(seconds: number, beatsPerRep: number, bpm: number): number {
  return Math.max(1, Math.round(seconds / repSeconds(beatsPerRep, bpm)))
}

/** Rounds a duration up to whole 4-beat bars so pauses end on a downbeat. */
export function barsCeil(seconds: number, bpm: number): number {
  const bar = repSeconds(BEATS_PER_BAR, bpm)
  return Math.ceil(seconds / bar - EPSILON) * bar
}
