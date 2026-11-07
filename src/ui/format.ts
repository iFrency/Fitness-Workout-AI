export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export const LEVEL_LABELS = { 1: '入门', 2: '进阶', 3: '挑战' } as const
export const SEGMENT_LABELS = { warmup: '热身', main: '主训', stretch: '拉伸' } as const

export function secondsLabel(seconds: number, sided: boolean): string {
  const s = Math.round(seconds)
  return sided ? `左右各 ${s} 秒` : `${s} 秒`
}
