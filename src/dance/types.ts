import type { Level } from '../catalog/types'

export type DanceMinutes = 10 | 15 | 20 | 30

export interface DanceInput {
  readonly mode: 'dance'
  readonly minutes: DanceMinutes
  readonly level: Level
  readonly quiet: boolean
}

export interface Block {
  readonly index: number
  readonly bpm: number
  readonly moves: readonly string[]
  readonly comboPasses: 1 | 2
}

export interface Routine {
  readonly input: DanceInput
  readonly seed: number
  readonly warmup: readonly string[]
  readonly blocks: readonly Block[]
  readonly cooldown: readonly string[]
  readonly stretch: readonly string[]
}

export type MoveRef =
  | { readonly part: 'warmup' | 'cooldown'; readonly index: number }
  | { readonly part: 'block'; readonly block: number; readonly slot: number }
