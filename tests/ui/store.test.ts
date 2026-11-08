import 'fake-indexeddb/auto'
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
