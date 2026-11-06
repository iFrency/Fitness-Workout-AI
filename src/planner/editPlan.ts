import type { Exercise } from '../catalog/types'
import { computeTotal, eligible } from './generatePlan'
import { MIN_REPS, fitBeats, itemSeconds } from './timing'
import type { Plan, PlanItem } from './types'

function sharesPartOrFullBody(a: Exercise, b: Exercise): boolean {
  if (a.parts.includes('全身') || b.parts.includes('全身')) return true
  return a.parts.some(p => b.parts.includes(p))
}

function withItems(plan: Plan, items: readonly PlanItem[]): Plan {
  return { ...plan, items, totalSeconds: computeTotal(items), shortfallSeconds: 0 }
}

export function replacementCandidates(plan: Plan, index: number, catalog: readonly Exercise[]): readonly Exercise[] {
  const item = plan.items[index]
  const original = catalog.find(e => e.id === item.exerciseId)
  if (!original) return []
  const inPlan = new Set(plan.items.map(i => i.exerciseId))
  return catalog.filter(e =>
    e.type === item.segment &&
    !inPlan.has(e.id) &&
    sharesPartOrFullBody(e, original) &&
    eligible(e, plan.input) &&
    fitBeats(e.clipSeconds, e.beatsPerRep, item.bpm) !== null,
  )
}

export function replaceItem(plan: Plan, index: number, exercise: Exercise): Plan {
  const old = plan.items[index]
  const fit = fitBeats(exercise.clipSeconds, exercise.beatsPerRep, old.bpm)
  if (!fit) throw new Error('该动作无法匹配当前节拍')
  const oldSeconds = itemSeconds(old.reps, old.beatsPerRep, old.bpm, old.sided)
  const perRep = itemSeconds(1, fit.beatsPerRep, old.bpm, exercise.sided)
  const reps = Math.min(exercise.defaultReps * 2, Math.max(MIN_REPS, Math.round(oldSeconds / perRep)))
  const next: PlanItem = {
    ...old, exerciseId: exercise.id, reps, beatsPerRep: fit.beatsPerRep, timeScale: fit.timeScale, sided: exercise.sided,
  }
  return withItems(plan, plan.items.map((it, i) => (i === index ? next : it)))
}

export function removeItem(plan: Plan, index: number): Plan {
  if (plan.items.length <= 1) throw new Error('至少保留一个动作')
  const rest = plan.items.filter((_, i) => i !== index)
  const items = rest.map((it, i) => (i === 0 ? { ...it, restBeforeSeconds: 0 } : it))
  return withItems(plan, items)
}
