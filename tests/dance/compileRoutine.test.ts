import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCatalog } from '../../src/catalog/types'
import type { Level } from '../../src/catalog/types'
import { compileRoutine } from '../../src/dance/compileRoutine'
import { generateRoutine, routineSeconds } from '../../src/dance/generateRoutine'
import type { DanceInput, DanceMinutes } from '../../src/dance/types'
import { toItem } from '../../src/planner/generatePlan'
import { repSeconds } from '../../src/planner/timing'
import { buildTimeline } from '../../src/player/timeline'

const catalog = parseCatalog(JSON.parse(readFileSync('public/assets/catalog/exercises.json', 'utf8')))
const input = (minutes: DanceMinutes, level: Level): DanceInput => ({ mode: 'dance', minutes, level, quiet: false })
const plan = (minutes: DanceMinutes = 20, level: Level = 2, seed = 3) =>
  compileRoutine(generateRoutine(input(minutes, level), catalog, seed), catalog)

describe('compileRoutine', () => {
  it('every dance item spans a whole number of 8-counts', () => {
    for (const it of plan().items.filter(i => i.dance)) {
      expect((it.reps * it.beatsPerRep) % 8).toBe(0)
      expect([1, 2, 4, 8]).toContain(it.beatsPerRep)
    }
  })

  it('learn and warm-up items are 32 beats, combo items 16', () => {
    for (const it of plan().items.filter(i => i.dance)) {
      const beats = it.reps * it.beatsPerRep
      expect(beats).toBe(it.dance!.phase === 'combo' ? 16 : 32)
      expect(it.workSeconds).toBeCloseTo(it.reps * repSeconds(it.beatsPerRep, it.bpm), 9)
    }
  })

  it('all restBeforeSeconds are 0; stretch items equal toItem output and have no dance field', () => {
    const p = plan()
    expect(p.items.every(i => i.restBeforeSeconds === 0 && !i.sided && i.round === 1)).toBe(true)
    const stretch = p.items.filter(i => !i.dance)
    expect(stretch.length).toBe(p.routine!.stretch.length)
    stretch.forEach((it, k) => {
      const e = catalog.find(x => x.id === p.routine!.stretch[k])!
      expect(it).toEqual(toItem(e, 'stretch', p.input as DanceInput, 0))
    })
  })

  it('items order: warmup, then per block 4 learn + passes x 4 combo, then cooldown, then stretch', () => {
    const r = { ...generateRoutine(input(10, 2), catalog, 1) }
    const one = { ...r, blocks: [{ ...r.blocks[0], comboPasses: 2 as const }] }
    const p = compileRoutine(one, catalog)
    const phases = p.items.map(i => i.dance?.phase ?? 'stretch')
    const expected = [
      ...Array(one.warmup.length).fill('warmup'), ...Array(4).fill('learn'), ...Array(8).fill('combo'),
      ...Array(one.cooldown.length).fill('cooldown'), ...Array(one.stretch.length).fill('stretch'),
    ]
    expect(phases).toEqual(expected)
    const combos = p.items.filter(i => i.dance?.phase === 'combo')
    expect(combos.map(c => c.dance!.pass)).toEqual([1, 1, 1, 1, 2, 2, 2, 2])
    expect(p.items.filter(i => i.dance?.phase === 'learn').map(i => i.dance!.tier)).toEqual([2, 2, 3, 1])
    expect(p.items.filter(i => i.dance?.phase === 'learn').every(i => i.dance!.block === 1)).toBe(true)
    expect(p.items[0].bpm).toBe(100)
    expect(p.items.find(i => i.dance?.phase === 'cooldown')!.bpm).toBe(96)
    expect(p.rounds).toBe(1)
  })

  it('buildTimeline gives back-to-back work steps after prepare', () => {
    const steps = buildTimeline(plan())
    expect(steps[0].kind).toBe('prepare')
    expect(steps.slice(1).every(s => s.kind === 'work')).toBe(true)
    steps.slice(2).forEach((s, i) => expect(s.start).toBeCloseTo(steps[i + 1].end, 9))
  })

  it('totalSeconds equals routineSeconds across generated routines', () => {
    for (const minutes of [10, 15, 20, 30] as const) {
      for (const level of [1, 2, 3] as const) {
        for (let seed = 1; seed <= 10; seed++) {
          const r = generateRoutine(input(minutes, level), catalog, seed)
          expect(Math.abs(compileRoutine(r, catalog).totalSeconds - routineSeconds(r, catalog))).toBeLessThan(1e-6)
        }
      }
    }
  })
})
