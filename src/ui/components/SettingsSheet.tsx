import { useState, type ChangeEvent } from 'react'
import { STYLE_LABELS, type StyleId } from '../../beat/patterns'
import { useBackHandler } from '../../native/useBackHandler'
import { saveUserMusic } from '../../storage/storage'
import { useAppStore } from '../store'
import { About } from './About'

interface SettingsSheetProps {
  readonly onClose: () => void
}

export function SettingsSheet({ onClose }: SettingsSheetProps) {
  const settings = useAppStore(s => s.settings)
  const update = useAppStore(s => s.updateSettings)
  const [musicNote, setMusicNote] = useState<string | null>(null)
  useBackHandler(onClose)

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const result = await saveUserMusic(file, file.name)
    setMusicNote(result.ok ? `已选择：${file.name}` : '保存失败，本次无法使用这首音乐')
    if (result.ok) update({ useUserMusic: true })
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="设置">
      <div className="modal-card sheet">
        <h2>设置</h2>
        <label className="field">主训音乐风格
          <select value={settings.mainStyle} onChange={e => update({ mainStyle: e.target.value as StyleId })}>
            {(Object.keys(STYLE_LABELS) as StyleId[]).map(id => <option key={id} value={id}>{STYLE_LABELS[id]}</option>)}
          </select>
        </label>
        <label className="field">音量
          <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={e => update({ volume: Number(e.target.value) })} />
        </label>
        <label className="check"><input type="checkbox" checked={settings.mirror} onChange={e => update({ mirror: e.target.checked })} />镜像模式（像照镜子一样跟练）</label>
        <label className="check"><input type="checkbox" checked={settings.useUserMusic} onChange={e => update({ useUserMusic: e.target.checked })} />使用我自己的音乐</label>
        <label className="field">选择音乐文件（只保存在本机）
          <input type="file" accept="audio/*" onChange={e => void onFile(e)} />
        </label>
        {musicNote && <p className="note">{musicNote}</p>}
        <label className="check"><input type="checkbox" checked={settings.clickWithUserMusic} onChange={e => update({ clickWithUserMusic: e.target.checked })} />自选音乐时保留节拍点击音</label>
        <About />
        <button type="button" className="primary" onClick={onClose}>完成</button>
      </div>
    </div>
  )
}
