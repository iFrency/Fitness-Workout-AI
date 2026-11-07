import type { Accessor, Document, Node } from '@gltf-transform/core'

/**
 * Copies the animation named clipName from source into target, mapping channels
 * to target nodes by node name. Returns the clip duration in seconds.
 * All checks run before anything is created, so a failure leaves target untouched.
 */
export function mergeClip(target: Document, source: Document, clipName: string): number {
  const srcAnim = source.getRoot().listAnimations().find(a => a.getName() === clipName)
  if (!srcAnim) throw new Error(`源文件里没有名为 ${clipName} 的动画`)
  if (target.getRoot().listAnimations().some(a => a.getName() === clipName)) {
    throw new Error(`目标文件里已经有名为 ${clipName} 的动画`)
  }

  const nodesByName = new Map<string, Node>()
  for (const node of target.getRoot().listNodes()) {
    if (!nodesByName.has(node.getName())) nodesByName.set(node.getName(), node)
  }
  const targets = srcAnim.listChannels().map(channel => {
    const srcNode = channel.getTargetNode()
    const name = srcNode?.getName() ?? ''
    const node = nodesByName.get(name)
    if (!node) throw new Error(`动画 ${clipName} 的通道指向骨骼 ${name}，目标文件里找不到同名节点`)
    return node
  })

  const buffer = target.getRoot().listBuffers()[0] ?? target.createBuffer()
  const copies = new Map<Accessor, Accessor>()
  const copyAccessor = (src: Accessor): Accessor => {
    const existing = copies.get(src)
    if (existing) return existing
    const array = src.getArray()
    if (!array) throw new Error(`动画 ${clipName} 的某个采样器缺少数据`)
    const copy = target.createAccessor()
      .setType(src.getType())
      .setArray(array.slice())
      .setNormalized(src.getNormalized())
      .setBuffer(buffer)
    copies.set(src, copy)
    return copy
  }

  const anim = target.createAnimation(clipName)
  const samplers = new Map<object, ReturnType<Document['createAnimationSampler']>>()
  let duration = 0
  srcAnim.listChannels().forEach((channel, i) => {
    const srcSampler = channel.getSampler()
    if (!srcSampler) throw new Error(`动画 ${clipName} 的某个通道缺少采样器`)
    let sampler = samplers.get(srcSampler)
    if (!sampler) {
      const input = copyAccessor(srcSampler.getInput()!)
      sampler = target.createAnimationSampler()
        .setInput(input)
        .setOutput(copyAccessor(srcSampler.getOutput()!))
        .setInterpolation(srcSampler.getInterpolation())
      samplers.set(srcSampler, sampler)
      duration = Math.max(duration, input.getMax([])[0])
    }
    anim.addSampler(sampler)
    anim.addChannel(target.createAnimationChannel()
      .setTargetNode(targets[i])
      .setTargetPath(channel.getTargetPath()!)
      .setSampler(sampler))
  })
  return duration
}
