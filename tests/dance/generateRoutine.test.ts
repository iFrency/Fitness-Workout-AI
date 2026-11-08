import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCatalog } from '../../src/catalog/types'
import type { Exercise, Level } from '../../src/catalog/types'
import { generateRoutine, routineSeconds } from '../../src/dance/generateRoutine'
import { isFunny } from '../../src/dance/pool'
import { blockBpm } from '../../src/dance/tempo'
import type { DanceInput, DanceMinutes } from '../../src/dance/types'

const realCatalog = parseCatalog(JSON.parse(readFileSync('public/assets/catalog/exercises.json', 'utf8')))
const byId = new Map(realCatalog.map(e => [e.id, e]))
const input = (minutes: DanceMinutes, level: Level, quiet = false): DanceInput => ({ mode: 'dance', minutes, level, quiet })
const START = { 1: 110, 2: 118, 3: 124 } as const
const CAP = { 1: 122, 2: 130, 3: 136 } as const

describe('generateRoutine', () => {
  it('sweep: every slot filled, tiers, no adjacent repeats, funny rules, tempos, duration', () => {
    for (const minutes of [10, 15, 20, 30] as const) {
      for (const level of [1, 2, 3] as const) {
        for (const quiet of [false, true]) {
          for (let seed = 1; seed <= 50; seed++) {
            const r = generateRoutine(input(minutes, level, quiet), realCatalog, seed)
            expect(Math.abs(routineSeconds(r, realCatalog) - minutes * 60)).toBeLessThanOrEqual(30)
            r.blocks.forEach((b, i) => {
              expect(b.moves.map(id => byId.get(id)?.danceTier)).toEqual([2, 2, 3, 1])
              expect(b.bpm).toBe(Math.min(CAP[level], START[level] + 4 * i))
              expect(b.index).toBe(i)
              expect(b.moves.filter(isFunny).length).toBeLessThanOrEqual(1)
              expect(isFunny(b.moves[2])).toBe(false)
              if (i > 0) expect(b.moves.some(id => r.blocks[i - 1].moves.includes(id))).toBe(false)
            })
            expect(new Set(r.warmup).size).toBe(r.warmup.length)
            expect(new Set(r.cooldown).size).toBe(r.cooldown.length)
          }
        }
      }
    }
  })

  it('quiet or 入门 picks only low impact', () => {
    for (const inp of [input(20, 1), input(20, 3, true), input(30, 3, true)]) {
      const r = generateRoutine(inp, realCatalog, 3)
      const ids = [...r.warmup, ...r.cooldown, ...r.blocks.flatMap(b => b.moves)]
      expect(ids.every(id => byId.get(id)?.impact === 'low')).toBe(true)
    }
  })

  it('入门 picks only level 1', () => {
    const r = generateRoutine(input(30, 1), realCatalog, 5)
    const ids = [...r.warmup, ...r.cooldown, ...r.blocks.flatMap(b => b.moves)]
    expect(ids.every(id => byId.get(id)?.level === 1)).toBe(true)
  })

  it('same seed gives the same routine', () => {
    expect(generateRoutine(input(20, 2), realCatalog, 9)).toEqual(generateRoutine(input(20, 2), realCatalog, 9))
  })

  it('10 minutes 进阶 gives 3 blocks', () => {
    expect(generateRoutine(input(10, 2), realCatalog, 1).blocks).toHaveLength(3)
  })

  it('30 minutes gives 10 to 13 blocks', () => {
    const n = generateRoutine(input(30, 2), realCatalog, 1).blocks.length
    expect(n).toBeGreaterThanOrEqual(10)
    expect(n).toBeLessThanOrEqual(13)
  })

  it('blockBpm is 0-based', () => {
    expect(blockBpm(2, 0)).toBe(118)
    expect(blockBpm(2, 9)).toBe(130)
  })

  it('falls back to a neighbouring tier when a tier is empty', () => {
    const mk = (id: string, tier: 1 | 2 | 3): Exercise => ({ ...realCatalog[0], id, pools: ['dance'], danceTier: tier, level: 1, impact: 'low', sided: false, beatsPerRep: 2 })
    const tiny = [
      ...Array.from({ length: 6 }, (_, i) => mk(`t1-m${i}`, 1)),
      ...Array.from({ length: 6 }, (_, i) => mk(`t2-m${i}`, 2)),
      ...realCatalog.filter(e => ['chest-opener-clasp', 'arms-back-chest-stretch', 'standing-side-bend-reach', 'tall-reach-tiptoes', 'standing-forward-fold-soft'].includes(e.id)),
    ]
    const r = generateRoutine(input(10, 2), tiny, 4)
    expect(r.blocks[0].moves).toHaveLength(4)
    expect(byId.size).toBeGreaterThan(0)
    expect(tiny.find(e => e.id === r.blocks[0].moves[2])?.danceTier).toBe(2)
  })
})
