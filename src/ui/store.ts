import { create } from 'zustand'
import { loadCatalog } from '../catalog/loadCatalog'
import type { Exercise } from '../catalog/types'
import { removeItem, replaceItem } from '../planner/editPlan'
import { generatePlan } from '../planner/generatePlan'
import type { Plan, PlanInput } from '../planner/types'
import type { TrainingSession } from '../player/session'
import {
  DEFAULT_SETTINGS, appendRecord, loadSettings, saveSettings, type Settings, type WorkoutRecord,
} from '../storage/storage'

export type Page = 'home' | 'preview' | 'training' | 'done'

export interface LastResult {
  readonly record: WorkoutRecord
  readonly saved: boolean
}

interface AppState {
  readonly page: Page
  readonly catalog: readonly Exercise[] | null
  readonly loadError: string | null
  readonly settings: Settings
  readonly input: PlanInput
  readonly plan: Plan | null
  readonly lastResult: LastResult | null
  boot(): Promise<void>
  setInput(patch: Partial<PlanInput>): void
  generate(): void
  regenerate(): void
  replace(index: number, exercise: Exercise): void
  remove(index: number): void
  startTraining(): void
  finishTraining(session: TrainingSession): Promise<void>
  updateSettings(patch: Partial<Settings>): void
  go(page: Page): void
}

export const useAppStore = create<AppState>((set, get) => ({
  page: 'home',
  catalog: null,
  loadError: null,
  settings: DEFAULT_SETTINGS,
  input: { parts: [], minutes: 10, level: 1 },
  plan: null,
  lastResult: null,

  async boot() {
    try {
      const [catalog, settings] = await Promise.all([loadCatalog(), loadSettings()])
      set({ catalog, settings, loadError: null })
    } catch (error: unknown) {
      console.error('启动失败', error)
      set({ loadError: error instanceof Error ? error.message : '动作库加载失败' })
    }
  },
  setInput: patch => set(s => ({ input: { ...s.input, ...patch } })),
  generate() {
    const { input, catalog } = get()
    if (catalog) set({ plan: generatePlan(input, catalog, Date.now() % 2 ** 31), page: 'preview' })
  },
  regenerate() {
    const { plan, catalog } = get()
    if (plan && catalog) set({ plan: generatePlan(plan.input, catalog, plan.seed + 1) })
  },
  replace(index, exercise) {
    const { plan } = get()
    if (plan) set({ plan: replaceItem(plan, index, exercise) })
  },
  remove(index) {
    const { plan } = get()
    if (plan && plan.items.length > 1) set({ plan: removeItem(plan, index) })
  },
  startTraining: () => set({ page: 'training' }),
  async finishTraining(session) {
    const { plan } = get()
    if (!plan) return
    const record: WorkoutRecord = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      plan,
      completedItems: plan.items.map((_, i) => !session.skippedItems().has(i)),
      actualSeconds: session.activeSeconds(),
    }
    const result = await appendRecord(record)
    set({ lastResult: { record, saved: result.ok }, page: 'done' })
  },
  updateSettings(patch) {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    void saveSettings(settings)
  },
  go: page => set({ page }),
}))
