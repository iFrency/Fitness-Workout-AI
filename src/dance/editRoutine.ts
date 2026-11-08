import type { Exercise } from '../catalog/types'
import type { Plan } from '../planner/types'
import { danceFit } from './compileRoutine'
import { danceEligible, isFunny } from './pool'
import { WARMUP_BPM, COOLDOWN_BPM, SLOT_TIERS } from './tempo'
import type { MoveRef, Routine } from './types'

function listOf(routine: Routine, ref: MoveRef): readonly string[] {
  if (ref.part === 'block') return routine.blocks[ref.block].moves
  return ref.part === 'warmup' ? routine.warmup : routine.cooldown
}

/** Eligible moves of the slot's tier that fit its tempo, excluding moves already in the same list. */
export function danceCandidates(routine: Routine, ref: MoveRef, catalog: readonly Exercise[]): readonly Exercise[] {
  const list = listOf(routine, ref)
  const current = list[ref.part === 'block' ? ref.slot : ref.index]
  const tier = ref.part === 'block' ? SLOT_TIERS[ref.slot] : 1
  const bpm = ref.part === 'block' ? routine.blocks[ref.block].bpm : ref.part === 'warmup' ? WARMUP_BPM : COOLDOWN_BPM
  const otherFunny = ref.part === 'block' && list.some((id, s) => s !== ref.slot && isFunny(id))
  const neighbours = ref.part === 'block'
    ? [routine.blocks[ref.block - 1], routine.blocks[ref.block + 1]].flatMap(b => b?.moves ?? [])
    : []
  return catalog.filter(e =>
    danceEligible(e, routine.input) && e.danceTier === tier && !list.includes(e.id) && e.id !== current && !neighbours.includes(e.id) &&
    danceFit(e, bpm) !== null &&
    !(ref.part !== 'block' && isFunny(e.id)) &&
    !(ref.part === 'block' && isFunny(e.id) && (ref.slot === 2 || otherFunny)))
}

/** Returns a new routine with one move swapped; a block move changes in the learn pass and every combo pass. */
export function replaceMove(routine: Routine, ref: MoveRef, exerciseId: string): Routine {
  const swap = (ids: readonly string[], at: number): readonly string[] => ids.map((id, i) => (i === at ? exerciseId : id))
  if (ref.part === 'block') {
    return { ...routine, blocks: routine.blocks.map((b, i) => (i === ref.block ? { ...b, moves: swap(b.moves, ref.slot) } : b)) }
  }
  return ref.part === 'warmup'
    ? { ...routine, warmup: swap(routine.warmup, ref.index) }
    : { ...routine, cooldown: swap(routine.cooldown, ref.index) }
}

/** Which routine move a plan item plays; null for stretch items. */
export function refOfItem(plan: Plan, index: number): MoveRef | null {
  const d = plan.items[index]?.dance
  if (!d) return null
  const slot = plan.items.slice(0, index).filter(i =>
    i.dance && i.dance.phase === d.phase && i.dance.block === d.block && i.dance.pass === d.pass).length
  if (d.phase === 'warmup' || d.phase === 'cooldown') return { part: d.phase, index: slot }
  return { part: 'block', block: d.block - 1, slot }
}
