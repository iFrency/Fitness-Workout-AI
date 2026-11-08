import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCatalog } from '../../src/catalog/types'
import { compileRoutine } from '../../src/dance/compileRoutine'
import { danceCandidates, refOfItem, replaceMove } from '../../src/dance/editRoutine'
import { generateRoutine } from '../../src/dance/generateRoutine'
import { danceEligible } from '../../src/dance/pool'
import type { DanceInput } from '../../src/dance/types'

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
})
