import type { Exercise, Level, Part, SegmentType } from '../../src/catalog/types'

export function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'sample',
    name: '示例动作',
    clip: 'Sample',
    clipSeconds: 2.4,
    parts: ['腰腹'],
    type: 'main',
    level: 1,
    impact: 'low',
    beatsPerRep: 4,
    defaultReps: 8,
    sided: false,
    cues: ['保持呼吸'],
    caution: '',
    pools: ['shape'],
    ...overrides,
  }
}

const BODY_PARTS: readonly { part: Part; slug: string }[] = [
  { part: '肩颈', slug: 'neck' },
  { part: '上肢', slug: 'arm' },
  { part: '胸背', slug: 'chest' },
  { part: '腰腹', slug: 'core' },
  { part: '臀腿', slug: 'leg' },
]

interface Spec { slug: string; part: Part; type: SegmentType; level: Level; impact?: 'low' | 'high' }

function specs(): Spec[] {
  const list: Spec[] = []
  for (const { part, slug } of BODY_PARTS) {
    for (const level of [1, 2, 3] as const) {
      list.push({ slug: `${slug}-main-${level}a`, part, type: 'main', level })
      list.push({ slug: `${slug}-main-${level}b`, part, type: 'main', level })
    }
    list.push({ slug: `${slug}-warmup`, part, type: 'warmup', level: 1 })
    list.push({ slug: `${slug}-stretch`, part, type: 'stretch', level: 1 })
  }
  list.push({ slug: 'full-warmup-a', part: '全身', type: 'warmup', level: 1 })
  list.push({ slug: 'full-warmup-b', part: '全身', type: 'warmup', level: 1 })
  list.push({ slug: 'full-stretch-a', part: '全身', type: 'stretch', level: 1 })
  list.push({ slug: 'full-stretch-b', part: '全身', type: 'stretch', level: 1 })
  list.push({ slug: 'full-stretch-c', part: '全身', type: 'stretch', level: 1 })
  list.push({ slug: 'jumping-jack', part: '全身', type: 'main', level: 2, impact: 'high' })
  return list
}

export const fixtureCatalog: readonly Exercise[] = specs().map((s, i) =>
  makeExercise({
    id: s.slug,
    name: s.slug,
    clip: `Clip_${s.slug}`,
    parts: [s.part],
    type: s.type,
    level: s.level,
    impact: s.impact ?? 'low',
    sided: i % 2 === 1,
  }),
)
