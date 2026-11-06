import { PARTS, type Exercise, type Part, type SegmentType } from '../catalog/types'
import { mulberry32, shuffle } from './rng'
import {
  MIN_REPS, SEGMENT_SHARE, TOLERANCE_SECONDS, bpmFor, fitBeats, itemSeconds, restSeconds,
} from './timing'
import type { Plan, PlanInput, PlanItem } from './types'

const SEGMENTS: readonly SegmentType[] = ['warmup', 'main', 'stretch']

export function matchesParts(exercise: Exercise, parts: readonly Part[]): boolean {
  if (parts.includes('全身') || exercise.parts.includes('全身')) return true
  return exercise.parts.some(p => parts.includes(p))
}

export function eligible(exercise: Exercise, input: PlanInput): boolean {
  if (exercise.level > input.level) return false
  if (input.level === 1 && exercise.impact === 'high') return false
  return matchesParts(exercise, input.parts)
}

export function computeTotal(items: readonly PlanItem[]): number {
  return items.reduce(
    (sum, i) => sum + i.restBeforeSeconds + itemSeconds(i.reps, i.beatsPerRep, i.bpm, i.sided),
    0,
  )
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

function toItem(e: Exercise, segment: SegmentType, input: PlanInput, restBefore: number): PlanItem {
  const bpm = bpmFor(segment, input.level)
  const fit = fitBeats(e.clipSeconds, e.beatsPerRep, bpm)!
  return {
    exerciseId: e.id, segment, reps: e.defaultReps, bpm,
    beatsPerRep: fit.beatsPerRep, timeScale: fit.timeScale, sided: e.sided, restBeforeSeconds: restBefore,
  }
}

function itemCost(item: PlanItem): number {
  return item.restBeforeSeconds + itemSeconds(item.reps, item.beatsPerRep, item.bpm, item.sided)
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

function fitTotal(items: readonly PlanItem[], target: number, maxReps: (id: string) => number): PlanItem[] {
  const result = [...items]
  const indexesOf = (main: boolean) =>
    result.map((it, i) => ((it.segment === 'main') === main ? i : -1)).filter(i => i >= 0).reverse()
  const mainIdx = indexesOf(true)
  for (const i of [...mainIdx, ...indexesOf(false)]) {
    const diff = target - computeTotal(result)
    if (Math.abs(diff) <= TOLERANCE_SECONDS && i !== mainIdx[0]) break
    const it = result[i]
    const perRep = itemSeconds(1, it.beatsPerRep, it.bpm, it.sided)
    const reps = Math.min(maxReps(it.exerciseId), Math.max(MIN_REPS, Math.round(it.reps + diff / perRep)))
    result[i] = { ...it, reps }
  }
  return result
}

export function generatePlan(input: PlanInput, catalog: readonly Exercise[], seed: number): Plan {
  if (input.parts.length === 0) throw new Error('至少选择一个部位')
  const rand = mulberry32(seed)
  const target = input.minutes * 60
  const rotation: readonly Part[] = input.parts.includes('全身') ? PARTS.slice(0, 5) : input.parts
  const chosen: Exercise[] = []
  const items: PlanItem[] = []
  for (const segment of SEGMENTS) {
    const bpm = bpmFor(segment, input.level)
    const candidates = shuffle(
      catalog.filter(e => e.type === segment && eligible(e, input) && fitBeats(e.clipSeconds, e.beatsPerRep, bpm)),
      rand,
    )
    const ctx: SegmentContext = { input, segment, candidates, rotation, budget: target * SEGMENT_SHARE[segment] }
    const rest = restSeconds(input.level, bpm)
    for (const e of pickSegment(ctx, chosen)) {
      items.push(toItem(e, segment, input, items.length === 0 ? 0 : rest))
      chosen.push(e)
    }
  }
  const byId = new Map(catalog.map(e => [e.id, e]))
  const fitted = fitTotal(items, target, id => byId.get(id)!.defaultReps * 2)
  const totalSeconds = computeTotal(fitted)
  const shortfallSeconds = totalSeconds < target - TOLERANCE_SECONDS ? Math.round(target - totalSeconds) : 0
  return { input, seed, items: fitted, totalSeconds, shortfallSeconds }
}
