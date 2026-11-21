import { useAppStore } from '../store'

export const DISCLAIMER_TEXT =
  '本应用提供的动作仅供一般健身参考，不构成医疗建议。如有心血管疾病、关节损伤、怀孕或其他健康问题，请先咨询医生。训练中如感到疼痛、头晕或不适，请立即停止。'

export function Disclaimer() {
  const updateSettings = useAppStore(s => s.updateSettings)
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="免责声明">
      <div className="modal-card">
        <h2>开练之前</h2>
        <p>{DISCLAIMER_TEXT}</p>
        <button type="button" className="primary" onClick={() => updateSettings({ disclaimerAccepted: true })}>
          我已了解并同意
        </button>
      </div>
    </div>
  )
}
