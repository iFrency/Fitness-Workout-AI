import type { Exercise } from '../catalog/types'
import { mulberry32 } from '../planner/rng'
import type { Plan } from '../planner/types'
import type { Step } from '../player/timeline'
import { POOLS, cueClipId, nextClipId, type PoolName } from './phrases'

export type VoiceManifest = Readonly<Record<string, number>>

export interface Cue {
  readonly time: number
  readonly clip: string
  readonly duration: number
  readonly priority: number
  /** Count clips may sit back to back with no gap between them. */
  readonly group?: 'count'
}

export interface Candidate {
  readonly clip: string
  readonly earliest: number
  readonly latest: number
  readonly priority: number
  /** Latest allowed end time. */
  readonly deadline: number
  readonly group?: 'count'
}

export const CUE_GAP_SECONDS = 0.15
const SLACK_SECONDS = 4
const EPS = 1e-9
const P = { countdown: 5, marker: 4, announce: 3, detail: 2, cheer: 1 } as const

function overlapEnd(placed: readonly Cue[], t: number, duration: number, group?: 'count'): number | null {
  const gapTo = (p: Cue) => (group === 'count' && p.group === 'count' ? 0 : CUE_GAP_SECONDS)
  const hit = placed.find(p => t < p.time + p.duration + gapTo(p) - EPS && p.time < t + duration + gapTo(p) - EPS)
  return hit ? hit.time + hit.duration + gapTo(hit) : null
}

/** Places cues by priority, sliding each to the first free slot in its window; cues that do not fit are dropped. */
export function placeCues(candidates: readonly Candidate[], manifest: VoiceManifest): Cue[] {
  const ordered = candidates
    .map((c, order) => ({ c, order }))
    .filter(({ c }) => (manifest[c.clip] ?? 0) > 0)
    .sort((a, b) => b.c.priority - a.c.priority || a.c.earliest - b.c.earliest || a.order - b.order)
  const placed: Cue[] = []
  for (const { c } of ordered) {
    const duration = manifest[c.clip]
    let t = c.earliest
    for (let next = overlapEnd(placed, t, duration, c.group); next !== null; next = overlapEnd(placed, t, duration, c.group)) t = next
    if (t > c.latest + EPS || t + duration > c.deadline + EPS) continue
    placed.push({ time: t, clip: c.clip, duration, priority: c.priority, ...(c.group ? { group: c.group } : {}) })
  }
  return placed.sort((a, b) => a.time - b.time)
}

interface Ctx {
  readonly steps: readonly Step[]
  readonly plan: Plan
  readonly manifest: VoiceManifest
  readonly lastWorkIndex: number
}

const dur = (ctx: Ctx, clip: string) => ctx.manifest[clip] ?? 0
const countdownStart = (s: Step) => s.end - (s.kind === 'work' ? 5 : 3)

function fixed(clip: string, at: number, priority: number, deadline: number): Candidate {
  return { clip, earliest: at, latest: at, priority, deadline }
}

function flexible(clip: string, earliest: number, priority: number, deadline: number, latest = earliest + SLACK_SECONDS): Candidate {
  return { clip, earliest, latest, priority, deadline }
}

function pick(rand: () => number, pool: PoolName): string {
  const ids = POOLS[pool]
  return ids[Math.floor(rand() * ids.length)]
}

function countdown(step: Step, from: number): Candidate[] {
  return Array.from({ length: from }, (_, k) => fixed(`n${from - k}`, step.end - (from - k), P.countdown, step.end + 1))
}

type Line = readonly [string, number]

/** Drops the lowest-priority lines (the earliest on a tie) until the rest fit before the deadline. */
function fitLines(ctx: Ctx, start: number, deadline: number, lines: readonly Line[]): Line[] {
  const kept = lines.filter(([clip]) => dur(ctx, clip) > 0)
  const length = () => kept.reduce((sum, [clip]) => sum + dur(ctx, clip) + CUE_GAP_SECONDS, 0) - CUE_GAP_SECONDS
  while (kept.length > 1 && start + length() > deadline + EPS) {
    const lowest = kept.reduce((low, line, i) => (line[1] < kept[low][1] ? i : low), 0)
    kept.splice(lowest, 1)
  }
  return kept
}

/** Lines played back-to-back from `start`, each placed after the previous one's duration. */
function chain(ctx: Ctx, start: number, deadline: number, lines: readonly Line[]): Candidate[] {
  let at = start
  return lines.map(([clip, priority]) => {
    const c = flexible(clip, at, priority, deadline)
    if (dur(ctx, clip) > 0) at += dur(ctx, clip) + CUE_GAP_SECONDS
    return c
  })
}

function workCues(ctx: Ctx, step: Step, index: number, rand: () => number): Candidate[] {
  const item = ctx.plan.items[step.itemIndex]
  const d = step.end - step.start
  const limit = countdownStart(step)
  const out: Candidate[] = [fixed(step.side === 'right' ? 'switch' : 'start', step.start, P.marker, limit)]
  if (step.side !== 'right') {
    const k = ((item.round - 1) % 2) as 0 | 1
    out.push(flexible(cueClipId(item.exerciseId, k), step.start + 3, P.detail, limit, step.start + d / 2 - 2))
  }
  out.push(flexible(pick(rand, 'half'), step.start + d / 2, P.cheer, limit))
  if (d >= 25) out.push(flexible(pick(rand, 'last10'), step.end - 10, P.cheer, limit))
  out.push(...countdown(step, 5))
  if (index !== ctx.lastWorkIndex) return out
  return [...out, flexible('finish', step.end, P.marker, step.end + 10)]
}

function pauseCues(ctx: Ctx, step: Step, index: number, rand: () => number): Candidate[] {
  if (step.kind === 'switch') return countdown(step, 3)
  const limit = countdownStart(step)
  const prev = ctx.steps[index - 1]
  const item = ctx.plan.items[step.itemIndex]
  const lines: [string, number][] = []
  if (step.kind === 'prepare') lines.push(['ready', P.announce])
  else if (prev?.kind === 'work') lines.push([pick(rand, 'done'), P.marker])
  const prevItem = ctx.plan.items[step.itemIndex - 1]
  if (step.kind === 'rest' && item.round >= 2 && prevItem?.round !== item.round) lines.push([`round-${item.round}`, P.announce])
  if (step.kind === 'rest') lines.push([pick(rand, 'rest'), P.detail])
  lines.push([nextClipId(item.exerciseId), P.announce])
  return [...chain(ctx, step.start, limit, fitLines(ctx, step.start, limit, lines)), ...countdown(step, 3)]
}

/** Time-based candidates for one step; `buildCueSheet` is the placement of these over every step. */
export function stepCandidates(steps: readonly Step[], plan: Plan, manifest: VoiceManifest, index: number): Candidate[] {
  const lastWorkIndex = steps.map(s => s.kind).lastIndexOf('work')
  const ctx: Ctx = { steps, plan, manifest, lastWorkIndex }
  const step = steps[index]
  const rand = mulberry32(plan.seed * 1000 + index)
  return step.kind === 'work' ? workCues(ctx, step, index, rand) : pauseCues(ctx, step, index, rand)
}

export function buildCueSheet(steps: readonly Step[], plan: Plan, _catalog: readonly Exercise[], manifest: VoiceManifest): readonly Cue[] {
  return placeCues(steps.flatMap((_, index) => stepCandidates(steps, plan, manifest, index)), manifest)
}
