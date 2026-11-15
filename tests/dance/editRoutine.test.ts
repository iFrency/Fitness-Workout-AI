import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCatalog } from '../../src/catalog/types'
import { compileRoutine } from '../../src/dance/compileRoutine'
import { danceCandidates, refOfItem, replaceMove } from '../../src/dance/editRoutine'
import { generateRoutine } from '../../src/dance/generateRoutine'
import { danceEligible } from '../../src/dance/pool'
import type { DanceTier, Exercise } from '../../src/catalog/types'
import type { DanceInput, Routine } from '../../src/dance/types'

const catalog = parseCatalog(JSON.parse(readFileSync('public/assets/catalog/exercises.json', 'utf8')))
const input: DanceInput = { mode: 'dance', minutes: 20, level: 2, quiet: false }
const routine = generateRoutine(input, catalog, 4)
const ref = { part: 'block', block: 0, slot: 1 } as const

describe('editRoutine', () => {
  it('danceCandidates offers only same-tier eligible moves not already in that block', () => {
    const cands = danceCandidates(routine, ref, catalog)
    expect(cands.length).toBeGreaterThan(0)
    for (const e of cands) {
      expect(e.danceTier).toBe(2)
      expect(danceEligible(e, input)).toBe(true)
      expect(routine.blocks[0].moves).not.toContain(e.id)
    }
  })

  it('danceCandidates excludes moves of the neighbouring blocks', () => {
    const r = generateRoutine({ ...input, minutes: 30 }, catalog, 4)
    expect(r.blocks.length).toBeGreaterThan(2)
    for (const block of [0, 1]) {
      const bref = { part: 'block', block, slot: 1 } as const
      const neighbours = [r.blocks[block - 1], r.blocks[block + 1]].filter(Boolean).flatMap(b => b.moves)
      for (const e of danceCandidates(r, bref, catalog)) expect(neighbours).not.toContain(e.id)
    }
  })

  it('danceCandidates for warmup offers tier-1 moves not in the list', () => {
    const cands = danceCandidates(routine, { part: 'warmup', index: 0 }, catalog)
    expect(cands.every(e => e.danceTier === 1 && !routine.warmup.includes(e.id))).toBe(true)
  })

  it('replaceMove swaps the move in learn and both combo passes and keeps the tier', () => {
    const next = replaceMove(routine, ref, danceCandidates(routine, ref, catalog)[0].id)
    expect(next).not.toBe(routine)
    expect(routine.blocks[0].moves[1]).not.toBe(next.blocks[0].moves[1])
    const p = compileRoutine(next, catalog)
    const hits = p.items.filter(i => i.dance?.block === 1 && i.exerciseId === next.blocks[0].moves[1])
    expect(hits.map(i => i.dance!.phase + i.dance!.pass)).toEqual(['learn0', 'combo1', 'combo2'])
    expect(hits.every(i => i.dance!.tier === 2)).toBe(true)
  })

  it('replaceMove swaps a warmup entry', () => {
    const next = replaceMove(routine, { part: 'warmup', index: 1 }, 'x')
    expect(next.warmup[1]).toBe('x')
    expect(routine.warmup[1]).not.toBe('x')
  })

  it('refOfItem maps a combo item to its block slot, null for stretch', () => {
    const p = compileRoutine(routine, catalog)
    const i = p.items.findIndex(it => it.dance?.block === 1 && it.dance.phase === 'combo' && it.dance.pass === 2 && it.dance.tier === 3)
    expect(refOfItem(p, i)).toEqual({ part: 'block', block: 0, slot: 2 })
    expect(refOfItem(p, 1)).toEqual({ part: 'warmup', index: 1 })
    expect(refOfItem(p, p.items.length - 1)).toBeNull()
    const c = p.items.findIndex(it => it.dance?.phase === 'cooldown')
    expect(refOfItem(p, c + 1)).toEqual({ part: 'cooldown', index: 1 })
  })

  describe('danceCandidates extra filters', () => {
    const mk = (id: string, tier: DanceTier, over: Partial<Exercise> = {}): Exercise =>
      ({ ...catalog[0], id, pools: ['dance'], danceTier: tier, level: 1, impact: 'low', sided: false, beatsPerRep: 2, ...over })
    const slow = { clipSeconds: 40 }
    const pool = [
      mk('a2', 2), mk('b2', 2), mk('c3', 3), mk('d1', 1),
      mk('e2', 2), mk('long2', 2, slow), mk('funny-x2', 2), mk('funny-y2', 2),
      mk('f3', 3), mk('funny-z3', 3),
      mk('g1', 1), mk('h1', 1), mk('funny-w1', 1),
    ]
    const base: Routine = {
      input, seed: 1, warmup: ['d1', 'g1'], cooldown: ['d1'], stretch: [],
      blocks: [{ index: 0, bpm: 118, moves: ['a2', 'b2', 'c3', 'd1'], comboPasses: 2 }],
    }
    const ids = (r: Routine, ref: Parameters<typeof danceCandidates>[1]) => danceCandidates(r, ref, pool).map(e => e.id)

    it('excludes the current move and a move that cannot fit the slot BPM', () => {
      const got = ids(base, { part: 'block', block: 0, slot: 1 })
      expect(got).not.toContain('b2')
      expect(got).not.toContain('long2')
      expect(got).toContain('e2')
    })

    it('never offers a funny move in slot 2, warm-up or cool-down', () => {
      expect(ids(base, { part: 'block', block: 0, slot: 2 })).toEqual(['f3'])
      expect(ids(base, { part: 'warmup', index: 0 })).not.toContain('funny-w1')
      expect(ids(base, { part: 'cooldown', index: 0 })).not.toContain('funny-w1')
      expect(ids(base, { part: 'warmup', index: 0 })).toContain('h1')
    })

    it('offers at most one funny move per block', () => {
      const ref = { part: 'block', block: 0, slot: 1 } as const
      expect(ids(base, ref)).toEqual(expect.arrayContaining(['funny-x2', 'funny-y2']))
      const withFunny: Routine = { ...base, blocks: [{ ...base.blocks[0], moves: ['funny-x2', 'b2', 'c3', 'd1'] }] }
      const got = ids(withFunny, ref)
      expect(got).not.toContain('funny-y2')
      expect(got).toContain('e2')
    })
  })
})
