import { readFileSync } from 'node:fs'
import { parseCatalog } from '../../src/catalog/types'
import { COUNT_CLIPS, FIXED_PHRASES, POOLS, POOL_TEXTS, allPhrases, exercisePhrases, nameClipId, quietSafe } from '../../src/coach/phrases'
import { fixtureCatalog, makeExercise } from '../fixtures/catalog'

it('pool texts follow the spec', () => {
  expect(POOLS.half).toHaveLength(8)
  expect(POOLS.last10).toHaveLength(6)
  expect(POOLS.done).toHaveLength(6)
  expect(POOLS.rest).toHaveLength(4)
  expect(POOL_TEXTS['half-1']).toBe('一半啦！腿还在吗？')
  expect(POOL_TEXTS['rest-4']).toBe('抖抖手脚，马上继续！')
  expect(FIXED_PHRASES.finish).toBe('全部练完！今天的你超魔性！')
  expect(FIXED_PHRASES.n1).toBe('一，')
  expect(FIXED_PHRASES.n5).toBe('五，')
})

it('builds exercise phrases with safe ids', () => {
  const p = exercisePhrases([makeExercise({ id: 'mini-squat', name: '浅蹲', cues: ['双脚与肩同宽'], caution: '膝盖不要内扣' })])
  expect(p['next-mini-squat']).toBe('下一个，浅蹲')
  expect(p['cue-mini-squat-0']).toBe('双脚与肩同宽')
  expect(p['cue-mini-squat-1']).toBe('膝盖不要内扣')
  Object.keys(allPhrases(fixtureCatalog)).forEach(id => expect(id).toMatch(/^[a-z0-9-]+$/))
})

it('omits the second cue when there is neither a second cue nor a caution', () => {
  const p = exercisePhrases([makeExercise({ id: 'a-b', cues: ['x'], caution: '' })])
  expect(p['cue-a-b-1']).toBeUndefined()
})

it('every dance-pool move has a name clip', () => {
  const p = exercisePhrases([
    makeExercise({ id: 'step-touch', name: '并步', pools: ['dance'] }),
    makeExercise({ id: 'plain', name: '普通', pools: ['shape'] }),
  ])
  expect(nameClipId('step-touch')).toBe('name-step-touch')
  expect(p['name-step-touch']).toBe('并步')
  expect(p['name-plain']).toBeUndefined()
})

it('peak-quiet and hype-1,2,5..8 are quiet safe; peak-jump and hype-3,4 are not', () => {
  POOLS['peak-quiet'].forEach(id => expect(quietSafe(id), id).toBe(true))
  ;[1, 2, 5, 6, 7, 8].forEach(i => expect(quietSafe(`hype-${i}`), `hype-${i}`).toBe(true))
  ;[3, 4].forEach(i => expect(quietSafe(`hype-${i}`), `hype-${i}`).toBe(false))
  // peak-jump-2 shares its text with peak-quiet-2, so the pool as a whole is not quiet safe.
  expect(POOLS['peak-jump'].some(id => !quietSafe(id))).toBe(true)
  ;['peak-jump-1', 'peak-jump-3', 'peak-jump-4'].forEach(id => expect(quietSafe(id), id).toBe(false))
})

it('adds the dance fixed phrases and pools from the spec', () => {
  expect(COUNT_CLIPS).toEqual(['c5', 'c6', 'c7', 'c8'])
  expect(['c5', 'c6', 'c7', 'c8'].map(c => FIXED_PHRASES[c]).join('')).toBe('五六七八')
  expect(FIXED_PHRASES['dance-start']).toBe('跟着节奏，动起来！')
  expect(FIXED_PHRASES.combo).toBe('好，连起来！')
  expect(FIXED_PHRASES['combo-again']).toBe('再来一遍！')
  expect(FIXED_PHRASES.cooldown).toBe('最后放松一下～')
  expect(POOLS['block-up']).toHaveLength(4)
  expect(POOLS['peak-jump']).toHaveLength(4)
  expect(POOLS['peak-quiet']).toHaveLength(4)
  expect(POOLS.easy).toHaveLength(4)
  expect(POOLS.hype).toHaveLength(8)
  expect(POOL_TEXTS['hype-8']).toBe('整条街最靓的就是你！')
})

it('clip ids match /^[a-z0-9-]+$/ for the real catalog too', () => {
  const real = parseCatalog(JSON.parse(readFileSync('public/assets/catalog/exercises.json', 'utf8')))
  Object.keys(allPhrases(real)).forEach(id => expect(id).toMatch(/^[a-z0-9-]+$/))
  const danceIds = real.filter(e => e.pools.includes('dance')).map(e => e.id)
  const names = Object.keys(allPhrases(real)).filter(id => id.startsWith('name-'))
  expect(danceIds.length).toBeGreaterThan(0)
  expect(names).toHaveLength(danceIds.length)
  danceIds.forEach(id => expect(names, id).toContain(nameClipId(id)))
})
