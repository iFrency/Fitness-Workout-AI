import { useState } from 'react'
import { PARTS, type Level } from '../../catalog/types'
import { MINUTES_OPTIONS } from '../../planner/timing'
import { Disclaimer } from '../components/Disclaimer'
import { SettingsSheet } from '../components/SettingsSheet'
import { LEVEL_LABELS } from '../format'
import { useAppStore } from '../store'

export function Home() {
  const input = useAppStore(s => s.input)
  const setInput = useAppStore(s => s.setInput)
  const generate = useAppStore(s => s.generate)
  const accepted = useAppStore(s => s.settings.disclaimerAccepted)
  const [showSettings, setShowSettings] = useState(false)

  const togglePart = (part: (typeof PARTS)[number]) =>
    setInput({ parts: input.parts.includes(part) ? input.parts.filter(p => p !== part) : [...input.parts, part] })

  return (
    <main className="page home">
      <header className="topbar">
        <h1>魔性健身</h1>
        <button type="button" className="ghost" onClick={() => setShowSettings(true)}>设置</button>
      </header>
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
      {!accepted && <Disclaimer />}
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
    </main>
  )
}
