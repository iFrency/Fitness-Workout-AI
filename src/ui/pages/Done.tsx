import { formatDuration, modeTitle } from '../format'
import { useAppStore } from '../store'

export function Done() {
  const result = useAppStore(s => s.lastResult)
  const go = useAppStore(s => s.go)
  if (!result) return null
  const { record, saved } = result
  const completed = record.completedItems.filter(Boolean).length
  return (
    <main className="page done">
      <h1>练完啦</h1>
      <h2 className="mode-title">{modeTitle(record.plan)}</h2>
      <p className="big-number">{formatDuration(record.actualSeconds)}</p>
      <p>完成 {completed} / {record.completedItems.length} 个动作</p>
      {!saved && <p className="notice">本次记录无法保存</p>}
      <button type="button" className="primary big" onClick={() => go('home')}>再练一次</button>
    </main>
  )
}
