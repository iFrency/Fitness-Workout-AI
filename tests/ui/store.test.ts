import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { parseCatalog } from '../../src/catalog/types'
import { danceCandidates, refOfItem } from '../../src/dance/editRoutine'
import { generatePlan } from '../../src/planner/generatePlan'
import { TrainingSession } from '../../src/player/session'
import { buildTimeline } from '../../src/player/timeline'
import { DEFAULT_SETTINGS, loadProgress, saveProgress } from '../../src/storage/storage'
import { resumeSession } from '../../src/ui/audio'
import { useAppStore } from '../../src/ui/store'
import { fixtureCatalog } from '../fixtures/catalog'

const plan = generatePlan({ mode: 'shape', parts: ['全身'], minutes: 10, level: 2 }, fixtureCatalog, 1)
const steps = buildTimeline(plan)

function startedSession() {
  let t = 0
  const s = new TrainingSession(steps, { now: () => t })
  s.start()
  return { s, advance: (dt: number) => { t += dt } }
}

beforeEach(() => useAppStore.setState({ plan, catalog: fixtureCatalog, settings: { ...DEFAULT_SETTINGS, useUserMusic: true } }))

it('quitting mid-workout records unreached exercises as not completed', async () => {
  const { s, advance } = startedSession()
  const firstWork = steps.find(x => x.kind === 'work')!
  advance(firstWork.end + 0.1)
  await useAppStore.getState().finishTraining(s, steps)
  const { record } = useAppStore.getState().lastResult!
  expect(record.completedItems[0]).toBe(true)
  expect(record.completedItems.slice(1).every(c => !c)).toBe(true)
  expect(useAppStore.getState().page).toBe('done')
})

it('offers a recent saved workout and resumes it on the training page', async () => {
  await saveProgress({ plan, time: 50, skipped: [], savedAt: new Date().toISOString() })
  await useAppStore.getState().checkSavedProgress()
  expect(useAppStore.getState().savedProgress?.time).toBe(50)
  useAppStore.getState().resumeSavedProgress()
  const s = useAppStore.getState()
  expect(s.page).toBe('training')
  expect(s.plan).toEqual(plan)
  expect(s.resumeFrom?.time).toBe(50)
})

it('ignores saved progress older than the resume window', async () => {
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  await saveProgress({ plan, time: 50, skipped: [], savedAt: old })
  useAppStore.setState({ savedProgress: null })
  await useAppStore.getState().checkSavedProgress()
  expect(useAppStore.getState().savedProgress).toBeNull()
})

it('finishing a workout clears saved progress', async () => {
  await saveProgress({ plan, time: 50, skipped: [], savedAt: new Date().toISOString() })
  const { s } = startedSession()
  await useAppStore.getState().finishTraining(s, steps)
  expect(await loadProgress()).toBeNull()
})

it('a music decode failure switches back to built-in music (Review Focus 5)', () => {
  useAppStore.getState().reportMusicDecodeFailure()
  expect(useAppStore.getState().settings.useUserMusic).toBe(false)
})

it('resuming re-unlocks audio before the session continues', () => {
  const { s } = startedSession()
  s.pause()
  const unlock = vi.fn().mockResolvedValue(undefined)
  resumeSession(s, unlock)
  expect(unlock).toHaveBeenCalledTimes(1)
  expect(s.isPaused()).toBe(false)
})

describe('dance mode', () => {
  const danceCatalog = parseCatalog(JSON.parse(readFileSync('public/assets/catalog/exercises.json', 'utf8')))
  const setup = () => useAppStore.setState({
    catalog: danceCatalog, plan: null, page: 'home',
    settings: { ...DEFAULT_SETTINGS, homeMode: 'dance' },
    danceInput: { mode: 'dance', minutes: 15, level: 2, quiet: false },
  })

  it('generate in dance mode yields a plan with routine and dance items', () => {
    setup()
    useAppStore.getState().generate()
    const s = useAppStore.getState()
    expect(s.page).toBe('preview')
    expect(s.plan?.routine).toBeDefined()
    expect(s.plan?.items.some(i => i.dance)).toBe(true)
  })

  it('setDanceInput({ level: 1 }) forces quiet', () => {
    setup()
    useAppStore.getState().setDanceInput({ level: 1 })
    expect(useAppStore.getState().danceInput.quiet).toBe(true)
  })

  it('replaceDance updates every item of that move', () => {
    setup()
    useAppStore.getState().generate()
    const plan = useAppStore.getState().plan!
    const ref = { part: 'block', block: 0, slot: 0 } as const
    const oldId = plan.routine!.blocks[0].moves[0]
    const next = danceCandidates(plan.routine!, ref, danceCatalog)[0]
    useAppStore.getState().replaceDance(ref, next)
    const after = useAppStore.getState().plan!
    expect(after.routine!.blocks[0].moves[0]).toBe(next.id)
    expect(after.items.some(i => i.exerciseId === oldId && i.dance?.block === 1)).toBe(false)
    const idxs = after.items.map((_, i) => i).filter(i => { const r = refOfItem(after, i); return r?.part === 'block' && r.block === 0 && r.slot === 0 })
    expect(idxs.length).toBeGreaterThan(0)
    expect(idxs.every(i => after.items[i].exerciseId === next.id)).toBe(true)
  })

  it('regenerate keeps dance mode', () => {
    setup()
    useAppStore.getState().generate()
    const before = useAppStore.getState().plan!
    useAppStore.getState().regenerate()
    const after = useAppStore.getState().plan!
    expect(after.input.mode).toBe('dance')
    expect(after.routine!.seed).toBe(before.routine!.seed + 1)
  })
})
