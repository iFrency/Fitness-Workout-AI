import type { Exercise } from '../catalog/types'
import { placeCues, stepCandidates, type Candidate, type Cue, type VoiceManifest } from '../coach/cues'
import { COUNT_CLIPS, POOLS, allPhrases, cueClipId, nameClipId, nextClipId, quietSafe, type PoolName } from '../coach/phrases'
import { mulberry32 } from '../planner/rng'
import type { Plan, PlanItem } from '../planner/types'
import type { Step } from '../player/timeline'

/** Priorities from the spec table; counts outrank everything on their beats. */
const P = { count: 5, marker: 4, line: 3, detail: 2, cheer: 1 } as const
/** An opening line may slide this far (seconds) when the previous item's last count is still ringing. */
const OPEN_SLACK = 2

const isQuiet = (plan: Plan): boolean => plan.input.mode === 'dance' && (plan.input.quiet || plan.input.level === 1)

function at(clip: string, earliest: number, latest: number, priority: number, deadline: number): Candidate {
  return { clip, earliest, latest, priority, deadline }
}

function pickFrom(rand: () => number, pool: PoolName, quiet: boolean): string | null {
  const ids = quiet ? POOLS[pool].filter(quietSafe) : POOLS[pool]
  return ids.length > 0 ? ids[Math.floor(rand() * ids.length)] : null
}

/** Count clips are pinned to their beat (latest = earliest), so a clip that does not fit is dropped, never shifted. */
function counts(end: number, b: number): Candidate[] {
  return COUNT_CLIPS.map((clip, k) => ({ ...at(clip, end - (4 - k) * b, end - (4 - k) * b, P.count, end + 1), group: 'count' as const }))
}

interface ItemView {
  readonly item: PlanItem
  readonly next: PlanItem | undefined
  readonly firstOfKind: boolean
  readonly firstOfBlock: boolean
  readonly lastInBlock: boolean
}

function view(plan: Plan, itemIndex: number): ItemView {
  const item = plan.items[itemIndex]
  const prev = plan.items[itemIndex - 1]
  const next = plan.items[itemIndex + 1]
  const d = item.dance!
  const sameBlockCombo = next?.dance?.phase === 'combo' && next.dance.block === d.block
  return {
    item,
    next,
    firstOfKind: prev?.dance?.phase !== d.phase,
    firstOfBlock: d.phase === 'learn' && (prev?.dance?.phase !== 'learn' || prev.dance.block !== d.block),
    lastInBlock: d.phase === 'combo' && !sameBlockCombo,
  }
}

function openers(v: ItemView, step: Step, rand: () => number, quiet: boolean): Candidate[] {
  const d = v.item.dance!
  const s = step.start
  const open = (clip: string | null, priority: number): Candidate[] => (clip ? [at(clip, s, s + OPEN_SLACK, priority, step.end)] : [])
  if (d.phase === 'warmup') return v.firstOfKind ? open('dance-start', P.marker) : []
  if (d.phase === 'cooldown') return v.firstOfKind ? open('cooldown', P.marker) : []
  if (d.phase !== 'learn') return []
  return [
    ...(v.firstOfBlock && d.block >= 2 ? open(pickFrom(rand, 'block-up', quiet), P.marker) : []),
    ...(d.tier === 3 ? open(pickFrom(rand, quiet ? 'peak-quiet' : 'peak-jump', quiet), P.marker) : []),
    ...(d.tier === 1 ? open(pickFrom(rand, 'easy', quiet), P.line) : []),
  ]
}

function learnCues(v: ItemView, step: Step, b: number, rand: () => number, quiet: boolean): Candidate[] {
  const d = v.item.dance!
  const { start: s, end: e } = step
  const out: Candidate[] = [at(cueClipId(v.item.exerciseId, 0), s + 8 * b, s + 16 * b, P.detail, e - 4 * b)]
  if (d.phase !== 'cooldown') {
    const hype = pickFrom(rand, 'hype', quiet)
    if (hype) out.push(at(hype, s + 16 * b, s + 20 * b, P.cheer, e - 4 * b))
  }
  const bridge = v.next?.dance?.phase === 'combo' ? 'combo' : v.next ? nextClipId(v.next.exerciseId) : null
  if (bridge) out.push(at(bridge, e - 16 * b, e - 4 * b, P.line, e - 4 * b))
  return [...out, ...counts(e, b)]
}

function comboCues(v: ItemView, step: Step, b: number): Candidate[] {
  const { end: e } = step
  if (v.lastInBlock) return counts(e, b)
  const out: Candidate[] = v.next ? [at(nameClipId(v.next.exerciseId), e - 4 * b, e - 2 * b, P.marker, e)] : []
  const again = v.item.dance!.pass === 1 && v.next?.dance?.pass === 2
  return again ? [...out, at('combo-again', e - 8 * b, e - 6 * b, P.line, e - 4 * b)] : out
}

function danceCandidates(steps: readonly Step[], plan: Plan, lastWork: number, index: number, quiet: boolean): Candidate[] {
  const step = steps[index]
  const v = view(plan, step.itemIndex)
  const rand = mulberry32(plan.seed * 1000 + index)
  const b = 60 / v.item.bpm
  const body = v.item.dance!.phase === 'combo' ? comboCues(v, step, b) : learnCues(v, step, b, rand, quiet)
  const finish = index === lastWork ? [at('finish', step.end, step.end + 10, P.marker, step.end + 10)] : []
  return [...openers(v, step, rand, quiet), ...body, ...finish]
}

/** Dance cue sheet: the spec table for dance items, the time-based rules for prepare and stretch steps. */
export function buildDanceCueSheet(steps: readonly Step[], plan: Plan, catalog: readonly Exercise[], manifest: VoiceManifest): readonly Cue[] {
  const quiet = isQuiet(plan)
  const lastWork = steps.map(s => s.kind).lastIndexOf('work')
  const text = allPhrases(catalog)
  const candidates = steps.flatMap((step, index) =>
    step.kind === 'work' && plan.items[step.itemIndex].dance
      ? danceCandidates(steps, plan, lastWork, index, quiet)
      : stepCandidates(steps, plan, manifest, index))
  const allowed = quiet ? candidates.filter(c => !(text[c.clip] ?? '').includes('跳')) : candidates
  return placeCues(allowed, manifest)
}
