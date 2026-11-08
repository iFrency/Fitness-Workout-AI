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

it("parses a row without pools as ['shape']", () => {
  const { pools: _pools, ...row } = makeExercise()
  expect(parseCatalog([row])[0].pools).toEqual(['shape'])
})

it('requires danceTier for dance pool', () => {
  const bad = [makeExercise({ pools: ['dance'] })]
  expect(() => parseCatalog(bad)).toThrow(CatalogError)
  expect(() => parseCatalog(bad)).toThrow(/danceTier/)
})

it('rejects danceTier outside dance pool', () => {
  expect(() => parseCatalog([makeExercise({ pools: ['shape'], danceTier: 2 })])).toThrow(CatalogError)
})

it('rejects sided dance move', () => {
  const bad = [makeExercise({ pools: ['dance'], danceTier: 1, sided: true })]
  expect(() => parseCatalog(bad)).toThrow(/sided/)
})
