import * as idb from 'idb-keyval'
import type { StyleId } from '../beat/patterns'
import type { Plan, ShapeInput } from '../planner/types'

export interface Settings {
  readonly mainStyle: StyleId
  readonly volume: number
  readonly mirror: boolean
  readonly disclaimerAccepted: boolean
  readonly clickWithUserMusic: boolean
  readonly useUserMusic: boolean
  readonly homeMode: 'dance' | 'shape'
}

export const DEFAULT_SETTINGS: Settings = {
  mainStyle: 'guichu',
  volume: 0.8,
  mirror: true,
  disclaimerAccepted: false,
  clickWithUserMusic: false,
  useUserMusic: false,
  homeMode: 'dance',
}

/** Plans stored before the dance mode existed have no input.mode; they are shape plans. */
export function normalizePlan(plan: unknown): Plan {
  const input = (plan as { input?: unknown } | null)?.input
  if (typeof input !== 'object' || input === null) throw new Error('存储的方案格式不正确')
  if ('mode' in input) return plan as Plan
  return { ...(plan as Plan), input: { ...(input as Omit<ShapeInput, 'mode'>), mode: 'shape' } }
}

export interface WorkoutRecord {
  readonly id: string
  readonly date: string
  readonly plan: Plan
  readonly completedItems: readonly boolean[]
  readonly actualSeconds: number
}

export type StoreResult<T> = { ok: true; value: T } | { ok: false }

interface StoredMusic {
  readonly blob: Blob
  readonly name: string
}

let store: idb.UseStore | null = null
const kv = (): idb.UseStore => (store ??= idb.createStore('moxing-fitness', 'kv'))

async function attempt<T>(label: string, fn: () => Promise<T>): Promise<StoreResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (error: unknown) {
    console.error(`本地存储失败: ${label}`, error)
    return { ok: false }
  }
}

export async function loadSettings(): Promise<Settings> {
  const r = await attempt('读取设置', () => idb.get<Partial<Settings>>('settings', kv()))
  return { ...DEFAULT_SETTINGS, ...(r.ok ? r.value : {}) }
}

export function saveSettings(s: Settings): Promise<StoreResult<void>> {
  return attempt('保存设置', () => idb.set('settings', s, kv()))
}

export async function listRecords(): Promise<StoreResult<readonly WorkoutRecord[]>> {
  const r = await attempt('读取记录', () => idb.get<WorkoutRecord[]>('records', kv()))
  if (!r.ok) return r
  const records = (r.value ?? []).map(rec => ({ ...rec, plan: normalizePlan(rec.plan) }))
  return { ok: true, value: records.sort((a, b) => b.date.localeCompare(a.date)) }
}

export async function appendRecord(record: WorkoutRecord): Promise<StoreResult<void>> {
  return attempt('保存记录', async () => {
    const existing = (await idb.get<WorkoutRecord[]>('records', kv())) ?? []
    await idb.set('records', [...existing, record], kv())
  })
}

export interface TrainingProgress {
  readonly plan: Plan
  readonly time: number
  readonly skipped: readonly number[]
  readonly savedAt: string
}

export function saveProgress(progress: TrainingProgress): Promise<StoreResult<void>> {
  return attempt('保存训练进度', () => idb.set('progress', progress, kv()))
}

export async function loadProgress(): Promise<TrainingProgress | null> {
  const r = await attempt('读取训练进度', async () => {
    const stored = await idb.get<TrainingProgress>('progress', kv())
    return stored ? { ...stored, plan: normalizePlan(stored.plan) } : null
  })
  return r.ok ? r.value : null
}

export function clearProgress(): Promise<StoreResult<void>> {
  return attempt('清除训练进度', () => idb.del('progress', kv()))
}

export function saveUserMusic(blob: Blob, name: string): Promise<StoreResult<void>> {
  return attempt('保存自选音乐', () => idb.set('userMusic', { blob, name } satisfies StoredMusic, kv()))
}

export async function loadUserMusic(): Promise<StoredMusic | null> {
  const r = await attempt('读取自选音乐', () => idb.get<StoredMusic>('userMusic', kv()))
  return r.ok ? (r.value ?? null) : null
}
