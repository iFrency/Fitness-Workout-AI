import { beatEventsInWindow, type BeatEvent } from '../../src/beat/events'
import { hitsForEvent } from '../../src/beat/patterns'
import { scheduleWindow } from '../../src/beat/schedule'
import { generatePlan } from '../../src/planner/generatePlan'
import { beatSeconds } from '../../src/planner/timing'
import type { Plan, PlanItem } from '../../src/planner/types'
import { buildTimeline } from '../../src/player/timeline'
import { fixtureCatalog } from '../fixtures/catalog'

const shape = generatePlan({ mode: 'shape', parts: ['全身'], minutes: 10, level: 2 }, fixtureCatalog, 1)

function danceEvent(beatInStep: number, over: Partial<BeatEvent> = {}, tier: 1 | 2 | 3 = 1): BeatEvent {
  return {
    time: 0, stepIndex: 1, kind: 'work', segment: 'main', side: null, beatInStep, beatsLeftInStep: 32 - beatInStep,
    repIndex: 0, beatInRep: 0, isRepEnd: false, repsLeft: 32 - beatInStep,
    dance: { tier, phase: 'learn', nextTier: null, blockStart: false },
    ...over,
  }
}
const at = (beat: number, tier: 1 | 2 | 3, over: Partial<BeatEvent> = {}) => hitsForEvent(danceEvent(beat - 1, over, tier), 'dance')
const names = (beat: number, tier: 1 | 2 | 3) => at(beat, tier).map(h => h.sound).sort()

describe('dance groove', () => {
  it('tier 1 plays kick on 1,3,5,7 and clap on 2,4,6,8, no hats', () => {
    for (const b of [1, 3, 5, 7]) expect(names(b, 1)).toContain('kick')
    for (const b of [2, 4, 6, 8]) {
      expect(names(b, 1)).toEqual(['clap'])
      expect(at(b, 1)[0].gain).toBe(0.5)
    }
    for (let b = 1; b <= 8; b++) expect(names(b, 1)).not.toContain('hat')
    expect(names(1, 1)).toEqual(['bass', 'kick'])
  })
  it('tier 2 has kick every beat, off-beat hats, bass on odd beats', () => {
    for (let b = 1; b <= 8; b++) {
      const hits = at(b, 2)
      expect(hits.filter(h => h.sound === 'kick')).toHaveLength(1)
      expect(hits.filter(h => h.sound === 'hat')).toEqual([expect.objectContaining({ offsetBeats: 0.5 })])
      expect(hits.some(h => h.sound === 'bass')).toBe(b % 2 === 1)
      expect(hits.some(h => h.sound === 'clap')).toBe(b % 2 === 0)
    }
  })
  it('tier 3 adds duang on beat 1 of each 8-count and bass every beat', () => {
    for (let b = 1; b <= 8; b++) {
      expect(names(b, 3)).toContain('bass')
      expect(names(b, 3).includes('duang')).toBe(b === 1)
    }
    expect(names(2, 3)).toEqual(expect.arrayContaining(['clap', 'snare', 'kick']))
    expect(at(9 + 0, 3).some(h => h.sound === 'duang')).toBe(true)
    expect(at(1, 3).filter(h => h.sound === 'hat').map(h => h.offsetBeats ?? 0).sort()).toEqual([0, 0.5])
  })
  it('last 4 beats add a rising snare fill', () => {
    const fill = (left: number) => at(1, 2, { beatsLeftInStep: left }).filter(h => h.sound === 'snare')
    expect(fill(5)).toHaveLength(0)
    expect(fill(4).map(h => [h.gain, h.offsetBeats ?? 0])).toEqual([[0.3, 0], [0.3, 0.5]])
    expect(fill(1)[0].gain).toBeCloseTo(0.9)
  })
  it('build-up raises rate to 2^(4/12) on the final beat before a tier-3 item', () => {
    const dance = { tier: 2 as const, phase: 'learn' as const, nextTier: 3 as const, blockStart: false }
    const last = at(1, 2, { beatsLeftInStep: 1, dance })
    last.forEach(h => expect(h.rate).toBeCloseTo(2 ** (4 / 12)))
    expect(at(1, 2, { beatsLeftInStep: 9, dance }).every(h => h.rate === 1)).toBe(true)
    expect(at(1, 2, { beatsLeftInStep: 8, dance })[0].rate).toBeCloseTo(2 ** (0.5 / 12))
    expect(last.some(h => h.sound === 'hat' && h.offsetBeats === 0.5)).toBe(true)
  })
  it('build-up multiplier also applies to the block-start gong', () => {
    const dance = { tier: 1 as const, phase: 'learn' as const, nextTier: 3 as const, blockStart: true }
    const gong = at(1, 1, { beatsLeftInStep: 1, dance }).find(h => h.sound === 'gong')!
    expect(gong.rate).toBeCloseTo(2 ** (4 / 12))
  })
  it('block start adds a gong', () => {
    const dance = { tier: 1 as const, phase: 'learn' as const, nextTier: null, blockStart: true }
    expect(at(1, 1, { dance }).find(h => h.sound === 'gong')).toEqual({ sound: 'gong', gain: 0.6, rate: 1 })
  })
})

