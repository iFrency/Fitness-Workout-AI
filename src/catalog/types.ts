import { z } from 'zod'

export const PARTS = ['肩颈', '上肢', '胸背', '腰腹', '臀腿', '全身'] as const
export type Part = (typeof PARTS)[number]
export type SegmentType = 'warmup' | 'main' | 'stretch'
export type Level = 1 | 2 | 3
export type Pool = 'shape' | 'dance'
export type DanceTier = 1 | 2 | 3

export const ExerciseSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  clip: z.string().min(1),
  clipSeconds: z.number().positive(),
  parts: z.array(z.enum(PARTS)).min(1),
  type: z.enum(['warmup', 'main', 'stretch']),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  impact: z.enum(['low', 'high']),
  beatsPerRep: z.number().int().min(1),
  defaultReps: z.number().int().min(4),
  sided: z.boolean(),
  cues: z.array(z.string().min(1)).min(1),
  caution: z.string(),
  pools: z.array(z.enum(['shape', 'dance'])).min(1).default(['shape']),
  danceTier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
}).superRefine((ex, ctx) => {
  const isDance = ex.pools.includes('dance')
  if (isDance && ex.danceTier === undefined) {
    ctx.addIssue({ code: 'custom', path: ['danceTier'], message: 'danceTier 必填 (dance pool)' })
  }
  if (!isDance && ex.danceTier !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['danceTier'], message: 'danceTier 仅限 dance pool' })
  }
  if (isDance && ex.sided) {
    ctx.addIssue({ code: 'custom', path: ['sided'], message: 'dance 动作不能 sided' })
  }
})

export type Exercise = z.infer<typeof ExerciseSchema>

export class CatalogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CatalogError'
  }
}

function labelOf(item: unknown, index: number): string {
  if (item && typeof item === 'object' && 'id' in item && typeof item.id === 'string') {
    return item.id
  }
  return `#${index}`
}

export function parseCatalog(data: unknown): readonly Exercise[] {
  if (!Array.isArray(data)) throw new CatalogError('动作库格式错误: 应为数组')
  const seen = new Set<string>()
  return data.map((item: unknown, index) => {
    const result = ExerciseSchema.safeParse(item)
    if (!result.success) {
      const detail = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      throw new CatalogError(`动作 ${labelOf(item, index)} 格式错误: ${detail}`)
    }
    if (seen.has(result.data.id)) throw new CatalogError(`动作 id 重复: ${result.data.id}`)
    seen.add(result.data.id)
    return result.data
  })
}
