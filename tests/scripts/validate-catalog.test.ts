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

describe('dance pool checks', () => {
  const danceMove = (i: number, over: Partial<Exercise> = {}): Exercise =>
    makeExercise({
      id: `dance-t3-${i}`, clip: `dance-t3-${i}`, clipSeconds: 2.2, parts: ['全身'], pools: ['dance'],
      danceTier: 3, level: 1, beatsPerRep: 4, ...over,
    })
  const withDance = (moves: readonly Exercise[]) => {
    const cat = [...fixtureCatalog, ...moves]
    return { cat, clips: clipsFor(cat) }
  }
  const tierMoves = (tier: 1 | 2 | 3, n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => danceMove(i, { id: `${prefix}-${i}`, clip: `${prefix}-${i}`, danceTier: tier }))
  const fullPool = [...tierMoves(1, 4, 't1'), ...tierMoves(2, 4, 't2'), ...tierMoves(3, 6, 't3')]

  it('accepts a healthy dance pool', () => {
    const { cat, clips } = withDance(fullPool)
    expect(validateCatalog(cat, clips, 1000)).toEqual([])
  })

  it('flags a dance move whose fitted beatsPerRep is 3 or 16 at some dance BPM', () => {
    const bad = danceMove(99, { id: 'dance-long', clip: 'dance-long', clipSeconds: 8, beatsPerRep: 8 })
    const { cat, clips } = withDance([...fullPool, bad])
    const errs = validateCatalog(cat, clips, 1000)
    expect(errs.some(e => e.includes('dance-long') && e.includes('八拍'))).toBe(true)
  })

  it('flags a dual-pool move that would fit at 16 beats at a dance BPM', () => {
    const dual = makeExercise({
      id: 'dual-long', clip: 'dual-long', clipSeconds: 8, parts: ['全身'], pools: ['shape', 'dance'], danceTier: 2, beatsPerRep: 16,
    })
    const { cat, clips } = withDance([...fullPool, dual])
    const errs = validateCatalog(cat, clips, 1000)
    expect(errs.some(e => e.includes('dual-long') && e.includes('八拍'))).toBe(true)
  })

  it('flags fewer than 6 low-impact tier-3 moves', () => {
    const { cat, clips } = withDance([...tierMoves(1, 4, 't1'), ...tierMoves(2, 4, 't2'), ...tierMoves(3, 5, 't3')])
    expect(validateCatalog(cat, clips, 1000)).toContain('低冲击高潮动作少于 6 条')
  })

  it('flags fewer than 4 level-1 low-impact moves in a tier', () => {
    const { cat, clips } = withDance([...tierMoves(1, 4, 't1'), ...tierMoves(2, 3, 't2'), ...tierMoves(3, 6, 't3')])
    expect(validateCatalog(cat, clips, 1000)).toContain('入门可用的强度 2 动作少于 4 条')
  })

  it('accepts 40 to 120 moves', () => {
    const filler = Array.from({ length: 100 - fixtureCatalog.length }, (_, i) =>
      makeExercise({ id: `filler-${i}`, clip: `filler-${i}`, parts: ['全身'], type: 'stretch' }))
    const cat = [...fixtureCatalog, ...filler]
    expect(cat).toHaveLength(100)
    expect(validateCatalog(cat, clipsFor(cat), 1000).filter(e => e.includes('动作数'))).toEqual([])
  })

  it('flags more than 120 moves', () => {
    const filler = Array.from({ length: 121 }, (_, i) => makeExercise({ id: `big-${i}`, clip: `big-${i}`, type: 'stretch' }))
    const cat = [...fixtureCatalog, ...filler]
    expect(validateCatalog(cat, clipsFor(cat), 1000).join()).toMatch(/动作数/)
  })

  it('shape coverage ignores dance-only moves', () => {
    const noShapeNeck = fixtureCatalog.filter(e => !(e.parts.includes('肩颈') && e.type === 'main' && e.level === 1))
    const cheat = danceMove(7, { id: 'neck-dance', clip: 'neck-dance', parts: ['肩颈'] })
    const cat = [...noShapeNeck, ...fullPool, cheat]
    expect(validateCatalog(cat, clipsFor(cat), 1000).join()).toMatch(/肩颈/)
  })
})
