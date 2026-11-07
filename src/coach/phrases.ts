import type { Exercise } from '../catalog/types'

/** Single source of every spoken line: the app schedules these ids, scripts/gen-voice.ts records them. */

export const FIXED_PHRASES: Readonly<Record<string, string>> = {
  ready: '准备好了吗？',
  start: '开始！',
  switch: '换边！',
  'round-2': '第二轮！来！',
  'round-3': '最后一轮，冲！',
  finish: '全部练完！今天的你超魔性！',
  n1: '一，',
  n2: '二！',
  n3: '三！',
  n4: '四！',
  n5: '五，',
}

const POOL_LINES = {
  half: [
    '一半啦！腿还在吗？',
    '过半了，脂肪正在哭！',
    '稳住，你比昨天的自己帅！',
    '一半了，汗水是脂肪的眼泪！',
    '别停！音乐都替你使劲了！',
    '过半啦，今天的你闪闪发光！',
    '坚持一下，晚饭可以多吃一口！',
    '一半了，动作标准比速度重要！',
  ],
  last10: [
    '最后十秒，撑住别跪！',
    '坚持住，冠军都是这样熬过来的！',
    '最后十秒，咬咬牙就过去了！',
    '马上就好，别让前面的白练！',
    '最后十秒，把力气全用上！',
    '快了快了，胜利就在眼前！',
  ],
  done: [
    '漂亮！这一组归你了！',
    '收工！给自己鼓个掌！',
    '完美！这一组可以发朋友圈了！',
    '好样的！身体在悄悄变好！',
    '搞定！你比你想象的更能打！',
    '帅！下一组继续保持！',
  ],
  rest: ['喘口气～', '喝口水，别跑！', '休息一下，深呼吸～', '抖抖手脚，马上继续！'],
} as const

export type PoolName = keyof typeof POOL_LINES

export const POOLS: Readonly<Record<PoolName, readonly string[]>> = Object.fromEntries(
  (Object.keys(POOL_LINES) as PoolName[]).map(name => [name, POOL_LINES[name].map((_, i) => `${name}-${i + 1}`)]),
) as unknown as Record<PoolName, readonly string[]>

export const POOL_TEXTS: Readonly<Record<string, string>> = Object.fromEntries(
  (Object.keys(POOL_LINES) as PoolName[]).flatMap(name => POOL_LINES[name].map((text, i) => [`${name}-${i + 1}`, text])),
)

export const nextClipId = (exerciseId: string): string => `next-${exerciseId}`
export const cueClipId = (exerciseId: string, k: 0 | 1): string => `cue-${exerciseId}-${k}`

export function exercisePhrases(catalog: readonly Exercise[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of catalog) {
    out[nextClipId(e.id)] = `下一个，${e.name}`
    out[cueClipId(e.id, 0)] = e.cues[0]
    const second = e.cues[1] ?? e.caution
    if (second) out[cueClipId(e.id, 1)] = second
  }
  return out
}

export function allPhrases(catalog: readonly Exercise[]): Record<string, string> {
  return { ...FIXED_PHRASES, ...POOL_TEXTS, ...exercisePhrases(catalog) }
}
