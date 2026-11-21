import { z } from 'zod'

export const ReportSchema = z.object({
  id: z.string().min(1),
  missingBones: z.array(z.string()),
  seamMaxAngleDeg: z.number(),
  seamHipsDistance: z.number(),
  minAnkleHeight: z.number(),
  driftAfterFix: z.number(),
  durationSeconds: z.number(),
})

export type ClipReport = z.infer<typeof ReportSchema>

export const LIMITS = {
  seamMaxAngleDeg: 10,
  seamHipsDistance: 0.03,
  minAnkleHeight: 0.03,
  driftAfterFix: 0.05,
  minDuration: 0.5,
  maxDuration: 6,
} as const

export function parseReport(id: string, data: unknown): ClipReport {
  const result = ReportSchema.safeParse(data)
  if (!result.success) {
    const detail = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`动作 ${id} 的报告格式错误: ${detail}`)
  }
  if (result.data.id !== id) {
    throw new Error(`动作 ${id} 的报告格式错误: id: 报告 id 为 ${result.data.id}，应为 ${id}`)
  }
  return result.data
}

export function checkReport(r: ClipReport): string[] {
  const fail = (item: string, actual: string | number, standard: string): string =>
    `动作 ${r.id}：${item} ${actual}，应 ${standard}`

  if (r.missingBones.length > 0) {
    return [fail('缺失骨骼', r.missingBones.join(', '), '为空')]
  }

  const errors: string[] = []
  if (r.seamMaxAngleDeg > LIMITS.seamMaxAngleDeg) {
    errors.push(fail('首尾接缝最大角度差', r.seamMaxAngleDeg, `<= ${LIMITS.seamMaxAngleDeg} 度`))
  }
  if (r.seamHipsDistance > LIMITS.seamHipsDistance) {
    errors.push(fail('首尾接缝髋部距离', r.seamHipsDistance, `<= ${LIMITS.seamHipsDistance}`))
  }
  if (r.minAnkleHeight < LIMITS.minAnkleHeight) {
    errors.push(fail('脚踝最低高度', r.minAnkleHeight, `>= ${LIMITS.minAnkleHeight}`))
  }
  if (r.driftAfterFix > LIMITS.driftAfterFix) {
    errors.push(fail('修正后漂移', r.driftAfterFix, `<= ${LIMITS.driftAfterFix}`))
  }
  if (r.durationSeconds < LIMITS.minDuration || r.durationSeconds > LIMITS.maxDuration) {
    errors.push(
      fail('时长', r.durationSeconds, `在 ${LIMITS.minDuration} 到 ${LIMITS.maxDuration} 秒之间`),
    )
  }
  return errors
}
