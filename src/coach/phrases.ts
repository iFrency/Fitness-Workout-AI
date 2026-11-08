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
  n4: '四，',
  n5: '五，',
  c5: '五',
  c6: '六',
  c7: '七',
  c8: '八',
  'dance-start': '跟着节奏，动起来！',
  combo: '好，连起来！',
  'combo-again': '再来一遍！',
  cooldown: '最后放松一下～',
}

/** Beat-count clips spoken on the last four beats of a dance item; kept short so they fit one beat. */
export const COUNT_CLIPS = ['c5', 'c6', 'c7', 'c8'] as const

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
  'block-up': ['加速！跟上！', '下一段，走起！', '节奏起来了！', '再快一点，你可以！'],
  'peak-jump': ['高潮来了，跳起来！', '全力冲，脂肪在燃烧！', '最燃的部分，跳！', '拼一把，跳高一点！'],
  'peak-quiet': ['高潮来了，动作做大！', '全力冲，脂肪在燃烧！', '最燃的部分，手臂甩起来！', '拼一把，速度加起来！'],
  easy: ['缓一缓，别停！', '调整呼吸，脚步跟上！', '放轻松，节奏还在！', '喘口气，马上再来！'],
  hype: [
    '你在发光！',
    '节奏感满分！',
    '这一跳值一口奶茶！',
    '稳住，越跳越瘦！',
    '太魔性了！',
    '汗水是脂肪的眼泪！',
    '动作标准比速度重要！',
    '整条街最靓的就是你！',
  ],
} as const

export type PoolName = keyof typeof POOL_LINES

export const POOLS: Readonly<Record<PoolName, readonly string[]>> = Object.fromEntries(
  (Object.keys(POOL_LINES) as PoolName[]).map(name => [name, POOL_LINES[name].map((_, i) => `${name}-${i + 1}`)]),
) as unknown as Record<PoolName, readonly string[]>

export const POOL_TEXTS: Readonly<Record<string, string>> = Object.fromEntries(
  (Object.keys(POOL_LINES) as PoolName[]).flatMap(name => POOL_LINES[name].map((text, i) => [`${name}-${i + 1}`, text])),
)

export const nextClipId = (exerciseId: string): string => `next-${exerciseId}`
export const nameClipId = (exerciseId: string): string => `name-${exerciseId}`
export const cueClipId = (exerciseId: string, k: 0 | 1): string => `cue-${exerciseId}-${k}`

/** Quiet mode (and 入门) must not play any clip whose text contains 跳. */
export function quietSafe(clip: string): boolean {
  const text = FIXED_PHRASES[clip] ?? POOL_TEXTS[clip]
  if (text === undefined) throw new Error(`unknown phrase id: ${clip}`)
  return !text.includes('跳')
}

export function exercisePhrases(catalog: readonly Exercise[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of catalog) {
    out[nextClipId(e.id)] = `下一个，${e.name}`
    if (e.pools.includes('dance')) out[nameClipId(e.id)] = e.name
    out[cueClipId(e.id, 0)] = e.cues[0]
    const second = e.cues[1] ?? e.caution
    if (second) out[cueClipId(e.id, 1)] = second
  }
  return out
}

export function allPhrases(catalog: readonly Exercise[]): Record<string, string> {
  return { ...FIXED_PHRASES, ...POOL_TEXTS, ...exercisePhrases(catalog) }
}
