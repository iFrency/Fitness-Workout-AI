import { Accessor, Document, NodeIO } from '@gltf-transform/core'
import { IDLE_CLIP } from '../../src/catalog/constants'
import type { Exercise } from '../../src/catalog/types'
import { readGlbAnimations, validateCatalog } from '../../scripts/validate-catalog'
import { fixtureCatalog, makeExercise } from '../fixtures/catalog'

const clipsFor = (cat: readonly Exercise[]) =>
  new Map([...cat.map(e => [e.clip, e.clipSeconds] as const), [IDLE_CLIP, 3]])

async function makeTestGlb(): Promise<Uint8Array> {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const node = doc.createNode('root')
  doc.createScene().addChild(node)
  const input = doc.createAccessor().setType(Accessor.Type.SCALAR).setArray(new Float32Array([0, 2])).setBuffer(buffer)
  const output = doc.createAccessor().setType(Accessor.Type.VEC3).setArray(new Float32Array([0, 0, 0, 0, 1, 0])).setBuffer(buffer)
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output)
  const channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath('translation').setSampler(sampler)
  doc.createAnimation('Test').addSampler(sampler).addChannel(channel)
  return new NodeIO().writeBinary(doc)
}

it('passes the fixture catalog', () => {
  expect(validateCatalog(fixtureCatalog, clipsFor(fixtureCatalog), 1000)).toEqual([])
})

it('flags too few exercises', () => {
  const few = fixtureCatalog.slice(0, 10)
  expect(validateCatalog(few, clipsFor(few), 1000).join()).toMatch(/40/)
})

it('flags missing clip and duration mismatch', () => {
  const cat = [
    ...fixtureCatalog,
    makeExercise({ id: 'nope-a', clip: 'Nope' }),
    makeExercise({ id: 'off-b', clip: 'Off', clipSeconds: 2 }),
  ]
  const clips = new Map([...clipsFor(fixtureCatalog), ['Off', 2.5]])
  const errs = validateCatalog(cat, clips, 1000).join('\n')
  expect(errs).toMatch(/Nope/)
  expect(errs).toMatch(/off-b/)
})

it('flags an exercise whose tempo cannot fit', () => {
  const cat = [...fixtureCatalog, makeExercise({ id: 'too-slow', clip: 'Slow', clipSeconds: 40, type: 'stretch' })]
  const errs = validateCatalog(cat, new Map([...clipsFor(fixtureCatalog), ['Slow', 40]]), 1000).join('\n')
  expect(errs).toMatch(/too-slow/)
})

it('flags missing part coverage', () => {
  const noNeckMain = fixtureCatalog.filter(e => !(e.parts.includes('肩颈') && e.type === 'main' && e.level === 1))
  expect(validateCatalog(noNeckMain, clipsFor(noNeckMain), 1000).join()).toMatch(/肩颈/)
})

it('flags oversized glb', () => {
  expect(validateCatalog(fixtureCatalog, clipsFor(fixtureCatalog), 4 * 1024 * 1024).join()).toMatch(/3MB/)
})

it('reads animation durations from a GLB', async () => {
  expect(readGlbAnimations(await makeTestGlb())).toEqual(new Map([['Test', 2]]))
})
