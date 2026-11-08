import { CUE_GAP_SECONDS, buildCueSheet, placeCues, type Cue, type VoiceManifest } from '../../src/coach/cues'
import { allPhrases } from '../../src/coach/phrases'
import { generatePlan } from '../../src/planner/generatePlan'
import type { Plan } from '../../src/planner/types'
import { buildTimeline } from '../../src/player/timeline'
import { fixtureCatalog } from '../fixtures/catalog'

function fullManifest(seconds = 1): VoiceManifest {
  return Object.fromEntries(Object.keys(allPhrases(fixtureCatalog)).map(id => [id, /^n\d$/.test(id) ? 0.6 : seconds]))
}
const manifest = fullManifest()
const plan = generatePlan({ mode: 'shape', parts: ['全身'], minutes: 10, level: 2 }, fixtureCatalog, 1)
const sheet = (p: Plan = plan, m: VoiceManifest = manifest) => buildCueSheet(buildTimeline(p), p, fixtureCatalog, m)
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

function expectNoOverlap(s: readonly Cue[]) {
  s.slice(1).forEach((c, i) => expect(c.time).toBeGreaterThanOrEqual(s[i].time + s[i].duration + CUE_GAP_SECONDS - 1e-9))
}

describe('placeCues', () => {
  it('keeps the higher priority cue and drops a fixed-time cue that would overlap it', () => {
    const placed = placeCues([
      { clip: 'a', earliest: 0, latest: 0, priority: 1, deadline: 10 },
      { clip: 'b', earliest: 0.5, latest: 0.5, priority: 5, deadline: 10 },
    ], { a: 1, b: 1 })
    expect(placed.map(c => c.clip)).toEqual(['b'])
  })
  it('slides a flexible cue after a conflict and drops it past its deadline', () => {
    const placed = placeCues([
      { clip: 'a', earliest: 0, latest: 0, priority: 5, deadline: 10 },
      { clip: 'b', earliest: 0, latest: 4, priority: 1, deadline: 10 },
      { clip: 'c', earliest: 0, latest: 4, priority: 1, deadline: 2 },
    ], { a: 1, b: 1, c: 1 })
    expect(placed).toEqual([{ time: 0, clip: 'a', duration: 1, priority: 5 }, { time: 1.15, clip: 'b', duration: 1, priority: 1 }])
  })
})

describe('buildCueSheet', () => {
  it('buildCueSheet is unchanged for shape plans', () => {
    const other = generatePlan({ mode: 'shape', parts: ['全身'], minutes: 15, level: 3 }, fixtureCatalog, 7)
    expect({ a: sheet(), b: sheet(other) }).toMatchSnapshot()
  })

  it('no two cues overlap', () => expectNoOverlap(sheet()))

  it('every work step has start or switch, a 5..1 countdown on whole seconds, and the sheet ends with finish', () => {
    const s = sheet()
    buildTimeline(plan).forEach(st => {
      if (st.kind !== 'work') return
      expect(s.some(c => near(c.time, st.start) && (c.clip === 'start' || c.clip === 'switch'))).toBe(true)
      ;[5, 4, 3, 2, 1].forEach(n => expect(s.some(c => c.clip === `n${n}` && near(c.time, st.end - n))).toBe(true))
    })
    expect(s.at(-1)!.clip).toBe('finish')
  })

  it('rest ends with three-two-one and the next work has no count of one before its own countdown', () => {
    const steps = buildTimeline(plan)
    const s = sheet()
    const rest = steps.find(x => x.kind === 'rest')!
    ;[3, 2, 1].forEach(n => expect(s.some(c => c.clip === `n${n}` && near(c.time, rest.end - n))).toBe(true))
    const work = steps.find(x => near(x.start, rest.end))!
    expect(s.filter(c => c.clip === 'n1' && c.time > work.start && c.time < work.end - 1.5)).toHaveLength(0)
  })

  it('rest announces the rest line before the next exercise name', () => {
    const steps = buildTimeline(plan)
    const s = sheet()
    const rest = steps.find(x => x.kind === 'rest')!
    const inRest = s.filter(c => c.time >= rest.start && c.time < rest.end)
    const restIdx = inRest.findIndex(c => c.clip.startsWith('rest-'))
    const nextIdx = inRest.findIndex(c => c.clip.startsWith('next-'))
    expect(nextIdx).toBeGreaterThan(-1)
    if (restIdx > -1) expect(restIdx).toBeLessThan(nextIdx)
  })

  it('short work steps get no last-ten-seconds cue', () => {
    const short: Plan = { ...plan, items: plan.items.map(i => ({ ...i, reps: 4, beatsPerRep: 4, bpm: 120 })) }
    expect(sheet(short).some(c => c.clip.startsWith('last10-'))).toBe(false)
  })

  it('announces round 2 before the second round', () => {
    const p = generatePlan({ mode: 'shape', parts: ['肩颈'], minutes: 30, level: 1 }, fixtureCatalog, 1)
    expect(sheet(p).some(c => c.clip === 'round-2')).toBe(true)
  })

  it('no form cue on the right side (Review Focus 2)', () => {
    const steps = buildTimeline(plan)
    const s = sheet()
    steps.filter(x => x.kind === 'work' && x.side === 'right').forEach(w =>
      expect(s.filter(c => c.clip.startsWith('cue-') && c.time >= w.start && c.time < w.end)).toHaveLength(0))
  })

  it('a long next-exercise name never overlaps the countdown on a 10s rest (Review Focus 1)', () => {
    const p = generatePlan({ mode: 'shape', parts: ['全身'], minutes: 10, level: 3 }, fixtureCatalog, 2)
    const long = { ...manifest, ...Object.fromEntries(Object.keys(manifest).filter(k => k.startsWith('next-')).map(k => [k, 4])) }
    const s = sheet(p, long)
    expectNoOverlap(s)
    expect(s.filter(c => /^n[1-5]$/.test(c.clip)).length).toBeGreaterThan(0)
  })

  it('a long form cue never overlaps the halfway encouragement (Review Focus 3)', () => {
    const long = { ...manifest, ...Object.fromEntries(Object.keys(manifest).filter(k => k.startsWith('cue-')).map(k => [k, 3.5])) }
    expectNoOverlap(sheet(plan, long))
  })

  it('skips clips missing from the manifest without throwing (Review Focus 5)', () => {
    expect(() => sheet(plan, { n1: 0.6, n2: 0.6, n3: 0.6 })).not.toThrow()
    expect(sheet(plan, {})).toEqual([])
  })

  it('is deterministic for a seed', () => expect(sheet()).toEqual(sheet()))
})
