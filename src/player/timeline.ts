import { PREPARE_SECONDS, SWITCH_SECONDS, barsCeil, repSeconds } from '../planner/timing'
import type { Plan, PlanItem } from '../planner/types'

export type StepKind = 'prepare' | 'work' | 'rest' | 'switch'
export type Side = 'left' | 'right' | null

export interface Step {
  readonly kind: StepKind
  readonly itemIndex: number
  readonly start: number
  readonly end: number
  readonly bpm: number
  readonly side: Side
  readonly reps: number
  readonly beatsPerRep: number
  readonly timeScale: number
}

export interface TrainingState {
  readonly done: boolean
  readonly stepIndex: number
  readonly step: Step
  readonly repIndex: number
  readonly repProgress: number
  readonly stepElapsed: number
  readonly stepRemaining: number
}

function pause(kind: 'prepare' | 'rest' | 'switch', item: PlanItem, itemIndex: number, start: number, seconds: number): Step {
  return { kind, itemIndex, start, end: start + seconds, bpm: item.bpm, side: null, reps: 0, beatsPerRep: 0, timeScale: 1 }
}

function work(item: PlanItem, itemIndex: number, start: number, side: Side): Step {
  const end = start + item.reps * repSeconds(item.beatsPerRep, item.bpm)
  return { kind: 'work', itemIndex, start, end, bpm: item.bpm, side, reps: item.reps, beatsPerRep: item.beatsPerRep, timeScale: item.timeScale }
}

export function buildTimeline(plan: Plan): readonly Step[] {
  const first = plan.items[0]
  const steps: Step[] = [pause('prepare', first, 0, 0, barsCeil(PREPARE_SECONDS, first.bpm))]
  plan.items.forEach((item, index) => {
    const at = () => steps[steps.length - 1].end
    if (item.restBeforeSeconds > 0) steps.push(pause('rest', item, index, at(), item.restBeforeSeconds))
    if (item.sided) {
      steps.push(work(item, index, at(), 'left'))
      steps.push(pause('switch', item, index, at(), barsCeil(SWITCH_SECONDS, item.bpm)))
      steps.push(work(item, index, at(), 'right'))
    } else {
      steps.push(work(item, index, at(), null))
    }
  })
  return steps
}

export function timelineEnd(steps: readonly Step[]): number {
  return steps[steps.length - 1].end
}

function findStep(steps: readonly Step[], t: number): number {
  let lo = 0
  let hi = steps.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (steps[mid].start <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function stateAt(steps: readonly Step[], t: number): TrainingState {
  const end = timelineEnd(steps)
  const done = t >= end
  const stepIndex = done ? steps.length - 1 : findStep(steps, Math.max(0, t))
  const step = steps[stepIndex]
  const elapsed = Math.min(step.end - step.start, Math.max(0, t - step.start))
  let repIndex = 0
  let repProgress = 0
  if (step.kind === 'work') {
    const rep = repSeconds(step.beatsPerRep, step.bpm)
    const position = Math.min(step.reps - 1e-9, elapsed / rep)
    repIndex = Math.floor(position)
    repProgress = position - repIndex
  }
  return { done, stepIndex, step, repIndex, repProgress, stepElapsed: elapsed, stepRemaining: step.end - step.start - elapsed }
}
