import { PARTS, type Exercise, type Part, type SegmentType } from '../catalog/types'
import { mulberry32, shuffle } from './rng'
import {
  SEGMENT_SHARE, SWITCH_SECONDS, TOLERANCE_SECONDS, barsCeil, bpmFor, fitBeats, repSeconds,
  repsForSeconds, restSeconds, workSecondsFor,
} from './timing'
import type { Plan, PlanInput, PlanItem } from './types'

const MAX_ROUNDS = 3
const WORK_ADJUST_MIN = 0.5
const WORK_ADJUST_MAX = 1.5

export function matchesParts(exercise: Exercise, parts: readonly Part[]): boolean {
  if (parts.includes('全身') || exercise.parts.includes('全身')) return true
  return exercise.parts.some(p => parts.includes(p))
}

export function eligible(exercise: Exercise, input: PlanInput): boolean {
  if (!exercise.pools.includes('shape')) return false
  if (exercise.level > input.level) return false
  if (input.level === 1 && exercise.impact === 'high') return false
  return matchesParts(exercise, input.parts)
}

/** Actual seconds of work, both sides included, without rests or the side switch. */
export function itemActualSeconds(item: PlanItem): number {
  return item.reps * repSeconds(item.beatsPerRep, item.bpm) * (item.sided ? 2 : 1)
}

function itemCost(item: PlanItem): number {
  const switchSeconds = item.sided ? barsCeil(SWITCH_SECONDS, item.bpm) : 0
  return item.restBeforeSeconds + itemActualSeconds(item) + switchSeconds
}

export function computeTotal(items: readonly PlanItem[]): number {
  return items.reduce((sum, i) => sum + itemCost(i), 0)
}

interface SegmentContext {
  readonly input: PlanInput
  readonly segment: SegmentType
  readonly candidates: readonly Exercise[]
  readonly rotation: readonly Part[]
  readonly budget: number
}

function sharesPart(a: Exercise, b: Exercise | undefined): boolean {
  return b !== undefined && a.parts.some(p => b.parts.includes(p))
}

export function toItem(e: Exercise, segment: SegmentType, input: PlanInput, restBefore: number, round = 1): PlanItem {
  const bpm = bpmFor(segment, input.level)
  const fit = fitBeats(e.clipSeconds, e.beatsPerRep, bpm)!
  const workSeconds = workSecondsFor(segment, input.level)
  return {
    exerciseId: e.id, segment, bpm, beatsPerRep: fit.beatsPerRep, timeScale: fit.timeScale, sided: e.sided,
    restBeforeSeconds: restBefore, round, workSeconds, reps: repsForSeconds(workSeconds, fit.beatsPerRep, bpm),
  }
}

function findCandidate(ctx: SegmentContext, part: Part, used: ReadonlySet<string>, prev?: Exercise): Exercise | undefined {
  const open = ctx.candidates.filter(e => !used.has(e.id) && matchesParts(e, [part]))
  return ctx.rotation.length === 1 || prev === undefined ? open[0] : open.find(e => !sharesPart(e, prev))
}

function pickSegment(ctx: SegmentContext, prior: readonly Exercise[]): Exercise[] {
  const used = new Set(prior.map(e => e.id))
  const picked: Exercise[] = []
  const rest = restSeconds(ctx.input.level, bpmFor(ctx.segment, ctx.input.level))
  let spent = 0
  let misses = 0
  for (let turn = 0; misses < ctx.rotation.length; turn++) {
    const part = ctx.rotation[turn % ctx.rotation.length]
    const prev = [...prior, ...picked].at(-1)
    const found = findCandidate(ctx, part, used, prev) ?? (picked.length === 0 ? findCandidate(ctx, part, used) : undefined)
    const restBefore = prior.length + picked.length === 0 ? 0 : rest
    const cost = found ? itemCost(toItem(found, ctx.segment, ctx.input, restBefore)) : 0
    if (!found || (picked.length > 0 && spent + cost > ctx.budget)) {
      misses++
      continue
    }
    picked.push(found)
    used.add(found.id)
    spent += cost
    misses = 0
  }
  return picked
}

