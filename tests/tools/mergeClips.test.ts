import { Document } from '@gltf-transform/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { mergeClip } from '../../tools/catalog/mergeClips'

function addBones(doc: Document, names: string[]): void {
  names.forEach(n => doc.createNode(n))
}

function addClip(doc: Document, name: string): void {
  const buffer = doc.createBuffer()
  const times = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1.5])).setBuffer(buffer)
  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 0, 1, 0])).setBuffer(buffer)
  const rot = doc.createAccessor().setType('VEC4').setArray(new Float32Array([0, 0, 0, 1, 0, 0, 1, 0])).setBuffer(buffer)
  const node = (n: string) => doc.getRoot().listNodes().find(x => x.getName() === n)!
  const anim = doc.createAnimation(name)
  const mk = (out: typeof pos, n: string, path: 'translation' | 'rotation', interp: 'LINEAR' | 'STEP') => {
    const sampler = doc.createAnimationSampler().setInput(times).setOutput(out).setInterpolation(interp)
    anim.addSampler(sampler)
    anim.addChannel(doc.createAnimationChannel().setTargetNode(node(n)).setTargetPath(path).setSampler(sampler))
  }
  mk(pos, 'hips', 'translation', 'LINEAR')
  mk(rot, 'spine', 'rotation', 'STEP')
}

describe('mergeClip', () => {
  let target: Document
  let source: Document
  beforeEach(() => {
    target = new Document()
    addBones(target, ['hips', 'spine'])
    source = new Document()
    addBones(source, ['hips', 'spine'])
    addClip(source, 'burpee')
  })

  it('copies channels onto same-named nodes in the target', () => {
    expect(mergeClip(target, source, 'burpee')).toBeCloseTo(1.5)
    const anim = target.getRoot().listAnimations().find(a => a.getName() === 'burpee')!
    expect(anim.listChannels().map(c => [c.getTargetNode()!.getName(), c.getTargetPath()]))
      .toEqual([['hips', 'translation'], ['spine', 'rotation']])
    anim.listChannels().forEach(c => expect(target.getRoot().listNodes()).toContain(c.getTargetNode()))
  })

  it('copies data into new target accessors and keeps interpolation', () => {
    mergeClip(target, source, 'burpee')
    const anim = target.getRoot().listAnimations()[0]
    const [c0, c1] = anim.listChannels()
    expect(c0.getSampler()!.getInterpolation()).toBe('LINEAR')
    expect(c1.getSampler()!.getInterpolation()).toBe('STEP')
    expect(Array.from(c0.getSampler()!.getOutput()!.getArray()!)).toEqual([0, 0, 0, 0, 1, 0])
    const srcInput = source.getRoot().listAnimations()[0].listSamplers()[0].getInput()
    expect(target.getRoot().listAccessors()).not.toContain(srcInput)
    expect(target.getRoot().listAccessors().every(a => a.getBuffer() === target.getRoot().listBuffers()[0])).toBe(true)
  })

  it('fails when the source has no animation with that name', () =>
    expect(() => mergeClip(target, source, 'push-up')).toThrow(/push-up/))

  it('fails when a channel targets a bone the target lacks, leaving target untouched', () => {
    target.getRoot().listNodes().find(n => n.getName() === 'spine')!.setName('chest')
    expect(() => mergeClip(target, source, 'burpee')).toThrow(/spine/)
    expect(() => mergeClip(target, source, 'burpee')).toThrow(/burpee/)
    expect(target.getRoot().listAnimations()).toHaveLength(0)
    expect(target.getRoot().listAccessors()).toHaveLength(0)
    expect(target.getRoot().listBuffers()).toHaveLength(0)
  })

  it('fails when the target already has that animation', () => {
    mergeClip(target, source, 'burpee')
    const before = target.getRoot().listAccessors().length
    expect(() => mergeClip(target, source, 'burpee')).toThrow(/burpee/)
    expect(target.getRoot().listAnimations()).toHaveLength(1)
    expect(target.getRoot().listAccessors()).toHaveLength(before)
  })
})
