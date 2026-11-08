import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCatalog } from '../../src/catalog/types'
import { CUE_GAP_SECONDS, type Cue, type VoiceManifest } from '../../src/coach/cues'
import { allPhrases } from '../../src/coach/phrases'
import { buildDanceCueSheet } from '../../src/dance/cues'
import { compileRoutine } from '../../src/dance/compileRoutine'
import { generateRoutine } from '../../src/dance/generateRoutine'
import type { DanceInput } from '../../src/dance/types'
import type { Plan } from '../../src/planner/types'
import { buildTimeline, type Step } from '../../src/player/timeline'

const catalog = parseCatalog(JSON.parse(readFileSync('public/assets/catalog/exercises.json', 'utf8')))
const phrases = allPhrases(catalog)
const COUNTS = ['c5', 'c6', 'c7', 'c8']
const EPS = 1e-6

function manifestOf(count = 0.3, omit: readonly string[] = []): VoiceManifest {
  return Object.fromEntries(
    Object.keys(phrases).filter(id => !omit.includes(id)).map(id => [id, COUNTS.includes(id) ? count : /^n\d$/.test(id) ? 0.6 : 1.2]),
  )
}
const input = (quiet: boolean, level: 1 | 2 | 3 = 2): DanceInput => ({ mode: 'dance', minutes: 10, level, quiet })
const planOf = (quiet = false, seed = 3, level: 1 | 2 | 3 = 2): Plan => compileRoutine(generateRoutine(input(quiet, level), catalog, seed), catalog)
/** Same routine with every block's combo run twice, so pass 1 has a combo-again. */
function twoPass(seed = 3): Plan {
  const r = generateRoutine(input(false), catalog, seed)
  return compileRoutine({ ...r, blocks: r.blocks.map(b => ({ ...b, comboPasses: 2 as const })) }, catalog)
}
const sheetOf = (p: Plan, m: VoiceManifest = manifestOf()) => buildDanceCueSheet(buildTimeline(p), p, catalog, m)
const workStep = (steps: readonly Step[], i: number) => steps.find(s => s.kind === 'work' && s.itemIndex === i)!
const inItem = (s: readonly Cue[], st: Step) => s.filter(c => c.time >= st.start - EPS && c.time < st.end - EPS)
const beat = (st: Step) => 60 / st.bpm

