import { create } from 'zustand'
import { loadCatalog } from '../catalog/loadCatalog'
import type { Exercise } from '../catalog/types'
import { compileRoutine } from '../dance/compileRoutine'
import { replaceMove } from '../dance/editRoutine'
import { generateRoutine } from '../dance/generateRoutine'
import type { DanceInput, MoveRef } from '../dance/types'
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
  readonly shapeInput: ShapeInput
  readonly danceInput: DanceInput
  /** The user's last explicit quiet choice, restored when leaving level 1. */
  readonly quietPref: boolean
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
  setShapeInput(patch: Partial<ShapeInput>): void
  setDanceInput(patch: Partial<DanceInput>): void
  generate(): void
  regenerate(): void
  replace(index: number, exercise: Exercise): void
  replaceDance(ref: MoveRef, exercise: Exercise): void
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
  shapeInput: { mode: 'shape', parts: [], minutes: 10, level: 1 },
  danceInput: { mode: 'dance', minutes: 15, level: 1, quiet: true },
  quietPref: true,
  plan: null,
  lastResult: null,
  savedProgress: null,
  resumeFrom: null,

  async checkSavedProgress() {
    const progress = await loadProgress()
    let fresh = progress !== null && Date.now() - Date.parse(progress.savedAt) < RESUME_WINDOW_MS
    const { catalog } = get()
    if (fresh && progress && catalog) {
      const ids = new Set(catalog.map(e => e.id))
      if (progress.plan.items.some(i => !ids.has(i.exerciseId))) {
        console.warn('已保存的训练进度包含未知动作，已丢弃')
        void clearProgress()
        fresh = false
      }
    }
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
  setShapeInput: patch => set(s => ({ shapeInput: { ...s.shapeInput, ...patch } })),
  setDanceInput: patch => set(s => {
    const next = { ...s.danceInput, ...patch }
    const pref = patch.quiet !== undefined && next.level !== 1 ? patch.quiet : s.quietPref
    const leaving = s.danceInput.level === 1 && next.level !== 1 && patch.quiet === undefined
    const quiet = next.level === 1 ? true : leaving ? pref : next.quiet
    return { quietPref: pref, danceInput: { ...next, quiet } }
  }),
  generate() {
    const { shapeInput, danceInput, settings, catalog } = get()
    if (!catalog) return
    const seed = Date.now() % 2 ** 31
    const plan = settings.homeMode === 'dance'
      ? compileRoutine(generateRoutine(danceInput, catalog, seed), catalog)
      : generatePlan(shapeInput, catalog, seed)
    set({ plan, page: 'preview' })
  },
  regenerate() {
    const { plan, catalog } = get()
    if (!plan || !catalog) return
    if (plan.input.mode === 'shape') set({ plan: generatePlan(plan.input, catalog, plan.seed + 1) })
    else if (plan.routine) set({ plan: compileRoutine(generateRoutine(plan.routine.input, catalog, plan.routine.seed + 1), catalog) })
  },
  replace(index, exercise) {
    const { plan } = get()
    if (plan) set({ plan: replaceItem(plan, index, exercise) })
  },
  replaceDance(ref, exercise) {
    const { plan, catalog } = get()
    if (plan?.routine && catalog) set({ plan: compileRoutine(replaceMove(plan.routine, ref, exercise.id), catalog) })
  },
  remove(index) {
    const { plan } = get()
    if (plan && plan.input.mode === 'shape' && plan.items.length > 1) set({ plan: removeItem(plan, index) })
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
