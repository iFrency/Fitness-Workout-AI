import { useMemo, useState } from 'react'
import type { Exercise, SegmentType } from '../../catalog/types'
import { replacementCandidates } from '../../planner/editPlan'
import { itemActualSeconds } from '../../planner/generatePlan'
import type { Plan } from '../../planner/types'
import { DancePreview } from '../components/DancePreview'
import { getAudio } from '../audio'
import { SEGMENT_LABELS, formatDuration, secondsLabel } from '../format'
import { useAppStore } from '../store'

interface Group {
  readonly key: string
  readonly title: string
  readonly segment: SegmentType
  readonly round: number
}

/** Warmup, then main split into rounds when it repeats, then stretch. */
function groupsOf(plan: Plan): Group[] {
  const mains = Array.from({ length: plan.rounds }, (_, k): Group => ({
    key: `main-${k + 1}`,
    title: plan.rounds > 1 ? `${SEGMENT_LABELS.main} · 第 ${k + 1} 轮` : SEGMENT_LABELS.main,
    segment: 'main',
    round: k + 1,
  }))
  return [
    { key: 'warmup', title: SEGMENT_LABELS.warmup, segment: 'warmup', round: 1 },
    ...mains,
    { key: 'stretch', title: SEGMENT_LABELS.stretch, segment: 'stretch', round: 1 },
  ]
}

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
      {plan.routine ? <DancePreview plan={plan} catalog={catalog} /> : groupsOf(plan).map(group => (
        <section key={group.key}>
          <h2>{group.title}</h2>
          <ul className="items">
            {plan.items.map((item, index) => {
              if (item.segment !== group.segment || item.round !== group.round) return null
              const ex = byId.get(item.exerciseId)!
              const candidates = replacing === index ? replacementCandidates(plan, index, catalog) : []
              return (
                <li key={`${item.exerciseId}-${index}`}>
                  <div className="row">
                    <div>
                      <strong>{ex.name}</strong>
                      <span className="meta">{secondsLabel(itemActualSeconds(item) / (item.sided ? 2 : 1), item.sided)}</span>
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
