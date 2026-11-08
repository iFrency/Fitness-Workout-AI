import { useState } from 'react'
import { PARTS, type Level } from '../../catalog/types'
import { MINUTES_OPTIONS } from '../../planner/timing'
import { Disclaimer } from '../components/Disclaimer'
import { SettingsSheet } from '../components/SettingsSheet'
import { getAudio } from '../audio'
import { LEVEL_LABELS, formatDuration } from '../format'
import { useAppStore } from '../store'

const DANCE_MINUTES = [10, 15, 20, 30] as const
const HOME_TABS = [
  { mode: 'dance', label: '燃脂跳操' },
  { mode: 'shape', label: '部位塑形' },
] as const

export function Home() {
  const input = useAppStore(s => s.shapeInput)
  const setInput = useAppStore(s => s.setShapeInput)
  const danceInput = useAppStore(s => s.danceInput)
  const setDanceInput = useAppStore(s => s.setDanceInput)
  const homeMode = useAppStore(s => s.settings.homeMode)
  const updateSettings = useAppStore(s => s.updateSettings)
  const generate = useAppStore(s => s.generate)
  const accepted = useAppStore(s => s.settings.disclaimerAccepted)
  const saved = useAppStore(s => s.savedProgress)
  const { resumeSavedProgress, discardSavedProgress } = useAppStore.getState()
  const onResume = () => {
    void getAudio().engine.unlock().catch(err => console.warn('音频解锁失败', err))
    resumeSavedProgress()
  }
  const [showSettings, setShowSettings] = useState(false)

  const togglePart = (part: (typeof PARTS)[number]) =>
    setInput({ parts: input.parts.includes(part) ? input.parts.filter(p => p !== part) : [...input.parts, part] })

  return (
    <main className="page home">
      <header className="topbar">
        <h1>魔性健身</h1>
        <button type="button" className="ghost" onClick={() => setShowSettings(true)}>设置</button>
      </header>
      {saved && (
        <section className="notice resume">
          <p>还有一次训练没练完（已练到 {formatDuration(saved.time)}）。</p>
          <div className="actions">
            <button type="button" className="primary" onClick={onResume}>继续上次训练</button>
            <button type="button" onClick={discardSavedProgress}>放弃</button>
          </div>
        </section>
      )}
      <div className="tabs" role="tablist">
        {HOME_TABS.map(t => (
          <button key={t.mode} type="button" role="tab" aria-selected={homeMode === t.mode} onClick={() => updateSettings({ homeMode: t.mode })}>{t.label}</button>
        ))}
      </div>
      {homeMode === 'dance' ? (
        <>
          <section>
            <h2>练多久</h2>
            <div className="chips">
              {DANCE_MINUTES.map(m => (
                <button key={m} type="button" aria-pressed={danceInput.minutes === m} onClick={() => setDanceInput({ minutes: m })}>{m} 分钟</button>
              ))}
            </div>
          </section>
          <section>
            <h2>难度</h2>
            <div className="chips">
              {([1, 2, 3] as Level[]).map(l => (
                <button key={l} type="button" aria-pressed={danceInput.level === l} onClick={() => setDanceInput({ level: l })}>{LEVEL_LABELS[l]}</button>
              ))}
            </div>
          </section>
          <section>
            <label className="switch">
              <input
                type="checkbox"
                checked={danceInput.quiet}
                disabled={danceInput.level === 1}
                onChange={e => setDanceInput({ quiet: e.target.checked })}
              />
              安静模式（不跳）
            </label>
            <p className="hint">适合办公室和楼下有邻居</p>
          </section>
          <button type="button" className="primary big" onClick={generate}>生成方案</button>
        </>
      ) : (
        <>
        <section>
          <h2>练哪里</h2>
          <div className="chips">
            {PARTS.map(part => (
              <button key={part} type="button" aria-pressed={input.parts.includes(part)} onClick={() => togglePart(part)}>{part}</button>
            ))}
          </div>
        </section>
        <section>
          <h2>练多久</h2>
          <div className="chips">
            {MINUTES_OPTIONS.map(m => (
              <button key={m} type="button" aria-pressed={input.minutes === m} onClick={() => setInput({ minutes: m })}>{m} 分钟</button>
            ))}
          </div>
        </section>
        <section>
          <h2>难度</h2>
          <div className="chips">
            {([1, 2, 3] as Level[]).map(l => (
              <button key={l} type="button" aria-pressed={input.level === l} onClick={() => setInput({ level: l })}>{LEVEL_LABELS[l]}</button>
            ))}
          </div>
        </section>
        <button type="button" className="primary big" disabled={input.parts.length === 0} onClick={generate}>生成方案</button>
        </>
      )}
      {!accepted && <Disclaimer />}
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
    </main>
  )
}
