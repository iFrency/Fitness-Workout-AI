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
}

export interface Candidate {
  readonly clip: string
  readonly earliest: number
  readonly latest: number
  readonly priority: number
  /** Latest allowed end time. */
  readonly deadline: number
}

export const CUE_GAP_SECONDS = 0.15
const SLACK_SECONDS = 4
const EPS = 1e-9
const P = { countdown: 5, marker: 4, announce: 3, detail: 2, cheer: 1 } as const

function overlapEnd(placed: readonly Cue[], t: number, duration: number): number | null {
  const hit = placed.find(p => t < p.time + p.duration + CUE_GAP_SECONDS - EPS && p.time < t + duration + CUE_GAP_SECONDS - EPS)
  return hit ? hit.time + hit.duration + CUE_GAP_SECONDS : null
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
    for (let next = overlapEnd(placed, t, duration); next !== null; next = overlapEnd(placed, t, duration)) t = next
    if (t > c.latest + EPS || t + duration > c.deadline + EPS) continue
    placed.push({ time: t, clip: c.clip, duration, priority: c.priority })
  }
  return placed.sort((a, b) => a.time - b.time)
}

interface Ctx {
  readonly steps: readonly Step[]
  readonly plan: Plan
  readonly byId: ReadonlyMap<string, Exercise>
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

/** Lines played back-to-back from `start`, each placed after the previous one's duration. */
function chain(ctx: Ctx, start: number, deadline: number, lines: readonly (readonly [string, number])[]): Candidate[] {
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
  return [...chain(ctx, step.start, limit, lines), ...countdown(step, 3)]
}

export function buildCueSheet(steps: readonly Step[], plan: Plan, catalog: readonly Exercise[], manifest: VoiceManifest): readonly Cue[] {
  const lastWorkIndex = steps.map(s => s.kind).lastIndexOf('work')
  const ctx: Ctx = { steps, plan, byId: new Map(catalog.map(e => [e.id, e])), manifest, lastWorkIndex }
  const candidates = steps.flatMap((step, index) => {
    const rand = mulberry32(plan.seed * 1000 + index)
    return step.kind === 'work' ? workCues(ctx, step, index, rand) : pauseCues(ctx, step, index, rand)
  })
  return placeCues(candidates, manifest)
}
