import { useMemo, useState } from 'react'
import { STYLE_LABELS, type StyleId } from '../../beat/patterns'
import { THUMB_URL } from '../../catalog/constants'
import type { Exercise } from '../../catalog/types'
import type { Plan } from '../../planner/types'
import { stateAt, timelineEnd, type TrainingState } from '../../player/timeline'
import { Stage, type CameraPreset } from '../../stage/Stage'
import { getAudio, resumeSession } from '../audio'
import { useAppStore } from '../store'
import { useTrainingRun } from '../useTrainingRun'

const SIDE_LABEL = { left: '左侧', right: '右侧' } as const

function StatusPanel({ state, plan, byId }: { state: TrainingState; plan: Plan; byId: Map<string, Exercise> }) {
  const ex = byId.get(plan.items[state.step.itemIndex].exerciseId)!
  if (state.step.kind === 'prepare') return <div className="status"><strong>准备</strong><span>{ex.name}</span></div>
  if (state.step.kind === 'rest') {
    return (
      <div className="status rest">
        <strong>休息一下</strong>
        <span>下一个：{ex.name}</span>
        <img src={THUMB_URL(ex.clip)} alt="" className="thumb" />
      </div>
    )
  }
  const side = state.step.side ? `${SIDE_LABEL[state.step.side]} ` : ''
  return (
    <div className="status">
      <strong>{ex.name}</strong>
      <span className="count">{side}第 {state.repIndex + 1} / {state.step.reps} 次</span>
      <p className="cue">{ex.cues[state.repIndex % ex.cues.length]}</p>
      {ex.caution && <p className="caution">{ex.caution}</p>}
    </div>
  )
}

export function Training() {
  const plan = useAppStore(s => s.plan)!
  const catalog = useAppStore(s => s.catalog)!
  const settings = useAppStore(s => s.settings)
  const resumeFrom = useAppStore(s => s.resumeFrom)
  const { finishTraining, updateSettings, reportMusicDecodeFailure } = useAppStore.getState()
  const run = useTrainingRun(plan, catalog, settings, (s, steps) => void finishTraining(s, steps), reportMusicDecodeFailure, resumeFrom)
  const [preset, setPreset] = useState<CameraPreset>('threeQuarter')
  const [, force] = useState(0)
  const byId = useMemo(() => new Map(catalog.map(e => [e.id, e])), [catalog])
  const state = stateAt(run.steps, run.t)
  const { session } = run

  const togglePause = () => {
    if (session.isPaused()) resumeSession(session)
    else session.pause()
    force(n => n + 1)
  }
  const quit = () => {
    if (window.confirm('确定结束本次训练吗？已完成的动作会被记录。')) void finishTraining(session, run.steps)
  }
  const setStyle = (mainStyle: StyleId) => {
    updateSettings({ mainStyle })
    getAudio().engine.setOptions({ mainStyle })
  }
  const setVolume = (volume: number) => {
    updateSettings({ volume })
    getAudio().engine.setVolume(volume)
  }

  return (
    <main className="page training">
      <div className="training-top">
        <div className="progress"><div style={{ width: `${(run.t / timelineEnd(run.steps)) * 100}%` }} /></div>
        <button type="button" className="ghost small" onClick={quit}>结束</button>
      </div>
      <div className="stage">
        <Stage session={session} steps={run.steps} plan={plan} catalog={catalog} mirror={settings.mirror} preset={preset} />
        <div className="camera">
          {(['threeQuarter', 'front', 'side'] as CameraPreset[]).map(p => (
            <button key={p} type="button" aria-pressed={preset === p} onClick={() => setPreset(p)}>
              {{ threeQuarter: '斜侧', front: '正面', side: '侧面' }[p]}
            </button>
          ))}
        </div>
      </div>
      {run.ready ? <StatusPanel state={state} plan={plan} byId={byId} /> : <div className="status"><strong>准备中</strong></div>}
      <div className="controls">
        <button type="button" onClick={() => session.prev()}>上一个</button>
        <button type="button" className="primary" onClick={togglePause}>{session.isPaused() ? '继续' : '暂停'}</button>
        <button type="button" onClick={() => session.skip()}>跳过</button>
      </div>
      <div className="mixer">
        <label>音量<input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={e => setVolume(Number(e.target.value))} /></label>
        <select aria-label="音乐风格" value={settings.mainStyle} onChange={e => setStyle(e.target.value as StyleId)}>
          {(Object.keys(STYLE_LABELS) as StyleId[]).map(id => <option key={id} value={id}>{STYLE_LABELS[id]}</option>)}
        </select>
      </div>
      {run.toast && <p className="toast">{run.toast}</p>}
      {run.backgroundPaused && (
        <button type="button" className="overlay" onClick={run.resumeFromBackground}>已暂停，点击继续</button>
      )}
    </main>
  )
}
