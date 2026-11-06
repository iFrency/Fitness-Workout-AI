import type { Level, Part, SegmentType } from '../catalog/types'
import type { Minutes } from './timing'

export interface PlanInput {
  readonly parts: readonly Part[]
  readonly minutes: Minutes
  readonly level: Level
}

export interface PlanItem {
  readonly exerciseId: string
  readonly segment: SegmentType
  readonly reps: number
  readonly bpm: number
  readonly beatsPerRep: number
  readonly timeScale: number
  readonly sided: boolean
  readonly restBeforeSeconds: number
}

export interface Plan {
  readonly input: PlanInput
  readonly seed: number
  readonly items: readonly PlanItem[]
  readonly totalSeconds: number
  readonly shortfallSeconds: number
}
