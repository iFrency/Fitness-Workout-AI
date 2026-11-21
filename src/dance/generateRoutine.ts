import type { DanceTier as Tier, Exercise } from '../catalog/types'
import { mulberry32, shuffle } from '../planner/rng'
import { TOLERANCE_SECONDS, repSeconds, repsForSeconds } from '../planner/timing'
import { DANCE_STRETCH_IDS, danceEligible, isFunny } from './pool'
import {
  COOLDOWN_BPM, ITEM_BEATS, SLOT_TIERS, STRETCH_BPM, STRETCH_SECONDS, WARMUP_BPM, blockBeats, blockBpm,
} from './tempo'
import type { Block, DanceInput, Routine } from './types'

const COOLDOWN_COUNT = 2
const MAX_WARMUP = 6
const MAX_STRETCH = 4

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const itemSec = (bpm: number): number => (ITEM_BEATS * 60) / bpm

function stretchSeconds(ex: Exercise): number {
  return repsForSeconds(STRETCH_SECONDS, ex.beatsPerRep, STRETCH_BPM) * repSeconds(ex.beatsPerRep, STRETCH_BPM)
}

export function routineSeconds(routine: Routine, catalog: readonly Exercise[]): number {
  const byId = new Map(catalog.map(e => [e.id, e]))
  const blocks = routine.blocks.reduce((s, b) => s + (blockBeats(b.comboPasses) * 60) / b.bpm, 0)
  const stretch = routine.stretch.reduce((s, id) => {
    const ex = byId.get(id)
    if (!ex) throw new Error(`unknown stretch id: ${id}`)
    return s + stretchSeconds(ex)
  }, 0)
  return routine.warmup.length * itemSec(WARMUP_BPM) + routine.cooldown.length * itemSec(COOLDOWN_BPM) + blocks + stretch
}

function planBlockCount(input: DanceInput, warm0: number, stretchSecs: number): number {
  const target = input.minutes * 60
  const available = target - warm0 * itemSec(WARMUP_BPM) - COOLDOWN_COUNT * itemSec(COOLDOWN_BPM) - stretchSecs
  let used = 0
  let count = 0
  for (;;) {
    const next = (blockBeats(2) * 60) / blockBpm(input.level, count)
    if (count >= 1 && used + next > available) return count
    used += next
    count += 1
  }
}

export function generateRoutine(input: DanceInput, catalog: readonly Exercise[], seed: number): Routine {
  const rand = mulberry32(seed)
  const target = input.minutes * 60
  const eligible = catalog.filter(e => danceEligible(e, input))
  const idsByTier = (t: Tier): string[] => eligible.filter(e => e.danceTier === t).map(e => e.id)

  const queues = new Map<Tier, string[]>()
  const take = (tier: Tier, ok: (id: string) => boolean): string | null => {
    for (let attempt = 0; attempt < 2; attempt++) {
      let queue = queues.get(tier) ?? []
      if (attempt === 1 || queue.length === 0) {
        queue = shuffle(idsByTier(tier), rand)
      }
      const i = queue.findIndex(ok)
      if (i >= 0) {
        queues.set(tier, queue.filter((_, k) => k !== i))
        return queue[i]
      }
      queues.set(tier, queue)
    }
    return null
  }
  const takeNear = (tier: Tier, ok: (id: string) => boolean): string => {
    const order = [tier, tier - 1, tier + 1].filter((t): t is Tier => t >= 1 && t <= 3)
    for (const t of order) {
      const id = take(t, ok)
      if (id !== null) return id
    }
    throw new Error('no eligible dance move available')
  }

  const stretchIds = shuffle(DANCE_STRETCH_IDS, rand).slice(0, MAX_STRETCH)
  const stretchEx = stretchIds.map(id => {
    const ex = catalog.find(e => e.id === id)
    if (!ex) throw new Error(`dance stretch missing from catalog: ${id}`)
    return ex
  })

  const warm0 = clamp(Math.round((0.1 * target) / itemSec(WARMUP_BPM)), 3, MAX_WARMUP)
  const stretch0 = clamp(Math.round((0.12 * target - 40) / STRETCH_SECONDS), 1, MAX_STRETCH)
  const stretchSecs = stretchEx.slice(0, stretch0).reduce((s, e) => s + stretchSeconds(e), 0)
  const blockCount = planBlockCount(input, warm0, stretchSecs)

  /** Timing depends only on counts, tempos and passes, so plan with empty slots and draw the moves for what is kept. */
  const slots: Block[] = Array.from({ length: blockCount + 1 }, (_, b) => ({ index: b, bpm: blockBpm(input.level, b), moves: [], comboPasses: 2 }))
  const placeholders = (n: number): string[] => Array.from({ length: n }, () => '')

  const fit = (count: number): { routine: Routine; key: readonly number[] } => {
    let best: { routine: Routine; key: readonly number[] } | null = null
    for (const lastPasses of [2, 1] as const) {
      for (let warm = 3; warm <= MAX_WARMUP; warm++) {
        for (let st = 1; st <= MAX_STRETCH; st++) {
          const routine: Routine = {
            input, seed,
            warmup: placeholders(warm),
            blocks: slots.slice(0, count).map((blk, i) => (i === count - 1 ? { ...blk, comboPasses: lastPasses } : blk)),
            cooldown: placeholders(COOLDOWN_COUNT),
            stretch: stretchIds.slice(0, st),
          }
          const key = [
            Math.abs(routineSeconds(routine, catalog) - target),
            lastPasses === 2 ? 0 : 1,
            Math.abs(warm - warm0),
            Math.abs(st - stretch0),
          ]
          if (best === null || lexLess(key, best.key)) best = { routine, key }
        }
      }
    }
    return best!
  }
  const base = fit(blockCount)
  const chosen = base.key[0] <= TOLERANCE_SECONDS ? base.routine : (() => {
    const more = fit(blockCount + 1)
    return more.key[0] < base.key[0] ? more.routine : base.routine
  })()

  const warmup: string[] = []
  while (warmup.length < chosen.warmup.length) warmup.push(takeNear(1, id => !isFunny(id) && !warmup.includes(id)))
  const cooldown: string[] = []
  while (cooldown.length < COOLDOWN_COUNT) {
    cooldown.push(takeNear(1, id => !isFunny(id) && !cooldown.includes(id)))
  }
  const blocks: Block[] = []
  for (const slot of chosen.blocks) {
    const prev = new Set(blocks.at(-1)?.moves ?? [])
    const moves: string[] = []
    SLOT_TIERS.forEach((tier, slotIndex) => {
      const hasFunny = (): boolean => moves.some(isFunny)
      moves.push(takeNear(tier, id =>
        !prev.has(id) && !moves.includes(id) && !(isFunny(id) && (slotIndex === 2 || hasFunny()))))
    })
    blocks.push({ ...slot, moves })
  }
  return { ...chosen, warmup, cooldown, blocks }
}

function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i]
  }
  return false
}
