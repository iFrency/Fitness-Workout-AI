import type { Plan } from '../../planner/types'
import { formatDuration, modeTitle } from '../format'
import { useAppStore } from '../store'

/** Dance plans compile one move into many items, so count distinct moves instead. */
function progressCounts(plan: Plan, completedItems: readonly boolean[]): { done: number; total: number } {
  if (!plan.routine) return { done: completedItems.filter(Boolean).length, total: completedItems.length }
  const all = new Set(plan.items.map(i => i.exerciseId))
  const done = new Set(plan.items.filter((_, i) => completedItems[i]).map(i => i.exerciseId))
  return { done: done.size, total: all.size }
}

export function Done() {
  const result = useAppStore(s => s.lastResult)
  const go = useAppStore(s => s.go)
  if (!result) return null
  const { record, saved } = result
  const counts = progressCounts(record.plan, record.completedItems)
  return (
    <main className="page done">
      <h1>练完啦</h1>
      <h2 className="mode-title">{modeTitle(record.plan)}</h2>
      <p className="big-number">{formatDuration(record.actualSeconds)}</p>
      <p>完成 {counts.done} / {counts.total} 个动作</p>
      {!saved && <p className="notice">本次记录无法保存</p>}
      <button type="button" className="primary big" onClick={() => go('home')}>再练一次</button>
    </main>
  )
}
