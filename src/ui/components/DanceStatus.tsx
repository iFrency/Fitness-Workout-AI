import { THUMB_URL } from '../../catalog/constants'
import type { Exercise } from '../../catalog/types'
import type { Plan } from '../../planner/types'
import { beatSeconds } from '../../planner/timing'
import type { TrainingState } from '../../player/timeline'

interface DanceStatusProps {
  readonly state: TrainingState
  readonly plan: Plan
  readonly byId: ReadonlyMap<string, Exercise>
}

const DOTS = Array.from({ length: 8 }, (_, i) => i)

function phaseLabel(plan: Plan, itemIndex: number): string {
  const d = plan.items[itemIndex].dance!
  if (d.phase === 'warmup') return '热身'
  if (d.phase === 'cooldown') return '放松'
  return d.phase === 'learn' ? '学动作' : `连起来！第 ${d.pass} 遍`
}

export function DanceStatus({ state, plan, byId }: DanceStatusProps) {
  const { step } = state
  const item = plan.items[step.itemIndex]
  const ex = byId.get(item.exerciseId)!
  const beat = beatSeconds(step.bpm)
  const lit = Math.floor(state.stepElapsed / beat) % 8
  const nextItem = plan.items[step.itemIndex + 1]
  const next = nextItem && state.stepRemaining <= 8 * beat ? byId.get(nextItem.exerciseId) : undefined
  const inBlock = item.dance!.block > 0 && (item.dance!.phase === 'learn' || item.dance!.phase === 'combo')
  return (
    <div className="status dance">
      <div><strong>{ex.name}</strong></div>
      <p className="cue">{phaseLabel(plan, step.itemIndex)}</p>
      {inBlock && <p className="cue">第 {item.dance!.block} / {plan.rounds} 段</p>}
      <div className="beat-dots" data-testid="beat-dots">
        {DOTS.map(i => <span key={i} className="beat-dot" data-testid="beat-dot" data-lit={String(i === lit)} />)}
      </div>
      {next && (
        <div className="next-card">
          <img src={THUMB_URL(next.clip)} alt="" className="thumb" />
          <div><span className="meta">下一个</span><strong>{next.name}</strong></div>
        </div>
      )}
    </div>
  )
}
