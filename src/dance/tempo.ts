import type { DanceTier, Level } from '../catalog/types'

export const WARMUP_BPM = 100
export const COOLDOWN_BPM = 96
export const STRETCH_BPM = 80
export const ITEM_BEATS = 32
export const COMBO_BEATS = 16
export const STRETCH_SECONDS = 30
/** Tier of each of the four move slots in a block. */
export const SLOT_TIERS: readonly DanceTier[] = [2, 2, 3, 1]

const START_BPM: Readonly<Record<Level, number>> = { 1: 110, 2: 118, 3: 124 }
const CAP_BPM: Readonly<Record<Level, number>> = { 1: 122, 2: 130, 3: 136 }
const BPM_STEP = 4

/** Block tempo; blockIndex is 0-based. */
export function blockBpm(level: Level, blockIndex: number): number {
  return Math.min(CAP_BPM[level], START_BPM[level] + BPM_STEP * blockIndex)
}

/** Learn 4 x 32 beats, then the combo (4 x 16 beats) played once or twice. */
export function blockBeats(passes: 1 | 2): number {
  return 4 * ITEM_BEATS + passes * 4 * COMBO_BEATS
}