function segmentItems(segment: SegmentType, input: PlanInput, catalog: readonly Exercise[], rand: () => number, prior: Exercise[], target: number): PlanItem[] {
  const bpm = bpmFor(segment, input.level)
  const candidates = shuffle(
    catalog.filter(e => e.type === segment && eligible(e, input) && fitBeats(e.clipSeconds, e.beatsPerRep, bpm)),
    rand,
  )
  const rotation: readonly Part[] = input.parts.includes('全身') ? PARTS.slice(0, 5) : input.parts
  const ctx: SegmentContext = { input, segment, candidates, rotation, budget: target * SEGMENT_SHARE[segment] }
  const rest = restSeconds(input.level, bpm)
  return pickSegment(ctx, prior).map(e => {
    const item = toItem(e, segment, input, prior.length === 0 ? 0 : rest)
    prior.push(e)
    return item
  })
}

/**
 * Picks 1-3 repeats of the main circuit: the one whose 50%-150% adjustable range comes
 * closest to the available time, then the one needing the least adjustment.
 */
function repeatRounds(circuit: readonly PlanItem[], available: number, rest: number): PlanItem[] {
  const second = circuit.map((it, i) => (i === 0 ? { ...it, restBeforeSeconds: rest } : it))
  const build = (r: number) => Array.from({ length: r }, (_, k) => (k === 0 ? circuit : second).map(it => ({ ...it, round: k + 1 }))).flat()
  const options = Array.from({ length: MAX_ROUNDS }, (_, k) => {
    const items = build(k + 1)
    const total = computeTotal(items)
    const work = items.reduce((s, it) => s + itemActualSeconds(it), 0)
    const min = total - work * (1 - WORK_ADJUST_MIN)
    const max = total + work * (WORK_ADJUST_MAX - 1)
    const miss = available < min ? min - available : available > max ? available - max : 0
    return { items, miss, gap: Math.abs(total - available) }
  })
  // Closest adjustable range first; among equally reachable options, the least adjustment.
  return options.reduce((best, o) => (o.miss < best.miss || (o.miss === best.miss && o.gap < best.gap) ? o : best)).items
}

function trimLastRound(items: readonly PlanItem[], target: number): PlanItem[] {
  const result = [...items]
  const lastRound = Math.max(...result.filter(i => i.segment === 'main').map(i => i.round))
  const inLast = () => result.filter(i => i.segment === 'main' && i.round === lastRound).length
  while (computeTotal(result) > target + TOLERANCE_SECONDS && inLast() > 1) {
    const idx = result.map(i => i.segment === 'main' && i.round === lastRound).lastIndexOf(true)
    result.splice(idx, 1)
  }
  return result
}

/** Stretches or shrinks main items from the end, each within 50%-150% of its target, until the total fits. */
function adjustMains(items: readonly PlanItem[], target: number): PlanItem[] {
  const result = [...items]
  const mains = result.map((it, i) => (it.segment === 'main' ? i : -1)).filter(i => i >= 0).reverse()
  for (const idx of mains) {
    const diff = target - computeTotal(result)
    if (Math.abs(diff) <= TOLERANCE_SECONDS) break
    const it = result[idx]
    const base = it.workSeconds
    const wanted = Math.min(base * WORK_ADJUST_MAX, Math.max(base * WORK_ADJUST_MIN, base + diff / (it.sided ? 2 : 1)))
    result[idx] = { ...it, workSeconds: wanted, reps: repsForSeconds(wanted, it.beatsPerRep, it.bpm) }
  }
  return result
}

export function generatePlan(input: PlanInput, catalog: readonly Exercise[], seed: number): Plan {
  if (input.parts.length === 0) throw new Error('至少选择一个部位')
  const rand = mulberry32(seed)
  const target = input.minutes * 60
  const prior: Exercise[] = []
  const warmup = segmentItems('warmup', input, catalog, rand, prior, target)
  const circuit = segmentItems('main', input, catalog, rand, prior, target)
  const stretch = segmentItems('stretch', input, catalog, rand, prior, target)
  const available = target - computeTotal(warmup) - computeTotal(stretch)
  const mainRest = restSeconds(input.level, bpmFor('main', input.level))
  const main = repeatRounds(circuit, available, mainRest)
  const items = adjustMains(trimLastRound([...warmup, ...main, ...stretch], target), target)
  const rounds = Math.max(1, ...items.filter(i => i.segment === 'main').map(i => i.round))
  const totalSeconds = computeTotal(items)
  const shortfallSeconds = totalSeconds < target - TOLERANCE_SECONDS ? Math.round(target - totalSeconds) : 0
  return { input, seed, items, totalSeconds, shortfallSeconds, rounds }
}
