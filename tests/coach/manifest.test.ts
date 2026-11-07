import { readFileSync } from 'node:fs'
import { CUE_GAP_SECONDS } from '../../src/coach/cues'
import { allPhrases } from '../../src/coach/phrases'
import { parseCatalog } from '../../src/catalog/types'

const manifest = JSON.parse(readFileSync('public/assets/voice/manifest.json', 'utf8')) as Record<string, number>
const catalog = parseCatalog(JSON.parse(readFileSync('public/assets/catalog/exercises.json', 'utf8')))

it('countdown clips fit the one-second spacing, or the next number would be dropped', () => {
  ;['n1', 'n2', 'n3', 'n4', 'n5'].forEach(n => expect(manifest[n], n).toBeLessThanOrEqual(1 - CUE_GAP_SECONDS))
})

it('the manifest covers every phrase with a positive duration', () => {
  Object.keys(allPhrases(catalog)).forEach(id => expect(manifest[id], id).toBeGreaterThan(0))
})
