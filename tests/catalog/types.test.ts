import { CatalogError, parseCatalog } from '../../src/catalog/types'
import { fixtureCatalog, makeExercise } from '../fixtures/catalog'

it('accepts every fixture exercise', () => {
  expect(parseCatalog(fixtureCatalog)).toHaveLength(46)
})

it('rejects unknown part with the exercise id in the message', () => {
  const bad = [{ ...makeExercise({ id: 'x-1' }), parts: ['脚踝'] }]
  expect(() => parseCatalog(bad)).toThrow(/x-1/)
})

it('rejects duplicate ids', () => {
  const e = makeExercise({ id: 'dup' })
  expect(() => parseCatalog([e, e])).toThrow(/dup/)
})

it('rejects defaultReps below 4 and clipSeconds <= 0', () => {
  expect(() => parseCatalog([makeExercise({ defaultReps: 3 })])).toThrow(CatalogError)
  expect(() => parseCatalog([makeExercise({ clipSeconds: 0 })])).toThrow(CatalogError)
})
