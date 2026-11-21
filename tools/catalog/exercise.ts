import type { DanceTier, Exercise, Level, SegmentType } from '../../src/catalog/types'
import { bpmFor, fitBeats } from '../../src/planner/timing'
import type { MixamoRow } from './mixamoSelection'
import { DANCE_BPMS, DUAL_POOL, type DanceRow } from './selection'

export function bpmsFor(type: SegmentType, level: Level): number[] {
  if (type !== 'main') return [bpmFor(type, 1)]
  return ([1, 2, 3] as Level[]).filter(l => l >= level).map(l => bpmFor('main', l))
}

/** Tempos a dance move of this tier must fit: tier 1 also runs in the cool-down at 96 and 100 BPM. */
export function danceBpmsFor(tier: DanceTier): number[] {
  return DANCE_BPMS.filter(bpm => tier === 1 || bpm >= 110)
}

/** Picks beatsPerRep (from `allowed`) that fits every tempo and keeps playback speed closest to 1. */
export function pickBeats(clipSeconds: number, bpms: number[], allowed: readonly number[] = [1, 2, 4, 8, 16]): number {
  const score = (b: number) => {
    const scales = bpms.map(bpm => fitBeats(clipSeconds, b, bpm))
    if (scales.some(s => s === null || s.beatsPerRep !== b)) return Infinity
    return Math.max(...scales.map(s => Math.abs(Math.log(s!.timeScale))))
  }
  const best = allowed.reduce((a, b) => (score(b) < score(a) ? b : a))
  if (score(best) === Infinity) throw new Error(`无法为时长 ${clipSeconds}s 选出拍数`)
  return best
}

/** Adds the dance pool and tier to a shape move listed in DUAL_POOL; other moves pass through. */
export function withDualPool(ex: Exercise): Exercise {
  const tier = DUAL_POOL[ex.id]
  return tier === undefined ? ex : { ...ex, pools: ['shape', 'dance'], danceTier: tier }
}

export function fromMixamoRow(row: MixamoRow, clipSeconds: number): Exercise {
  return withDualPool({
    id: row.id, name: row.name, clip: row.id, clipSeconds, parts: [...row.parts], type: row.type,
    level: row.level, impact: row.impact, beatsPerRep: pickBeats(clipSeconds, bpmsFor(row.type, row.level)),
    defaultReps: 8, sided: row.sided, cues: [...row.cues], caution: row.caution, pools: ['shape'],
  })
}

/** Dance-only move: beatsPerRep is an eight-count unit (1, 2, 4 or 8) that fits every tempo of its tier. */
export function fromDanceRow(row: DanceRow, clipSeconds: number, defaultReps: number): Exercise {
  const [id, name, level, danceTier, cues, caution] = row
  return {
    id, name, clip: id, clipSeconds, parts: ['全身'], type: 'main', level, impact: 'low',
    beatsPerRep: pickBeats(clipSeconds, danceBpmsFor(danceTier), [1, 2, 4, 8]),
    defaultReps, sided: false, cues: [...cues], caution, pools: ['dance'], danceTier,
  }
}
