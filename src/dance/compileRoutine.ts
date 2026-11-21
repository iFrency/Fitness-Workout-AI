import type { DanceTier, Exercise } from '../catalog/types'
import { TOLERANCE_SECONDS, TIME_SCALE_MAX, TIME_SCALE_MIN, fitBeats, repSeconds } from '../planner/timing'
import { computeTotal, toItem } from '../planner/generatePlan'
import type { DanceItemInfo, Plan, PlanItem } from '../planner/types'
import { COMBO_BEATS, COOLDOWN_BPM, ITEM_BEATS, SLOT_TIERS, WARMUP_BPM } from './tempo'
import type { Routine } from './types'

const ALLOWED_BEATS: readonly number[] = [1, 2, 4, 8]

/** Beats per rep for a dance move at one tempo, limited to 1, 2, 4 or 8; null when none fits. */
export function danceFit(e: Exercise, bpm: number): { beatsPerRep: number; timeScale: number } | null {
  const scale = (b: number): number => e.clipSeconds / repSeconds(b, bpm)
  const own = fitBeats(e.clipSeconds, e.beatsPerRep, bpm)
  if (own !== null && own.beatsPerRep === e.beatsPerRep && ALLOWED_BEATS.includes(e.beatsPerRep)) return own
  const fits = ALLOWED_BEATS.filter(b => scale(b) >= TIME_SCALE_MIN - 1e-9 && scale(b) <= TIME_SCALE_MAX + 1e-9)
  if (fits.length === 0) return null
  const best = fits.reduce((a, b) => (Math.abs(Math.log(scale(b))) < Math.abs(Math.log(scale(a))) ? b : a))
  return { beatsPerRep: best, timeScale: scale(best) }
}

function danceItem(e: Exercise, bpm: number, beats: number, dance: DanceItemInfo): PlanItem {
  const fit = danceFit(e, bpm)
  if (fit === null) throw new Error(`dance move does not fit ${bpm} BPM: ${e.id}`)
  const reps = beats / fit.beatsPerRep
  return {
    exerciseId: e.id, segment: dance.phase === 'warmup' ? 'warmup' : dance.phase === 'cooldown' ? 'stretch' : 'main',
    bpm, beatsPerRep: fit.beatsPerRep, timeScale: fit.timeScale, sided: false, restBeforeSeconds: 0, round: 1,
    workSeconds: reps * repSeconds(fit.beatsPerRep, bpm), reps, dance,
  }
}

export function compileRoutine(routine: Routine, catalog: readonly Exercise[]): Plan {
  const byId = new Map(catalog.map(e => [e.id, e]))
  const get = (id: string): Exercise => {
    const e = byId.get(id)
    if (!e) throw new Error(`unknown exercise id: ${id}`)
    return e
  }
  const info = (block: number, phase: DanceItemInfo['phase'], tier: DanceTier, pass: number): DanceItemInfo =>
    ({ block, phase, tier, pass })

  const warmup = routine.warmup.map(id => danceItem(get(id), WARMUP_BPM, ITEM_BEATS, info(0, 'warmup', 1, 0)))
  const blocks = routine.blocks.flatMap(b => {
    const learn = b.moves.map((id, s) => danceItem(get(id), b.bpm, ITEM_BEATS, info(b.index + 1, 'learn', SLOT_TIERS[s], 0)))
    const combo = Array.from({ length: b.comboPasses }, (_, p) =>
      b.moves.map((id, s) => danceItem(get(id), b.bpm, COMBO_BEATS, info(b.index + 1, 'combo', SLOT_TIERS[s], p + 1)))).flat()
    return [...learn, ...combo]
  })
  const cooldown = routine.cooldown.map(id => danceItem(get(id), COOLDOWN_BPM, ITEM_BEATS, info(0, 'cooldown', 1, 0)))
  const stretch = routine.stretch.map(id => toItem(get(id), 'stretch', routine.input, 0))

  const items = [...warmup, ...blocks, ...cooldown, ...stretch]
  const totalSeconds = computeTotal(items)
  const target = routine.input.minutes * 60
  const shortfallSeconds = totalSeconds < target - TOLERANCE_SECONDS ? Math.round(target - totalSeconds) : 0
  return { input: routine.input, seed: routine.seed, items, totalSeconds, shortfallSeconds, rounds: routine.blocks.length, routine }
}