describe('buildDanceCueSheet', () => {
  it('no two cues overlap except adjacent count clips', () => {
    for (const p of [planOf(false, 3), planOf(true, 5, 1), twoPass()]) {
      const s = sheetOf(p)
      s.slice(1).forEach((c, i) => {
        const prev = s[i]
        const gap = prev.group === 'count' && c.group === 'count' ? 0 : CUE_GAP_SECONDS
        expect(c.time).toBeGreaterThanOrEqual(prev.time + prev.duration + gap - 1e-9)
      })
    }
  })

  it('every learn and warm-up item ends with c5..c8 on its last four beats', () => {
    const p = planOf()
    const steps = buildTimeline(p)
    const s = sheetOf(p)
    p.items.forEach((it, i) => {
      if (it.dance?.phase !== 'learn' && it.dance?.phase !== 'warmup') return
      const st = workStep(steps, i)
      COUNTS.forEach((id, k) => {
        const c = s.find(x => x.clip === id && x.time > st.start)
        expect(c, `${id} in item ${i}`).toBeDefined()
        expect(Math.abs(c!.time - (st.end - (4 - k) * beat(st)))).toBeLessThan(EPS)
      })
    })
  })

  it('combo items other than a block last call name-<next id> at E-4B and have no counts', () => {
    const p = twoPass()
    const steps = buildTimeline(p)
    const s = sheetOf(p)
    let checked = 0
    p.items.forEach((it, i) => {
      const next = p.items[i + 1]
      if (it.dance?.phase !== 'combo' || next?.dance?.phase !== 'combo' || next.dance.block !== it.dance.block) return
      const st = workStep(steps, i)
      const name = inItem(s, st).find(c => c.clip === `name-${next.exerciseId}`)
      expect(name, `name in item ${i}`).toBeDefined()
      expect(Math.abs(name!.time - (st.end - 4 * beat(st)))).toBeLessThan(EPS)
      expect(inItem(s, st).filter(c => COUNTS.includes(c.clip))).toHaveLength(0)
      checked += 1
    })
    expect(checked).toBeGreaterThan(0)
  })

  it('the last learn item of a block plays combo, not next-; pass 1 last combo item plays combo-again', () => {
    const p = twoPass()
    const steps = buildTimeline(p)
    const s = sheetOf(p)
    let learn = 0
    let again = 0
    p.items.forEach((it, i) => {
      const next = p.items[i + 1]
      const st = workStep(steps, i)
      const here = inItem(s, st)
      if (it.dance?.phase === 'learn' && next?.dance?.phase === 'combo') {
        expect(here.some(c => c.clip === 'combo')).toBe(true)
        expect(here.some(c => c.clip.startsWith('next-'))).toBe(false)
        learn += 1
      }
      if (it.dance?.phase === 'combo' && it.dance.pass === 1 && next?.dance?.pass === 2) {
        const c = here.find(x => x.clip === 'combo-again')
        expect(c, `combo-again in item ${i}`).toBeDefined()
        expect(c!.time).toBeGreaterThanOrEqual(st.end - 8 * beat(st) - EPS)
        expect(c!.time).toBeLessThanOrEqual(st.end - 6 * beat(st) + EPS)
        again += 1
      }
    })
    expect(learn).toBeGreaterThan(0)
    expect(again).toBeGreaterThan(0)
  })

  it('tier-3 learn items open with peak-jump when not quiet and peak-quiet when quiet', () => {
    for (const quiet of [false, true]) {
      const p = planOf(quiet)
      const steps = buildTimeline(p)
      const s = sheetOf(p)
      const tier3 = p.items.map((it, i) => ({ it, i })).filter(({ it }) => it.dance?.phase === 'learn' && it.dance.tier === 3)
      expect(tier3.length).toBeGreaterThan(0)
      tier3.forEach(({ i }) => {
        const st = workStep(steps, i)
        const open = s.find(c => c.clip.startsWith('peak-') && c.time >= st.start - EPS && c.time <= st.start + 2)
        expect(open?.clip.startsWith(quiet ? 'peak-quiet-' : 'peak-jump-')).toBe(true)
      })
    }
  })

  it('quiet routines never schedule a clip whose text contains 跳', () => {
    for (const p of [planOf(true, 1, 2), planOf(true, 2, 3), planOf(false, 4, 1)]) {
      expect(p.input.mode === 'dance' && (p.input.quiet || p.input.level === 1)).toBe(true)
      const s = sheetOf(p)
      expect(s.length).toBeGreaterThan(0)
      s.forEach(c => expect(phrases[c.clip], c.clip).not.toContain('跳'))
    }
  })

  it('a 0.5 s count clip at 136 BPM is dropped rather than shifted', () => {
    const p = planOf()
    const slow = buildTimeline(p).find(s => s.kind === 'work' && p.items[s.itemIndex].dance?.phase === 'learn')!
    const fast = { ...p, items: p.items.map((it, i) => (i === slow.itemIndex ? { ...it, bpm: 136 } : it)) }
    const steps = buildTimeline(fast)
    const st = workStep(steps, slow.itemIndex)
    const s = buildDanceCueSheet(steps, fast, catalog, manifestOf(0.5))
    const counts = inItem(s, st).filter(c => COUNTS.includes(c.clip))
    expect(counts.map(c => c.clip)).toEqual(['c5', 'c7'])
    counts.forEach(c => {
      const k = COUNTS.indexOf(c.clip)
      expect(Math.abs(c.time - (st.end - (4 - k) * beat(st)))).toBeLessThan(EPS)
    })
  })

  it('missing clips are skipped', () => {
    const omit = ['c6', 'hype-1', 'hype-2', 'dance-start', 'combo']
    const s = sheetOf(planOf(), manifestOf(0.3, omit))
    expect(s.length).toBeGreaterThan(0)
    s.forEach(c => expect(omit).not.toContain(c.clip))
    expect(s.some(c => c.clip === 'c5')).toBe(true)
  })

  it('same seed gives the same sheet', () => {
    expect(sheetOf(planOf(false, 9))).toEqual(sheetOf(planOf(false, 9)))
  })

  it('the plan ends with finish', () => {
    expect(sheetOf(planOf()).at(-1)!.clip).toBe('finish')
  })
})
