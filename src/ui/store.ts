import { create } from 'zustand'
import { loadCatalog } from '../catalog/loadCatalog'
import type { Exercise } from '../catalog/types'
import { removeItem, replaceItem } from '../planner/editPlan'
import { generatePlan } from '../planner/generatePlan'
import type { Plan, ShapeInput } from '../planner/types'
import type { TrainingSession } from '../player/session'
import type { Step } from '../player/timeline'
import {
  DEFAULT_SETTINGS, appendRecord, clearProgress, loadProgress, loadSettings, saveSettings,
  type Settings, type TrainingProgress, type WorkoutRecord,
} from '../storage/storage'

/** Saved progress older than this is treated as abandoned. */
const RESUME_WINDOW_MS = 2 * 60 * 60 * 1000

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
  readonly input: ShapeInput
  readonly plan: Plan | null
  readonly lastResult: LastResult | null
  /** An unfinished workout found at start-up, offered on the home page. */
  readonly savedProgress: TrainingProgress | null
  /** The saved position the training page should restore instead of starting from zero. */
  readonly resumeFrom: TrainingProgress | null
  boot(): Promise<void>
  checkSavedProgress(): Promise<void>
  resumeSavedProgress(): void
  discardSavedProgress(): void
  setInput(patch: Partial<ShapeInput>): void
  generate(): void
  regenerate(): void
  replace(index: number, exercise: Exercise): void
  remove(index: number): void
  startTraining(): void
  finishTraining(session: TrainingSession, steps: readonly Step[]): Promise<void>
  reportMusicDecodeFailure(): void
  updateSettings(patch: Partial<Settings>): void
  go(page: Page): void
}

export const useAppStore = create<AppState>((set, get) => ({
  page: 'home',
  catalog: null,
  loadError: null,
  settings: DEFAULT_SETTINGS,
  input: { mode: 'shape', parts: [], minutes: 10, level: 1 },
  plan: null,
  lastResult: null,
  savedProgress: null,
  resumeFrom: null,

  async checkSavedProgress() {
    const progress = await loadProgress()
    const fresh = progress !== null && Date.now() - Date.parse(progress.savedAt) < RESUME_WINDOW_MS
    set({ savedProgress: fresh ? progress : null })
  },
  resumeSavedProgress() {
    const { savedProgress } = get()
    if (savedProgress) set({ plan: savedProgress.plan, resumeFrom: savedProgress, savedProgress: null, page: 'training' })
  },
  discardSavedProgress() {
    set({ savedProgress: null })
    void clearProgress()
  },

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
    if (plan && catalog && plan.input.mode === 'shape') set({ plan: generatePlan(plan.input, catalog, plan.seed + 1) })
  },
  replace(index, exercise) {
    const { plan } = get()
    if (plan) set({ plan: replaceItem(plan, index, exercise) })
  },
  remove(index) {
    const { plan } = get()
    if (plan && plan.items.length > 1) set({ plan: removeItem(plan, index) })
  },
  startTraining: () => set({ page: 'training', resumeFrom: null }),
  async finishTraining(session, steps) {
    const { plan } = get()
    if (!plan) return
    const now = session.time()
    const reached = (i: number) => steps.filter(s => s.kind === 'work' && s.itemIndex === i).every(s => s.end <= now + 1e-6)
    const record: WorkoutRecord = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      plan,
      completedItems: plan.items.map((_, i) => reached(i) && !session.skippedItems().has(i)),
      actualSeconds: session.activeSeconds(),
    }
    const result = await appendRecord(record)
    await clearProgress()
    set({ lastResult: { record, saved: result.ok }, page: 'done', resumeFrom: null })
  },
  reportMusicDecodeFailure() {
    get().updateSettings({ useUserMusic: false })
  },
  updateSettings(patch) {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    void saveSettings(settings)
  },
  go: page => set({ page }),
}))
