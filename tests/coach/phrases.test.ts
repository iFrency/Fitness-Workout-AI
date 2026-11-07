import { FIXED_PHRASES, POOLS, POOL_TEXTS, allPhrases, exercisePhrases } from '../../src/coach/phrases'
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
