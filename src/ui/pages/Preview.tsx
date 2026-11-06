import { useMemo, useState } from 'react'
import type { Exercise, SegmentType } from '../../catalog/types'
import { replacementCandidates } from '../../planner/editPlan'
import { getAudio } from '../audio'
import { SEGMENT_LABELS, formatDuration, repsLabel } from '../format'
import { useAppStore } from '../store'

const SEGMENTS: readonly SegmentType[] = ['warmup', 'main', 'stretch']

export function Preview() {
  const plan = useAppStore(s => s.plan)
  const catalog = useAppStore(s => s.catalog)
  const { regenerate, replace, remove, startTraining, go } = useAppStore.getState()
  const [replacing, setReplacing] = useState<number | null>(null)
  const byId = useMemo(() => new Map((catalog ?? []).map(e => [e.id, e])), [catalog])
  if (!plan || !catalog) return null

  const onStart = () => {
    void getAudio().engine.unlock().catch(err => console.warn('音频解锁失败', err))
    startTraining()
  }
  const onPick = (index: number, exercise: Exercise) => {
    replace(index, exercise)
    setReplacing(null)
  }

  return (
    <main className="page preview">
      <header className="topbar">
        <button type="button" className="ghost" onClick={() => go('home')}>返回</button>
        <h1>预计 {formatDuration(plan.totalSeconds)}</h1>
      </header>
      {plan.shortfallSeconds > 0 && (
        <p className="notice">可选动作不足，本方案约 {formatDuration(plan.totalSeconds)}。可以增加部位或缩短时长。</p>
      )}
      {SEGMENTS.map(segment => (
        <section key={segment}>
          <h2>{SEGMENT_LABELS[segment]}</h2>
          <ul className="items">
            {plan.items.map((item, index) => {
              if (item.segment !== segment) return null
              const ex = byId.get(item.exerciseId)!
              const candidates = replacing === index ? replacementCandidates(plan, index, catalog) : []
              return (
                <li key={`${item.exerciseId}-${index}`}>
                  <div className="row">
                    <div>
                      <strong>{ex.name}</strong>
                      <span className="meta">{repsLabel(item.reps, item.sided)}</span>
                      {ex.caution && <p className="caution">{ex.caution}</p>}
                    </div>
                    <div className="actions">
                      <button type="button" disabled={replacementCandidates(plan, index, catalog).length === 0}
                        onClick={() => setReplacing(replacing === index ? null : index)}>替换</button>
                      <button type="button" disabled={plan.items.length <= 1} onClick={() => remove(index)}>删除</button>
                    </div>
                  </div>
                  {replacing === index && (
                    <div className="candidates">
                      {candidates.map(c => <button key={c.id} type="button" onClick={() => onPick(index, c)}>{c.name}</button>)}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      <footer className="bottombar">
        <button type="button" onClick={regenerate}>换一套</button>
        <button type="button" className="primary" onClick={onStart}>开始训练</button>
      </footer>
    </main>
  )
}
