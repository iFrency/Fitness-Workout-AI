import { readFileSync } from 'node:fs'
import { CUE_GAP_SECONDS, buildCueSheet } from '../../src/coach/cues'
import { generatePlan } from '../../src/planner/generatePlan'
import { buildTimeline } from '../../src/player/timeline'
import { allPhrases } from '../../src/coach/phrases'
import { parseCatalog } from '../../src/catalog/types'

const manifest = JSON.parse(readFileSync('public/assets/voice/manifest.json', 'utf8')) as Record<string, number>
const catalog = parseCatalog(JSON.parse(readFileSync('public/assets/catalog/exercises.json', 'utf8')))

it('countdown clips fit the one-second spacing, or the next number would be dropped', () => {
  ;['n1', 'n2', 'n3', 'n4', 'n5'].forEach(n => expect(manifest[n], n).toBeLessThanOrEqual(1 - CUE_GAP_SECONDS))
})

it('with real clip lengths, every rest and the prepare step still announce the next exercise', () => {
  // Level 3, 30 min, neck only: tight 11s rests at round boundaries (done + round + rest line + name).
  for (let seed = 0; seed < 10; seed++) {
    const plan = generatePlan({ mode: 'shape', parts: ['肩颈'], minutes: 30, level: 3 }, catalog, seed)
    const steps = buildTimeline(plan)
    const sheet = buildCueSheet(steps, plan, catalog, manifest)
    steps.filter(s => s.kind === 'rest' || s.kind === 'prepare').forEach(s => {
      const names = sheet.filter(c => c.clip.startsWith('next-') && c.time >= s.start - 1e-9 && c.time < s.end)
      expect(names, `seed ${seed} step at ${s.start.toFixed(1)}`).toHaveLength(1)
      ;['n3', 'n2', 'n1'].forEach(n => expect(sheet.some(c => c.clip === n && Math.abs(c.time - (s.end - Number(n[1]))) < 1e-9)).toBe(true))
    })
  }
})

it('the manifest covers every phrase with a positive duration', () => {
  Object.keys(allPhrases(catalog)).forEach(id => expect(manifest[id], id).toBeGreaterThan(0))
})
