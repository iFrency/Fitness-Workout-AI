import 'fake-indexeddb/auto'
import * as idb from 'idb-keyval'
import { generatePlan } from '../../src/planner/generatePlan'
import {
  DEFAULT_SETTINGS, appendRecord, clearProgress, listRecords, loadProgress, loadSettings, loadUserMusic,
  saveProgress, saveSettings, saveUserMusic, type TrainingProgress,
  type WorkoutRecord,
} from '../../src/storage/storage'
import { fixtureCatalog } from '../fixtures/catalog'

vi.mock('idb-keyval', async importOriginal => {
  const actual = await importOriginal<typeof import('idb-keyval')>()
  return { ...actual, get: vi.fn(actual.get), set: vi.fn(actual.set) }
})

const plan = generatePlan({ mode: 'shape', parts: ['腰腹'], minutes: 5, level: 1 }, fixtureCatalog, 1)
const rec = (date: string): WorkoutRecord => ({
  id: date, date, plan, completedItems: plan.items.map(() => true), actualSeconds: 300,
})

it('returns defaults before anything is saved', async () => {
  expect(await loadSettings()).toEqual(DEFAULT_SETTINGS)
})

it('round-trips settings and fills defaults', async () => {
  await saveSettings({ ...DEFAULT_SETTINGS, volume: 0.3 })
  expect(await loadSettings()).toEqual({ ...DEFAULT_SETTINGS, volume: 0.3 })
})

it('lists records newest first', async () => {
  await appendRecord(rec('2026-11-01T10:00:00.000Z'))
  await appendRecord(rec('2026-11-05T10:00:00.000Z'))
  const r = await listRecords()
  expect(r.ok && r.value.map(x => x.date)).toEqual(['2026-11-05T10:00:00.000Z', '2026-11-01T10:00:00.000Z'])
})

it('round-trips user music', async () => {
  await saveUserMusic(new Blob(['abc']), 'song.mp3')
  const m = await loadUserMusic()
  expect(m?.name).toBe('song.mp3')
})

it('saves, loads and clears training progress', async () => {
  const snapshot = { plan, time: 42.5, skipped: [2], savedAt: '2026-11-07T08:00:00.000Z' }
  await saveProgress(snapshot)
  expect(await loadProgress()).toEqual(snapshot)
  await clearProgress()
  expect(await loadProgress()).toBeNull()
})

it('reports failure instead of throwing when IndexedDB is unavailable', async () => {
  vi.mocked(idb.set).mockRejectedValueOnce(new Error('blocked'))
  expect(await appendRecord(rec('2026-11-06T00:00:00.000Z'))).toEqual({ ok: false })
  vi.mocked(idb.get).mockRejectedValueOnce(new Error('blocked'))
  expect(await loadSettings()).toEqual(DEFAULT_SETTINGS)
})

const legacyPlan = (): unknown => {
  const { mode: _mode, ...input } = plan.input
  return { ...plan, input }
}

it('loadSettings defaults homeMode to dance', async () => {
  expect(DEFAULT_SETTINGS.homeMode).toBe('dance')
  expect((await loadSettings()).homeMode).toBe('dance')
})

it('loadProgress returns a legacy plan with input.mode shape', async () => {
  const legacy = { plan: legacyPlan(), time: 5, skipped: [], savedAt: '2026-11-01T10:00:00.000Z' }
  await idb.set('progress', legacy, idb.createStore('moxing-fitness', 'kv'))
  const loaded: TrainingProgress | null = await loadProgress()
  expect(loaded?.plan.input.mode).toBe('shape')
  expect(loaded?.plan.items).toEqual(plan.items)
  expect((legacy.plan as { input: object }).input).not.toHaveProperty('mode')
})

it('listRecords normalizes legacy records', async () => {
  await idb.set('records', [{ ...rec('2026-11-01T10:00:00.000Z'), plan: legacyPlan() }], idb.createStore('moxing-fitness', 'kv'))
  const r = await listRecords()
  expect(r.ok && r.value[0].plan.input.mode).toBe('shape')
})
