import type { Exercise, Level, SegmentType } from '../../src/catalog/types'
import { bpmFor, fitBeats } from '../../src/planner/timing'
import type { MixamoRow } from './mixamoSelection'

export function bpmsFor(type: SegmentType, level: Level): number[] {
  if (type !== 'main') return [bpmFor(type, 1)]
  return ([1, 2, 3] as Level[]).filter(l => l >= level).map(l => bpmFor('main', l))
}

/** Picks beatsPerRep (1,2,4,8,16) that fits every tempo and keeps playback speed closest to 1. */
export function pickBeats(clipSeconds: number, bpms: number[]): number {
  const score = (b: number) => {
    const scales = bpms.map(bpm => fitBeats(clipSeconds, b, bpm))
    if (scales.some(s => s === null || s.beatsPerRep !== b)) return Infinity
    return Math.max(...scales.map(s => Math.abs(Math.log(s!.timeScale))))
  }
  const best = [1, 2, 4, 8, 16].reduce((a, b) => (score(b) < score(a) ? b : a))
  if (score(best) === Infinity) throw new Error(`无法为时长 ${clipSeconds}s 选出拍数`)
  return best
}

export function fromMixamoRow(row: MixamoRow, clipSeconds: number): Exercise {
  return {
    id: row.id, name: row.name, clip: row.id, clipSeconds, parts: [...row.parts], type: row.type,
    level: row.level, impact: row.impact, beatsPerRep: pickBeats(clipSeconds, bpmsFor(row.type, row.level)),
    defaultReps: 8, sided: row.sided, cues: [...row.cues], caution: row.caution,
  }
}