describe('dance scheduling', () => {
  const opts = { mainStyle: 'guichu' as const, userMusic: false, clickWithUserMusic: false }
  const item = (over: Partial<PlanItem>): PlanItem => ({ ...shape.items[0], restBeforeSeconds: 0, reps: 8, beatsPerRep: 4, bpm: 120, sided: false, ...over })
  const dancePlan: Plan = {
    ...shape,
    items: [
      item({ dance: { block: 0, phase: 'warmup', tier: 1, pass: 1 } }),
      item({ dance: { block: 1, phase: 'learn', tier: 2, pass: 1 } }),
      item({ dance: { block: 1, phase: 'learn', tier: 3, pass: 1 } }),
      item({ dance: { block: 2, phase: 'learn', tier: 1, pass: 1 } }),
      item({ dance: { block: 0, phase: 'cooldown', tier: 1, pass: 1 } }),
      item({}),
    ],
  }
  const steps = buildTimeline(dancePlan)
  const all = beatEventsInWindow(steps, dancePlan, 0, steps.at(-1)!.end)
  const first = (itemIndex: number) => all.find(e => e.kind === 'work' && steps[e.stepIndex].itemIndex === itemIndex && e.beatInStep === 0)!
  const last = (itemIndex: number) => all.filter(e => e.kind === 'work' && steps[e.stepIndex].itemIndex === itemIndex).at(-1)!

  it('beatEventsInWindow fills nextTier and blockStart', () => {
    expect(first(0).dance).toEqual({ tier: 1, phase: 'warmup', nextTier: 2, blockStart: false })
    expect(first(1).dance).toMatchObject({ tier: 2, blockStart: true })
    expect(first(2).dance).toMatchObject({ tier: 3, blockStart: false, nextTier: 1 })
    expect(last(1).dance!.nextTier).toBe(3)
    expect(first(3).dance!.blockStart).toBe(true)
    expect(last(4).dance!.nextTier).toBeNull()
    expect(first(5).dance).toBeUndefined()
    expect(all.filter(e => e.dance?.blockStart)).toHaveLength(2)
  })
  it('scheduleWindow places offset hits half a beat later', () => {
    const e = first(1)
    const s = scheduleWindow(steps, dancePlan, e.time, e.time + 0.01, opts, [])
    const hat = s.hits.find(h => h.sound === 'hat')!
    expect(hat.time).toBeCloseTo(e.time + beatSeconds(steps[e.stepIndex].bpm) / 2)
  })
  it('user music: dance items tick in the last 4 beats only', () => {
    const quiet = { ...opts, userMusic: true }
    const s = scheduleWindow(steps, dancePlan, steps[all.find(e => e.dance)!.stepIndex].start, steps.at(-1)!.end, quiet, [])
    const danceEvents = all.filter(e => e.dance)
    expect(s.hits.filter(h => h.gain === 0.6)).toHaveLength(danceEvents.filter(e => e.beatsLeftInStep <= 4).length)
    expect(s.hits.every(h => h.sound === 'tick' && h.rate === 1)).toBe(true)
  })
})
