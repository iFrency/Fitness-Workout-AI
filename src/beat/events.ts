import type { SegmentType } from '../catalog/types'
import { beatSeconds } from '../planner/timing'
import type { Plan } from '../planner/types'
import type { Side, Step, StepKind } from '../player/timeline'

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
}

const EPSILON = 1e-9

function eventAt(step: Step, stepIndex: number, segment: SegmentType, k: number, total: number): BeatEvent {
  const time = step.start + k * beatSeconds(step.bpm)
  const base = { time, stepIndex, kind: step.kind, segment, side: step.side, beatInStep: k, beatsLeftInStep: total - k }
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
      const event = eventAt(step, stepIndex, segment, k, total)
      if (event.time >= to) break
      if (event.time >= from) events.push(event)
    }
  })
  return events
}
