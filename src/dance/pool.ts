import type { Exercise } from '../catalog/types'
import type { DanceInput } from './types'

export const DANCE_STRETCH_IDS: readonly string[] = [
  'chest-opener-clasp',
  'arms-back-chest-stretch',
  'standing-side-bend-reach',
  'tall-reach-tiptoes',
  'standing-forward-fold-soft',
]

export function isFunny(id: string): boolean {
  return id.startsWith('funny-')
}

export function isQuiet(input: DanceInput): boolean {
  return input.quiet || input.level === 1
}

export function danceEligible(e: Exercise, input: DanceInput): boolean {
  if (!e.pools.includes('dance') || e.danceTier === undefined) return false
  if (isQuiet(input) && e.impact !== 'low') return false
  if (input.level === 1 && e.level > 1) return false
  return true
}
