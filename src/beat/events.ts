import type { DanceTier, SegmentType } from '../catalog/types'
import { beatSeconds } from '../planner/timing'
import type { DanceItemInfo, Plan } from '../planner/types'
import type { Side, Step, StepKind } from '../player/timeline'

export interface DanceBeatInfo {
  readonly tier: DanceTier
  readonly phase: DanceItemInfo['phase']
  readonly nextTier: DanceTier | null
  readonly blockStart: boolean
}

export interface BeatEvent {
  readonly time: number
  readonly stepIndex: number
  readonly kind: StepKind
  readonly segment: SegmentType
  readonly side: Side
  readonly beatInStep: number
  readonly beatsLeftInStep: number
  readonly repIndex: number
  readonly beatInRep: number
  readonly isRepEnd: boolean
  readonly repsLeft: number
  readonly dance?: DanceBeatInfo
}

const EPSILON = 1e-9

function danceInfo(step: Step, plan: Plan, k: number): DanceBeatInfo | undefined {
  const dance = plan.items[step.itemIndex].dance
  if (!dance || step.kind !== 'work') return undefined
  const previous = plan.items[step.itemIndex - 1]?.dance
  return {
    tier: dance.tier,
    phase: dance.phase,
    nextTier: plan.items[step.itemIndex + 1]?.dance?.tier ?? null,
    blockStart: k === 0 && dance.phase === 'learn' && previous?.block !== dance.block,
  }
}

function eventAt(step: Step, stepIndex: number, segment: SegmentType, k: number, total: number, dance?: DanceBeatInfo): BeatEvent {
  const time = step.start + k * beatSeconds(step.bpm)
  const base = {
    time, stepIndex, kind: step.kind, segment, side: step.side, beatInStep: k, beatsLeftInStep: total - k,
    ...(dance ? { dance } : {}),
  }
  if (step.kind !== 'work') return { ...base, repIndex: 0, beatInRep: 0, isRepEnd: false, repsLeft: 0 }
  const repIndex = Math.floor(k / step.beatsPerRep)
  const beatInRep = k % step.beatsPerRep
  return { ...base, repIndex, beatInRep, isRepEnd: beatInRep === step.beatsPerRep - 1, repsLeft: step.reps - repIndex }
}

export function beatEventsInWindow(steps: readonly Step[], plan: Plan, from: number, to: number): BeatEvent[] {
  const events: BeatEvent[] = []
  steps.forEach((step, stepIndex) => {
    if (step.end <= from || step.start >= to) return
    const beat = beatSeconds(step.bpm)
    const total = Math.round((step.end - step.start) / beat)
    const first = Math.max(0, Math.ceil((from - step.start) / beat - EPSILON))
    const segment = plan.items[step.itemIndex].segment
    for (let k = first; k < total; k++) {
      const event = eventAt(step, stepIndex, segment, k, total, danceInfo(step, plan, k))
      if (event.time >= to) break
      if (event.time >= from) events.push(event)
    }
  })
  return events
}
