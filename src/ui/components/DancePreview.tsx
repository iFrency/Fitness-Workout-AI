import { useState } from 'react'
import type { Exercise } from '../../catalog/types'
import { SLOT_TIERS } from '../../dance/tempo'
import { danceCandidates } from '../../dance/editRoutine'
import type { MoveRef, Routine } from '../../dance/types'
import { itemActualSeconds } from '../../planner/generatePlan'
import type { Plan } from '../../planner/types'
import { TIER_LABELS, formatDuration } from '../format'
import { useAppStore } from '../store'

interface DancePreviewProps {
  readonly plan: Plan
  readonly catalog: readonly Exercise[]
}

interface Row {
  readonly key: string
  readonly id: string
  readonly badge: string
  readonly ref: MoveRef | null
}

interface Section {
  readonly key: string
  readonly title: string
  readonly rows: readonly Row[]
}

function sectionsOf(plan: Plan, routine: Routine): Section[] {
  const seconds = (block: number) =>
    plan.items.filter(i => i.dance?.block === block).reduce((sum, i) => sum + itemActualSeconds(i), 0)
  return [
    {
      key: 'warmup', title: '热身',
      rows: routine.warmup.map((id, index) => ({ key: `w${index}`, id, badge: '热身', ref: { part: 'warmup', index } })),
    },
    ...routine.blocks.map((b, block): Section => ({
      key: `b${block}`,
      title: `第 ${block + 1} 段 · ${b.bpm} BPM · ${formatDuration(seconds(block + 1))}`,
      rows: b.moves.map((id, slot) => ({
        key: `b${block}-${slot}`, id, badge: TIER_LABELS[SLOT_TIERS[slot]], ref: { part: 'block', block, slot },
      })),
    })),
    {
      key: 'cooldown', title: '放松',
      rows: [
        ...routine.cooldown.map((id, index): Row => ({ key: `c${index}`, id, badge: TIER_LABELS[1], ref: { part: 'cooldown', index } })),
        ...routine.stretch.map((id, index): Row => ({ key: `s${index}`, id, badge: '拉伸', ref: null })),
      ],
    },
  ]
}

export function DancePreview({ plan, catalog }: DancePreviewProps) {
  const replaceDance = useAppStore(s => s.replaceDance)
  const [open, setOpen] = useState<string | null>(null)
  const routine = plan.routine!
  const byId = new Map(catalog.map(e => [e.id, e]))
  return (
    <>
      {sectionsOf(plan, routine).map(section => (
        <section key={section.key}>
          <h2>{section.title}</h2>
          <ul className="items">
            {section.rows.map(row => {
              const candidates = open === row.key && row.ref ? danceCandidates(routine, row.ref, catalog) : []
              const ref = row.ref
              return (
                <li key={row.key}>
                  <div className="row">
                    <div>
                      <strong>{byId.get(row.id)?.name ?? row.id}</strong>
                      <span className="meta tier-badge">{row.badge}</span>
                    </div>
                    {ref && (
                      <div className="actions">
                        <button type="button" disabled={danceCandidates(routine, ref, catalog).length === 0}
                          onClick={() => setOpen(open === row.key ? null : row.key)}>替换</button>
                      </div>
                    )}
                  </div>
                  {open === row.key && (
                    <div className="candidates">
                      {candidates.map(c => (
                        <button key={c.id} type="button" onClick={() => { if (ref) replaceDance(ref, c); setOpen(null) }}>{c.name}</button>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}
