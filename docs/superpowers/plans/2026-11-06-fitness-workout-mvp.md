# 魔性健身 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出一个纯前端 PWA：用户选部位、时长、难度后生成训练方案，由 3D 人物按节拍演示，配程序生成的魔性节拍、中文口令，可改用本地音乐，离线可用。

**Architecture:** 所有时间都来自一条"训练时间线"：方案（Plan）先被展开成按秒排好的步骤（Step），之后的节拍事件、音效、口令、3D 动画进度、界面状态都是"时间 t 的纯函数"。时间 t 由 `TrainingSession` 从音频时钟换算得到，并负责暂停、跳过、上一个、倍速。浏览器相关的部分（Web Audio 播放、R3F 渲染、IndexedDB）只是这些纯函数结果的薄执行层。

**Tech Stack:** Vite、React 18、TypeScript（strict）、@react-three/fiber、@react-three/drei、three、zustand、zod、idb-keyval、vite-plugin-pwa、Vitest（+ @vitest/coverage-v8、fake-indexeddb、@testing-library/react、jsdom）、Playwright、tsx、Blender 5.x（Python 脚本）。

**Spec:** `docs/superpowers/specs/2026-11-06-fitness-workout-mvp-design.md`

## Global Constraints

- 界面文字全部为中文；源代码和界面中不使用 emoji 或 Unicode 图标符号。
- 不可变数据：所有纯函数返回新对象，不修改入参（Plan、Step 数组均以 `readonly` 声明）。
- 单个源文件不超过 400 行，函数不超过 50 行。
- 部位固定 6 个：`肩颈`、`上肢`、`胸背`、`腰腹`、`臀腿`、`全身`。
- 时长选项：5 / 10 / 15 / 20 / 30 分钟；难度：1 入门 / 2 进阶 / 3 挑战。
- 分段占比：热身 0.15、主训 0.70、拉伸 0.15，每段至少 1 个动作。
- BPM：热身 100；主训难度 1/2/3 为 110/120/128；拉伸 80。
- 动画播放速度必须在 0.6 到 1.6 之间（含端点）；回退顺序：原拍数、加倍、减半。
- 总时长（动作 + 休息，不含开场准备）目标误差 ±30 秒；可调次数范围为 4 到 `defaultReps × 2`。
- 休息：难度 1/2/3 为 20/15/10 秒，向上取整到整小节（4 拍，按下一个动作的 BPM）。
- 难度 1 排除 `impact = "high"` 的动作。
- 节拍排程：每 25ms 检查一次，提前排程 100ms。
- 口令播放时音乐压低 8dB（增益乘 0.398）。
- 动作切换淡入淡出 0.3 秒；屏幕像素比上限 2。
- `mannequin.glb` 小于 3MB；动作库 40-80 条。
- 动作素材来自 desk-break（MIT，作者 Shlomy Reshef），必须保留版权声明。
- 所有音效（鼓、duang、木鱼、锣、鸭叫等）在浏览器中由合成配方实时渲染，不使用外部采样文件，因此不存在采样授权问题（满足设计文档第 7.2 节"自行制作"、第 14.3 节）。
- 用户自选音乐只在本机解码与保存，不上传。

## Review Focus

1. **部位选得少、时长选得长**（如只选"肩颈" + 30 分钟 + 入门）：应返回较短方案并给出 `shortfallSeconds > 0`，不能死循环或抛异常。测试在 Task 3。
2. **最短时长 5 分钟**：三段各至少 1 个动作时仍应落在 ±30 秒内（靠调整次数）。测试在 Task 3。
3. **暂停后切到后台再回来、在最后一个动作按"跳过"**：恢复后音乐与动画从同一时刻继续；最后一个动作跳过后直接进入完成页，不崩溃。测试在 Task 7。
4. **预览页把动作删到只剩一个**：不能再删，"开始训练"始终可用；删除第一个动作后新的第一个动作前面没有休息。测试在 Task 4、Task 12。
5. **用户选了无法解码的文件（如 .txt 改名为 .mp3）**：返回解码失败，界面提示"此文件格式不支持"并切回内置风格，训练不受影响。测试在 Task 9。

---

## File Structure

```
package.json / vite.config.ts / tsconfig.json / index.html / playwright.config.ts
src/
  catalog/types.ts          动作 schema（zod）与类型、parseCatalog
  catalog/constants.ts      IDLE_CLIP、资源路径
  catalog/loadCatalog.ts    fetch + parse
  planner/types.ts          PlanInput、PlanItem、Plan
  planner/timing.ts         BPM、拍长、fitBeats、休息时长
  planner/rng.ts            带种子随机数
  planner/generatePlan.ts   规则引擎
  planner/editPlan.ts       替换、删除
  player/timeline.ts        buildTimeline、stateAt
  player/session.ts         TrainingSession（暂停/跳过/上一个/倍速）
  beat/events.ts            beatEventsInWindow
  beat/patterns.ts          三种风格的节奏型
  beat/voiceCues.ts         节拍到口令的映射
  beat/schedule.ts          scheduleWindow（音效 + 口令的纯排程结果）
  audio/synth.ts            合成音色配方与渲染
  audio/userMusic.ts        decodeUserMusic
  audio/engine.ts           AudioEngine（播放、闪避、自选音乐、iOS 解锁）
  storage/storage.ts        设置、训练记录、自选音乐
  stage/pose.ts             computePose、blendWeight（纯函数）
  stage/webgl.ts            hasWebGL
  stage/Stage.tsx           R3F 场景、相机、镜像、降级、重试
  ui/store.ts               zustand 全局状态
  ui/format.ts              时长与次数格式化
  ui/pages/{Home,Preview,Training,Done}.tsx
  ui/components/{Disclaimer,SettingsSheet,About}.tsx
  App.tsx / main.tsx
public/assets/
  catalog/exercises.json
  models/mannequin.glb、models/LICENSES.md
  thumbs/<clip>.png
  voice/<VoiceId>.mp3、voice/README.md
  audio/silence.mp3
  icons/icon-192.png、icons/icon-512.png
scripts/validate-catalog.ts
tools/blender/export_subset.py、tools/blender/selected-clips.txt
tests/fixtures/catalog.ts
tests/**                    （与 src 同结构的单元测试）
e2e/workout.spec.ts
docs/device-test-checklist.md
```

---

### Task 1: 项目脚手架与动作 schema

**Files:**
- Create: `package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`、`src/main.tsx`（暂时渲染 `<div>魔性健身</div>`）
- Create: `src/catalog/types.ts`、`src/catalog/constants.ts`、`src/catalog/loadCatalog.ts`
- Create: `tests/fixtures/catalog.ts`
- Test: `tests/catalog/types.test.ts`

**Interfaces:**
- Produces:
  - `PARTS: readonly ['肩颈','上肢','胸背','腰腹','臀腿','全身']`，`type Part`
  - `type SegmentType = 'warmup' | 'main' | 'stretch'`，`type Level = 1 | 2 | 3`
  - `ExerciseSchema`（zod），`type Exercise`，字段：`id`（`/^[a-z0-9]+(-[a-z0-9]+)*$/`）、`name`、`clip`、`clipSeconds`（>0）、`parts`（非空 Part 数组）、`type`、`level`、`impact: 'low'|'high'`、`beatsPerRep`（整数 ≥1）、`defaultReps`（整数 ≥4）、`sided`、`cues`（至少 1 条）、`caution`（字符串，可为空串）
  - `class CatalogError extends Error`
  - `parseCatalog(data: unknown): readonly Exercise[]`：格式错误或 id 重复时抛 `CatalogError`，消息包含出错的 id 或下标
  - `loadCatalog(url?: string): Promise<readonly Exercise[]>`，默认 `CATALOG_URL`；HTTP 非 2xx 时抛 `CatalogError('动作库加载失败: <status>')`
  - `constants.ts`：`CATALOG_URL = '/assets/catalog/exercises.json'`、`MODEL_URL = '/assets/models/mannequin.glb'`、`THUMB_URL = (clip: string) => '/assets/thumbs/' + clip + '.png'`、`VOICE_URL = (id: string) => '/assets/voice/' + id + '.mp3'`、`IDLE_CLIP`（先设为 `'Idle'`，Task 5 改为真实片段名）
  - `tests/fixtures/catalog.ts`：`makeExercise(overrides: Partial<Exercise>): Exercise`、`fixtureCatalog: readonly Exercise[]`

`clipSeconds` 是设计文档第 5.1 节格式之外新增的字段，由 Task 5 的 Blender 脚本写入，规则引擎计算播放速度时需要它。

`fixtureCatalog`（共 46 条）的组成：前 5 个部位每个有 main 难度 1、2、3 各 2 条，warmup 1 条，stretch 1 条；另有 `全身` warmup 2 条、`全身` stretch 3 条，以及 1 条 `全身` main 难度 2、`impact: 'high'`、id 为 `jumping-jack` 的动作。所有条目 `beatsPerRep: 4`、`clipSeconds: 2.4`、`defaultReps: 8`，下标为奇数的 `sided: true`，`parts` 只含一个部位。

- [ ] **Step 1: 初始化项目**

```bash
npm create vite@latest . -- --template react-ts
npm i three @react-three/fiber @react-three/drei zustand zod idb-keyval
npm i -D vitest @vitest/coverage-v8 jsdom fake-indexeddb @testing-library/react @types/three tsx vite-plugin-pwa @playwright/test
```

在 `package.json` 中加脚本：`"test": "vitest run"`、`"coverage": "vitest run --coverage"`、`"validate:catalog": "tsx scripts/validate-catalog.ts"`、`"e2e": "playwright test"`。`tsconfig` 开启 `strict`。`vite.config.ts` 中配置 `test.environment = 'jsdom'`。

- [ ] **Step 2: 写失败测试 `tests/catalog/types.test.ts`**

```ts
it('accepts every fixture exercise', () => {
  expect(parseCatalog(fixtureCatalog)).toHaveLength(46)
})
it('rejects unknown part with the exercise id in the message', () => {
  const bad = [{ ...makeExercise({ id: 'x-1' }), parts: ['脚踝'] }]
  expect(() => parseCatalog(bad)).toThrow(/x-1/)
})
it('rejects duplicate ids', () => {
  const e = makeExercise({ id: 'dup' })
  expect(() => parseCatalog([e, e])).toThrow(/dup/)
})
it('rejects defaultReps below 4 and clipSeconds <= 0', () => {
  expect(() => parseCatalog([makeExercise({ defaultReps: 3 })])).toThrow(CatalogError)
  expect(() => parseCatalog([makeExercise({ clipSeconds: 0 })])).toThrow(CatalogError)
})
```

- [ ] **Step 3: 运行，确认失败** — Run: `npx vitest run tests/catalog`，Expected: FAIL（模块不存在）
- [ ] **Step 4: 实现 `types.ts`、`constants.ts`、`loadCatalog.ts`、fixture**
- [ ] **Step 5: 运行，确认通过** — Expected: PASS
- [ ] **Step 6: 提交** — `git add -A && git commit -m "feat: scaffold project and exercise catalog schema"`

---

### Task 2: 节拍与时长计算

**Files:**
- Create: `src/planner/timing.ts`
- Test: `tests/planner/timing.test.ts`

**Interfaces:**
- Consumes: `SegmentType`、`Level`（Task 1）
- Produces:
  - `SEGMENT_SHARE = { warmup: 0.15, main: 0.7, stretch: 0.15 }`
  - `MINUTES_OPTIONS = [5, 10, 15, 20, 30] as const`，`type Minutes`
  - `TOLERANCE_SECONDS = 30`、`MIN_REPS = 4`、`TIME_SCALE_MIN = 0.6`、`TIME_SCALE_MAX = 1.6`、`BEATS_PER_BAR = 4`
  - `bpmFor(segment: SegmentType, level: Level): number`
  - `beatSeconds(bpm: number): number`
  - `repSeconds(beatsPerRep: number, bpm: number): number`
  - `itemSeconds(reps: number, beatsPerRep: number, bpm: number, sided: boolean): number`
  - `fitBeats(clipSeconds: number, beatsPerRep: number, bpm: number): { beatsPerRep: number; timeScale: number } | null`：依次尝试原值、×2、÷2（仅当原值为偶数），返回第一个 `timeScale = clipSeconds / repSeconds` 落在 [0.6, 1.6] 的结果，比较时用 `1e-9` 容差
  - `restSeconds(level: Level, bpm: number): number`

- [ ] **Step 1: 写失败测试**

```ts
it('bpm table', () => {
  expect(bpmFor('warmup', 3)).toBe(100)
  expect(([1, 2, 3] as Level[]).map(l => bpmFor('main', l))).toEqual([110, 120, 128])
  expect(bpmFor('stretch', 1)).toBe(80)
})
it('item seconds doubles for sided', () => {
  expect(itemSeconds(8, 4, 120, false)).toBeCloseTo(16)
  expect(itemSeconds(8, 4, 120, true)).toBeCloseTo(32)
})
it('fitBeats keeps original when in range', () => {
  expect(fitBeats(2.4, 4, 100)).toEqual({ beatsPerRep: 4, timeScale: 1 })
})
it('fitBeats doubles beats when too fast', () => {
  expect(fitBeats(6, 4, 120)).toEqual({ beatsPerRep: 8, timeScale: 1.5 })
})
it('fitBeats halves beats when too slow', () => {
  expect(fitBeats(1, 4, 120)).toEqual({ beatsPerRep: 2, timeScale: 1 })
})
it('fitBeats returns null when nothing fits', () => {
  expect(fitBeats(0.5, 4, 80)).toBeNull()
})
it('fitBeats accepts the exact boundaries', () => {
  expect(fitBeats(1.2, 4, 120)?.timeScale).toBeCloseTo(0.6)
  expect(fitBeats(3.2, 4, 120)?.timeScale).toBeCloseTo(1.6)
})
it('rest rounds up to whole bars', () => {
  expect(restSeconds(1, 110)).toBeCloseTo(21.818, 2)
  expect(restSeconds(2, 120)).toBeCloseTo(16)
  expect(restSeconds(3, 128)).toBeCloseTo(11.25)
})
```

- [ ] **Step 2: 运行确认失败** — Run: `npx vitest run tests/planner/timing.test.ts`，Expected: FAIL
- [ ] **Step 3: 实现 `src/planner/timing.ts`**
- [ ] **Step 4: 运行确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — `git add -A && git commit -m "feat: add beat and duration timing math"`

---

### Task 3: 方案生成规则引擎

**Files:**
- Create: `src/planner/types.ts`、`src/planner/rng.ts`、`src/planner/generatePlan.ts`
- Test: `tests/planner/generatePlan.test.ts`

**Interfaces:**
- Consumes: Task 1 类型与 fixture，Task 2 全部导出
- Produces:
  - `interface PlanInput { readonly parts: readonly Part[]; readonly minutes: Minutes; readonly level: Level }`
  - `interface PlanItem { readonly exerciseId: string; readonly segment: SegmentType; readonly reps: number; readonly bpm: number; readonly beatsPerRep: number; readonly timeScale: number; readonly sided: boolean; readonly restBeforeSeconds: number }`（第一个动作的 `restBeforeSeconds` 为 0）
  - `interface Plan { readonly input: PlanInput; readonly seed: number; readonly items: readonly PlanItem[]; readonly totalSeconds: number; readonly shortfallSeconds: number }`
  - `mulberry32(seed: number): () => number`、`shuffle<T>(items: readonly T[], rand: () => number): T[]`
  - `matchesParts(exercise: Exercise, parts: readonly Part[]): boolean`：用户选了 `全身`，或动作的 `parts` 含 `全身`，或两者有交集时为 true
  - `eligible(exercise: Exercise, input: PlanInput): boolean`：`level ≤ input.level`、`matchesParts`，且难度 1 时 `impact !== 'high'`
  - `computeTotal(items: readonly PlanItem[]): number`：所有 `restBeforeSeconds + itemSeconds` 之和
  - `generatePlan(input: PlanInput, catalog: readonly Exercise[], seed: number): Plan`；`parts` 为空时抛 `Error('至少选择一个部位')`

**算法（签名和测试无法唯一确定的部分）：**
1. 目标秒数 `target = minutes × 60`；每段预算 = `target × SEGMENT_SHARE[segment]`。
2. 对每段（顺序 warmup、main、stretch）：候选 = 该类型、`eligible`、且 `fitBeats(clipSeconds, beatsPerRep, bpm)` 非空的动作，用 `mulberry32(seed)` 打乱（全程共用一个 rand）。部位轮转顺序为 `input.parts`（选了 `全身` 时用 `PARTS` 前 5 个）。循环：取轮转中的下一个部位，从候选里取第一个"匹配该部位且未被选过"的动作；所有部位都取不到时结束本段。动作以 `defaultReps` 加入，`beatsPerRep`、`timeScale` 取 `fitBeats` 的结果。该段至少放入 1 个；之后只有在"段内已用秒数 + 休息 + 该动作秒数 ≤ 预算"时才加入，否则跳到下一个部位继续尝试。
3. 每个非首动作的 `restBeforeSeconds = restSeconds(level, 本动作 bpm)`。
4. 凑整：令 `diff = target − computeTotal(items)`，按 `diff` 增减最后一个 main 动作的次数，限制在 `[MIN_REPS, defaultReps × 2]`；之后若仍超过 `target + 30`，从后往前把其他动作逐个降到 `MIN_REPS`，直到不超或无法再降；若仍低于 `target − 30`，从后往前把其他 main 动作逐个升到 `defaultReps × 2`，直到不低或无法再升。
5. `shortfallSeconds = total < target − 30 ? Math.round(target − total) : 0`。

- [ ] **Step 1: 写失败测试**

```ts
const input = (p: Partial<PlanInput> = {}): PlanInput =>
  ({ parts: ['腰腹'], minutes: 10, level: 1, ...p })
const byId = new Map(fixtureCatalog.map(e => [e.id, e]))

it('is deterministic for the same seed and differs for another seed', () => {
  expect(generatePlan(input(), fixtureCatalog, 7)).toEqual(generatePlan(input(), fixtureCatalog, 7))
  const ids = (s: number) => generatePlan(input({ parts: ['全身'], minutes: 20, level: 3 }), fixtureCatalog, s).items.map(i => i.exerciseId)
  expect(ids(1)).not.toEqual(ids(2))
})
it('orders segments warmup, main, stretch with at least one each', () => {
  const rank = { warmup: 0, main: 1, stretch: 2 }
  const segs = generatePlan(input(), fixtureCatalog, 1).items.map(i => i.segment)
  expect(new Set(segs)).toEqual(new Set(['warmup', 'main', 'stretch']))
  segs.slice(1).forEach((s, k) => expect(rank[s]).toBeGreaterThanOrEqual(rank[segs[k]]))
})
it.each([5, 10, 15, 20] as const)('full-body %i min lands within ±30s', m => {
  const p = generatePlan(input({ parts: ['全身'], minutes: m, level: 3 }), fixtureCatalog, 3)
  expect(Math.abs(p.totalSeconds - m * 60)).toBeLessThanOrEqual(30)
  expect(p.shortfallSeconds).toBe(0)
})
it('5 min with two parts fits (Review Focus 2)', () => {
  const p = generatePlan(input({ parts: ['腰腹', '臀腿'], minutes: 5, level: 2 }), fixtureCatalog, 1)
  expect(Math.abs(p.totalSeconds - 300)).toBeLessThanOrEqual(30)
})
it('never exceeds level and excludes high impact at level 1', () => {
  const p = generatePlan(input({ parts: ['全身'], minutes: 30, level: 1 }), fixtureCatalog, 1)
  expect(p.items.every(i => byId.get(i.exerciseId)!.level === 1)).toBe(true)
  expect(p.items.some(i => i.exerciseId === 'jumping-jack')).toBe(false)
})
it('has no duplicates, first rest is 0, reps within bounds', () => {
  const p = generatePlan(input({ parts: ['全身'], minutes: 20, level: 2 }), fixtureCatalog, 5)
  expect(new Set(p.items.map(i => i.exerciseId)).size).toBe(p.items.length)
  expect(p.items[0].restBeforeSeconds).toBe(0)
  expect(p.items.every(i => i.reps >= 4 && i.reps <= 16)).toBe(true)
})
it('reports shortfall for a narrow long request (Review Focus 1)', () => {
  const p = generatePlan(input({ parts: ['肩颈'], minutes: 30 }), fixtureCatalog, 1)
  expect(p.shortfallSeconds).toBeGreaterThan(0)
  expect(p.items.length).toBeGreaterThanOrEqual(3)
})
it('alternates parts when two are chosen', () => {
  const p = generatePlan(input({ parts: ['腰腹', '臀腿'], minutes: 20, level: 3 }), fixtureCatalog, 2)
  const mains = p.items.filter(i => i.segment === 'main').map(i => byId.get(i.exerciseId)!.parts[0])
  mains.slice(1).forEach((part, k) => expect(part).not.toBe(mains[k]))
})
it('throws on empty parts', () => {
  expect(() => generatePlan(input({ parts: [] }), fixtureCatalog, 1)).toThrow('至少选择一个部位')
})
```

- [ ] **Step 2: 运行确认失败** — Run: `npx vitest run tests/planner/generatePlan.test.ts`，Expected: FAIL
- [ ] **Step 3: 实现**（`generatePlan` 拆成 `pickSegment`、`fitTotal` 等小函数，每个不超过 50 行）
- [ ] **Step 4: 运行确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — `git add -A && git commit -m "feat: add rule-based plan generator"`

---

### Task 4: 方案编辑（替换、删除）

**Files:**
- Create: `src/planner/editPlan.ts`
- Test: `tests/planner/editPlan.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `Plan`、`PlanItem`、`eligible`、`computeTotal`；Task 2 的 `fitBeats`、`itemSeconds`
- Produces:
  - `replacementCandidates(plan: Plan, index: number, catalog: readonly Exercise[]): readonly Exercise[]`：同 `type`、与原动作 `parts` 有交集（或任一方含 `全身`）、`eligible(…, plan.input)`、不在方案中、在该动作 `bpm` 下 `fitBeats` 非空
  - `replaceItem(plan: Plan, index: number, exercise: Exercise): Plan`：次数取使新动作时长最接近原动作时长的整数，限制在 `[4, defaultReps × 2]`；`bpm`、`restBeforeSeconds` 保持不变
  - `removeItem(plan: Plan, index: number): Plan`：只剩 1 个时抛 `Error('至少保留一个动作')`；删除后新的第一个动作 `restBeforeSeconds` 置 0
  - 两者都重算 `totalSeconds`，`shortfallSeconds` 置 0（用户手动编辑后不再提示不足），返回新对象

- [ ] **Step 1: 写失败测试**

```ts
const base = () => generatePlan({ parts: ['全身'], minutes: 10, level: 2 }, fixtureCatalog, 1)
const mainIndex = (p: Plan) => p.items.findIndex(i => i.segment === 'main')

it('candidates exclude exercises already in plan and other segment types', () => {
  const p = base(); const i = mainIndex(p)
  const inPlan = new Set(p.items.map(x => x.exerciseId))
  const c = replacementCandidates(p, i, fixtureCatalog)
  expect(c.length).toBeGreaterThan(0)
  expect(c.every(e => !inPlan.has(e.id) && e.type === 'main')).toBe(true)
})
it('replace changes the item, recomputes total, and does not mutate input', () => {
  const p = base(); const i = mainIndex(p); const before = JSON.stringify(p)
  const next = replaceItem(p, i, replacementCandidates(p, i, fixtureCatalog)[0])
  expect(JSON.stringify(p)).toBe(before)
  expect(next.items[i].exerciseId).not.toBe(p.items[i].exerciseId)
  expect(next.totalSeconds).toBeCloseTo(computeTotal(next.items))
})
it('removing first item zeroes the new first rest (Review Focus 4)', () => {
  expect(removeItem(base(), 0).items[0].restBeforeSeconds).toBe(0)
})
it('refuses to remove the last remaining item (Review Focus 4)', () => {
  let p = base()
  while (p.items.length > 1) p = removeItem(p, 0)
  expect(() => removeItem(p, 0)).toThrow('至少保留一个动作')
})
```

- [ ] **Step 2: 运行确认失败** — Expected: FAIL
- [ ] **Step 3: 实现 `src/planner/editPlan.ts`**
- [ ] **Step 4: 运行确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — `git add -A && git commit -m "feat: add plan replace and remove"`

---

### Task 5: 素材管线与动作库

这个任务以内容制作为主：从 desk-break 挑动作、打标签、导出瘦身后的 GLB 和缩略图，并用校验脚本约束结果。

**Files:**
- Create: `tools/blender/export_subset.py`、`tools/blender/selected-clips.txt`
- Create: `public/assets/catalog/exercises.json`、`public/assets/models/mannequin.glb`、`public/assets/models/LICENSES.md`、`public/assets/thumbs/*.png`
- Create: `scripts/validate-catalog.ts`
- Modify: `src/catalog/constants.ts`（`IDLE_CLIP` 改为真实片段名）
- Test: `tests/scripts/validate-catalog.test.ts`

**Interfaces:**
- Consumes: `parseCatalog`、`IDLE_CLIP`（Task 1），`fitBeats`、`bpmFor`（Task 2）
- Produces:
  - `readGlbAnimations(bytes: Uint8Array): Map<string, number>`：片段名到时长（秒）。解析 GLB 的 JSON chunk，取每个 animation 各 sampler 的 input accessor 的 `max[0]` 中的最大值。
  - `validateCatalog(catalog: readonly Exercise[], clips: Map<string, number>, glbBytes: number): string[]`：返回错误信息列表，空数组表示通过。
  - 素材文件：`exercises.json`、`mannequin.glb`、`thumbs/<clip>.png`，以及更新后的 `IDLE_CLIP`。

**validateCatalog 的规则（每条对应一条错误信息）：**
1. 条目数在 40 到 80 之间。
2. 每个 `clip` 和 `IDLE_CLIP` 都在 GLB 中存在；`clipSeconds` 与 GLB 时长相差不超过 0.05 秒。错误信息包含动作 id 或片段名。
3. 每个动作在它可能出现的所有 BPM 下 `fitBeats` 都非空：warmup 用 100，stretch 用 80，main 用 `bpmFor('main', l)`，`l` 取 `exercise.level` 到 3。
4. 前 5 个部位每个至少有 2 条 main 难度 1 的动作；warmup 总数 ≥ 6，stretch 总数 ≥ 8；每个部位至少能匹配到 1 条 warmup 和 1 条 stretch（含 `全身`）。
5. GLB 小于 3 × 1024 × 1024 字节，错误信息包含 "3MB"。

- [ ] **Step 1: 写失败测试**

```ts
const clipsFor = (cat: readonly Exercise[]) =>
  new Map([...cat.map(e => [e.clip, e.clipSeconds] as const), [IDLE_CLIP, 3]])
it('passes the fixture catalog', () => {
  expect(validateCatalog(fixtureCatalog, clipsFor(fixtureCatalog), 1000)).toEqual([])
})
it('flags too few exercises', () => {
  const few = fixtureCatalog.slice(0, 10)
  expect(validateCatalog(few, clipsFor(few), 1000).join()).toMatch(/40/)
})
it('flags missing clip and duration mismatch', () => {
  const cat = [...fixtureCatalog, makeExercise({ id: 'nope-a', clip: 'Nope' }), makeExercise({ id: 'off-b', clip: 'Off', clipSeconds: 2 })]
  const clips = new Map([...clipsFor(fixtureCatalog), ['Off', 2.5]])
  const errs = validateCatalog(cat, clips, 1000).join('\n')
  expect(errs).toMatch(/Nope/); expect(errs).toMatch(/off-b/)
})
it('flags oversized glb', () => {
  expect(validateCatalog(fixtureCatalog, clipsFor(fixtureCatalog), 4 * 1024 * 1024).join()).toMatch(/3MB/)
})
it('reads animation durations from a GLB', async () => {
  // 用 three 的 GLTFExporter（binary: true）导出一个带名为 'Test'、时长 2 秒动画的最小场景
  expect(readGlbAnimations(await makeTestGlb())).toEqual(new Map([['Test', 2]]))
})
```

`fixtureCatalog` 要能通过校验，这样它才能代表一个合格的动作库。如果 Task 1 的夹具满足不了规则 4，就调整夹具，而不是放宽规则。

- [ ] **Step 2: 运行确认失败** — Expected: FAIL
- [ ] **Step 3: 实现 `scripts/validate-catalog.ts`**：导出上述两个函数；直接运行时读取 `public/assets/catalog/exercises.json` 和 `mannequin.glb`，打印所有错误，有错误时以退出码 1 结束。
- [ ] **Step 4: 运行确认通过** — Expected: PASS
- [ ] **Step 5: 获取素材**

```bash
git clone --depth 1 https://github.com/shlomorsh/desk-break.git ../desk-break-src
```

在 `../desk-break-src/library` 中找到 Blender 源文件，并用它的在线浏览页挑选 40-80 个动作，外加 1 个站立待机动作作为 `IDLE_CLIP`，把片段名逐行写入 `tools/blender/selected-clips.txt`。挑选时优先满足规则 4 的覆盖要求，排除舞蹈类和搞笑类动作（MVP 只做训练动作）。

- [ ] **Step 6: 写 `tools/blender/export_subset.py` 并运行**

参数：`--src <.blend> --clips <txt> --out <glb> --thumbs <dir> --durations <json>`。脚本删除未选中的动作，用 glTF 导出器开启 meshopt 压缩导出 GLB；对每个片段在动画中点帧渲染 256×256 的 PNG（Eevee、透明背景）；把每个片段的时长写入 JSON。

```bash
blender -b --python tools/blender/export_subset.py -- --src ../desk-break-src/library/<文件名>.blend --clips tools/blender/selected-clips.txt --out public/assets/models/mannequin.glb --thumbs public/assets/thumbs --durations tools/blender/clip-seconds.json
```

Expected：GLB 小于 3MB，PNG 数量等于片段数。

- [ ] **Step 7: 编写 `exercises.json`**：为每个片段填写中文名、部位、类型、难度、冲击、`beatsPerRep`、`defaultReps`、`sided`、要点、禁忌；`clipSeconds` 从 `clip-seconds.json` 抄入。动作要点与禁忌可参考 free-exercise-db 用中文改写，不得照抄。更新 `IDLE_CLIP`。写 `LICENSES.md`，内容为 desk-break 的完整 MIT 许可证原文和来源链接。

- [ ] **Step 8: 运行校验** — Run: `npm run validate:catalog`。Expected：无输出、退出码 0。若某动作在部分 BPM 下不适配，调整其 `beatsPerRep`，或改成只出现在合适的段。

- [ ] **Step 9: 提交**

```bash
git add tools scripts public/assets src/catalog tests/scripts
git commit -m "feat: add exercise asset pipeline and catalog"
```

---

### Task 6: 训练时间线

**Files:**
- Create: `src/player/timeline.ts`
- Test: `tests/player/timeline.test.ts`

**Interfaces:**
- Consumes: `Plan`、`PlanItem`（Task 3），`beatSeconds`、`repSeconds`（Task 2）
- Produces:
  - `type StepKind = 'prepare' | 'work' | 'rest'`
  - `interface Step { readonly kind: StepKind; readonly itemIndex: number; readonly start: number; readonly end: number; readonly bpm: number; readonly side: 'left' | 'right' | null; readonly reps: number; readonly beatsPerRep: number; readonly timeScale: number }`（rest、prepare 的 `reps` 为 0）
  - `buildTimeline(plan: Plan): readonly Step[]`：先放 prepare（第一个动作 BPM 下的 4 拍，`itemIndex` 0），然后每个动作依次放 rest（`restBeforeSeconds > 0` 时）和 work；`sided` 的动作拆成 left、right 两个 work 步骤，各 `reps` 次
  - `timelineEnd(steps: readonly Step[]): number`
  - `interface TrainingState { readonly done: boolean; readonly stepIndex: number; readonly step: Step; readonly repIndex: number; readonly repProgress: number; readonly stepElapsed: number; readonly stepRemaining: number }`（done 时 `stepIndex` 为最后一步）
  - `stateAt(steps: readonly Step[], t: number): TrainingState`（对 steps 做二分查找）

- [ ] **Step 1: 写失败测试**

```ts
const plan = generatePlan({ parts: ['全身'], minutes: 10, level: 2 }, fixtureCatalog, 1)
const steps = buildTimeline(plan)

it('starts with a 4-beat prepare and is contiguous', () => {
  expect(steps[0].kind).toBe('prepare')
  expect(steps[0].end).toBeCloseTo(4 * 60 / plan.items[0].bpm)
  steps.slice(1).forEach((s, k) => expect(s.start).toBeCloseTo(steps[k].end))
})
it('total equals prepare plus plan total', () => {
  expect(timelineEnd(steps)).toBeCloseTo(steps[0].end + plan.totalSeconds)
})
it('splits sided items into left then right', () => {
  const idx = plan.items.findIndex(i => i.sided)
  const sides = steps.filter(s => s.itemIndex === idx && s.kind === 'work').map(s => s.side)
  expect(sides).toEqual(['left', 'right'])
})
it('stateAt reports rep index and progress', () => {
  const w = steps.find(s => s.kind === 'work')!
  const rep = w.beatsPerRep * 60 / w.bpm
  const st = stateAt(steps, w.start + rep * 1.5)
  expect(st.repIndex).toBe(1); expect(st.repProgress).toBeCloseTo(0.5)
})
it('stateAt is done at and after the end', () => {
  expect(stateAt(steps, timelineEnd(steps)).done).toBe(true)
  expect(stateAt(steps, 1e9).done).toBe(true)
})
```

- [ ] **Step 2: 运行确认失败** — Expected: FAIL
- [ ] **Step 3: 实现**
- [ ] **Step 4: 运行确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — `git add -A && git commit -m "feat: add training timeline"`

---

### Task 7: 训练会话控制

**Files:**
- Create: `src/player/session.ts`
- Test: `tests/player/session.test.ts`

**Interfaces:**
- Consumes: `Step`、`stateAt`、`timelineEnd`（Task 6）
- Produces:
  - `interface Clock { now(): number }`（单位秒；生产环境用 `{ now: () => audioCtx.currentTime }`）
  - `class TrainingSession`
    - `constructor(steps: readonly Step[], clock: Clock, rate?: number)`：`rate` 默认 1，限制在 [1, 60]
    - `start(): void`、`pause(): void`、`resume(): void`、`isPaused(): boolean`、`isStarted(): boolean`
    - `time(): number`：训练时间（秒），暂停时冻结，不超过 `timelineEnd`
    - `clockTimeOf(t: number): number`：训练时间 t 对应的时钟时间，供音频精确排程
    - `skip(): void`：跳到下一个动作的第一个步骤（它的 rest 或 work）；已是最后一个动作时跳到结尾；把当前动作记入"已跳过"
    - `prev(): void`：跳到上一个动作第一个 work 步骤的开头；在第一个动作时回到它的 work 开头；目标动作从"已跳过"中移除
    - `skippedItems(): ReadonlySet<number>`
    - `activeSeconds(): number`：不含暂停的真实经过秒数，即 `time() / rate`
    - `onJump(listener: () => void): () => void`：skip、prev、resume 时通知订阅者（音频引擎据此重置排程窗口），返回取消订阅函数

内部状态只有 `anchorClock`、`anchorTime`、`paused`、已跳过集合；每次 skip、prev、resume 都重设两个锚点。

- [ ] **Step 1: 写失败测试**（`fake()` 返回 `{ now, advance(dt) }`，时间可手动推进）

```ts
it('advances with clock and freezes while paused (Review Focus 3)', () => {
  const c = fake(); const s = new TrainingSession(steps, c); s.start()
  c.advance(10); s.pause(); c.advance(100)
  expect(s.time()).toBeCloseTo(10)
  s.resume(); c.advance(5)
  expect(s.time()).toBeCloseTo(15)
  expect(s.activeSeconds()).toBeCloseTo(15)
})
it('applies rate', () => {
  const c = fake(); const s = new TrainingSession(steps, c, 60); s.start(); c.advance(1)
  expect(s.time()).toBeCloseTo(60)
})
it('clockTimeOf inverts time', () => {
  const c = fake(); const s = new TrainingSession(steps, c, 2); s.start(); c.advance(3)
  expect(s.clockTimeOf(s.time() + 4)).toBeCloseTo(c.now() + 2)
})
it('skip moves to next item and records skipped', () => {
  const c = fake(); const s = new TrainingSession(steps, c); s.start()
  c.advance(steps[1].start + 1); const cur = stateAt(steps, s.time()).step.itemIndex
  s.skip()
  expect(stateAt(steps, s.time()).step.itemIndex).toBe(cur + 1)
  expect(s.skippedItems().has(cur)).toBe(true)
})
it('skip on the last item ends the session (Review Focus 3)', () => {
  const c = fake(); const s = new TrainingSession(steps, c); s.start()
  c.advance(timelineEnd(steps) - 1); s.skip()
  expect(stateAt(steps, s.time()).done).toBe(true)
})
it('prev returns to previous work and clears its skipped flag', () => {
  const c = fake(); const s = new TrainingSession(steps, c); s.start()
  c.advance(steps[1].start + 1); s.skip(); s.prev()
  const st = stateAt(steps, s.time())
  expect(st.step.kind).toBe('work'); expect(st.stepElapsed).toBeCloseTo(0)
  expect(s.skippedItems().size).toBe(0)
})
it('notifies jump listeners on skip and resume', () => {
  const c = fake(); const s = new TrainingSession(steps, c); const fn = vi.fn()
  s.onJump(fn); s.start(); s.skip(); s.pause(); s.resume()
  expect(fn).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: 运行确认失败** — Expected: FAIL
- [ ] **Step 3: 实现 `src/player/session.ts`**
- [ ] **Step 4: 运行确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — `git add -A && git commit -m "feat: add training session controller"`

---

### Task 8: 节拍事件、节奏型、口令映射、排程

**Files:**
- Create: `src/beat/events.ts`、`src/beat/patterns.ts`、`src/beat/voiceCues.ts`、`src/beat/schedule.ts`
- Test: `tests/beat/events.test.ts`、`tests/beat/patterns.test.ts`、`tests/beat/voiceCues.test.ts`、`tests/beat/schedule.test.ts`

**Interfaces:**
- Consumes: `Step`、`StepKind`（Task 6），`SegmentType`（Task 1），`Plan`（Task 3），`beatSeconds`（Task 2）
- Produces:
  - `interface BeatEvent { readonly time: number; readonly stepIndex: number; readonly kind: StepKind; readonly segment: SegmentType; readonly side: 'left'|'right'|null; readonly beatInStep: number; readonly beatsLeftInStep: number; readonly repIndex: number; readonly beatInRep: number; readonly isRepEnd: boolean; readonly repsLeft: number }`：`repsLeft` 是含当前这次在内的剩余次数；rest、prepare 中与 rep 相关的字段为 0 或 false；`segment` 取自该步骤所属动作
  - `beatEventsInWindow(steps: readonly Step[], plan: Plan, from: number, to: number): BeatEvent[]`：`time` 落在 `[from, to)` 内的拍；每步的拍数 = `Math.round((end − start) / beatSeconds(bpm))`
  - `type SoundId = 'kick' | 'snare' | 'hat' | 'bass' | 'duang' | 'muyu' | 'gong' | 'quack' | 'tick'`
  - `type StyleId = 'guichu' | 'guangchang' | 'muyu'`，`STYLE_LABELS: Record<StyleId, string>` = `{ guichu: '电子鬼畜', guangchang: '广场舞', muyu: '木鱼禅意' }`
  - `interface Hit { readonly sound: SoundId; readonly gain: number; readonly rate: number }`
  - `styleForSegment(segment: SegmentType, mainStyle: StyleId): StyleId`：warmup 返回 `guangchang`，stretch 返回 `muyu`，main 返回 `mainStyle`
  - `hitsForEvent(e: BeatEvent, style: StyleId): Hit[]`
  - `type VoiceId = 'n1' | … | 'n20' | 'start' | 'switch' | 'rest' | 'last3' | 'done' | 'hey'`，`VOICE_IDS: readonly VoiceId[]`（共 26 个）
  - `voiceForEvent(e: BeatEvent): VoiceId | null`
  - `interface Scheduled { readonly hits: readonly (Hit & { readonly time: number })[]; readonly voices: readonly { readonly time: number; readonly voice: VoiceId }[] }`
  - `scheduleWindow(steps: readonly Step[], plan: Plan, from: number, to: number, opts: { mainStyle: StyleId; userMusic: boolean; clickWithUserMusic: boolean }): Scheduled`：`userMusic` 为 true 时不输出内置音效，只在 `clickWithUserMusic` 为 true 时每拍输出 `{ sound: 'tick', gain: 0.3, rate: 1 }`；口令始终输出

**节奏型（`hitsForEvent`，小节位置 = `beatInStep % 4`）：**

| 情况 | 输出 |
|---|---|
| guichu，work | 每拍 `kick` 1.0 |
| guangchang，work | 小节位置 0、2 为 `kick` 1.0；1、3 为 `snare` 0.8 |
| muyu，work | 每拍 `muyu` 0.5；小节位置 0 加 `bass` 0.6 |
| work 且 `isRepEnd` | 再加重音：guichu 为 `duang`，guangchang 为 `gong`，muyu 为 `muyu`，gain 1.0 |
| work 且 `repsLeft ≤ 3` | 所有 hit 的 `rate = 2 ** ((4 − repsLeft) / 12)`；`repsLeft ≤ 3` 时加 `hat` 0.5，`≤ 2` 时加 `snare` 0.6，`= 1` 时加 `bass` 0.7（同一音色已存在时不重复添加） |
| rest、prepare，`beatsLeftInStep ≤ 3` | 只输出 `tick` 1.0 |
| rest、prepare 的其他拍 | 只输出 `hat` 0.3 |

`quack` 不在节奏型中使用，保留给后续风格。

**口令（`voiceForEvent`，按优先级取第一个命中）：**
1. rest、prepare 且 `beatsLeftInStep` 为 3、2、1 → `n3`、`n2`、`n1`
2. rest 且 `beatInStep === 0` → `rest`
3. work 且 `beatInStep === 0` → side 为 `right` 时 `switch`，否则 `start`
4. work、`isRepEnd` 且 `repsLeft === 1` → `hey`
5. work、`isRepEnd` → `n{repIndex+1}`（大于 20 时为 null）
6. work、`beatInRep === 0` 且 `repsLeft === 3` → `last3`
7. 其他 → null

`done` 不由节拍触发，由 Task 9 的引擎在训练结束时播放。

- [ ] **Step 1: 写失败测试**：测试文件里定义两个 `BeatEvent` 字面量作为基准：`workEvent`（kind `work`、segment `main`、side null、beatInStep 5、beatsLeftInStep 27、repIndex 1、beatInRep 1、isRepEnd false、repsLeft 7）和 `restEvent`（kind `rest`、beatInStep 1、beatsLeftInStep 6，其余 rep 字段为 0 或 false）。上面两张表的每一行至少各写一个用例。关键断言：

```ts
it('beats are evenly spaced and cover each work step', () => {
  const w = steps.find(s => s.kind === 'work')!
  const ev = beatEventsInWindow(steps, plan, w.start, w.end)
  expect(ev).toHaveLength(w.reps * w.beatsPerRep)
  expect(ev.filter(e => e.isRepEnd)).toHaveLength(w.reps)
})
it('window is half-open with no duplicates across consecutive windows', () => {
  const a = beatEventsInWindow(steps, plan, 0, 10), b = beatEventsInWindow(steps, plan, 10, 20)
  expect(beatEventsInWindow(steps, plan, 0, 20)).toEqual([...a, ...b])
})
it('last rep pitches up three semitones and stacks layers', () => {
  const hits = hitsForEvent({ ...workEvent, repsLeft: 1, isRepEnd: true }, 'guichu')
  expect(hits.map(h => h.sound).sort()).toEqual(['bass', 'duang', 'hat', 'kick', 'snare'])
  hits.forEach(h => expect(h.rate).toBeCloseTo(2 ** (3 / 12)))
})
it('voice priorities', () => {
  expect(voiceForEvent({ ...restEvent, beatsLeftInStep: 2 })).toBe('n2')
  expect(voiceForEvent({ ...workEvent, beatInStep: 0, side: 'right' })).toBe('switch')
  expect(voiceForEvent({ ...workEvent, isRepEnd: true, repsLeft: 1 })).toBe('hey')
  expect(voiceForEvent({ ...workEvent, isRepEnd: true, repIndex: 4, repsLeft: 5 })).toBe('n5')
  expect(voiceForEvent({ ...workEvent, beatInRep: 0, beatInStep: 8, repsLeft: 3 })).toBe('last3')
})
it('user music mode keeps voices and only clicks when enabled', () => {
  const off = scheduleWindow(steps, plan, 0, 30, { mainStyle: 'guichu', userMusic: true, clickWithUserMusic: false })
  expect(off.hits).toHaveLength(0); expect(off.voices.length).toBeGreaterThan(0)
  const on = scheduleWindow(steps, plan, 0, 30, { mainStyle: 'guichu', userMusic: true, clickWithUserMusic: true })
  expect(on.hits.every(h => h.sound === 'tick' && h.gain === 0.3)).toBe(true)
})
it('VOICE_IDS has 26 entries', () => { expect(VOICE_IDS).toHaveLength(26) })
```

- [ ] **Step 2: 运行确认失败** — Run: `npx vitest run tests/beat`，Expected: FAIL
- [ ] **Step 3: 实现四个文件**
- [ ] **Step 4: 运行确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — `git add -A && git commit -m "feat: add beat events, patterns, voice cues and scheduling"`

---

### Task 9: 音频引擎

**Files:**
- Create: `src/audio/synth.ts`、`src/audio/userMusic.ts`、`src/audio/engine.ts`
- Create: `public/assets/audio/silence.mp3`（1 秒静音）、`public/assets/voice/README.md`
- Test: `tests/audio/userMusic.test.ts`、`tests/audio/synth.test.ts`

**Interfaces:**
- Consumes: `scheduleWindow`、`SoundId`、`StyleId`、`VoiceId`、`VOICE_IDS`（Task 8），`TrainingSession`（Task 7），`Step`、`timelineEnd`（Task 6），`Plan`（Task 3），`VOICE_URL`（Task 1）
- Produces:
  - `interface SoundRecipe { readonly duration: number; render(ctx: OfflineAudioContext): void }`
  - `SOUND_RECIPES: Record<SoundId, SoundRecipe>`
  - `renderSounds(sampleRate?: number): Promise<Record<SoundId, AudioBuffer>>`：每个音色用一个 `OfflineAudioContext` 渲染，默认采样率 44100
  - `decodeUserMusic(ctx: BaseAudioContext, blob: Blob): Promise<{ ok: true; buffer: AudioBuffer } | { ok: false; error: 'decode' }>`
  - `DUCK_GAIN = 0.398`、`LOOKAHEAD_SECONDS = 0.1`、`TICK_MS = 25`
  - `class AudioEngine`
    - `constructor(ctx: AudioContext)`
    - `init(): Promise<void>`：渲染音色、加载 26 个口令；单个口令加载失败只 `console.warn` 并跳过，不影响训练
    - `unlock(): Promise<void>`：调用 `ctx.resume()`，并循环播放一个 `src` 为 `silence.mp3` 的 `<audio>` 元素（应对 iOS 静音键）；必须在用户点击的事件处理中调用
    - `run(session: TrainingSession, steps: readonly Step[], plan: Plan, opts: { mainStyle: StyleId; userMusic: AudioBuffer | null; clickWithUserMusic: boolean }): void`
    - `stop(): void`、`setVolume(v: number): void`（0 到 1）
    - `onDone(listener: () => void): () => void`

**音色配方（设计取舍，参数由实现者试听后微调，每个不超过 1.5 秒）：** `kick` 为正弦波，0.12 秒内从 150Hz 降到 45Hz，加指数衰减；`snare` 为带通白噪声；`hat` 为 7kHz 高通噪声，0.05 秒；`bass` 为 55Hz 锯齿波加低通；`duang` 为正弦波，0.4 秒内从 200Hz 升到 600Hz 再回落，带颤音；`muyu` 为 800Hz 与 1250Hz 两个短促正弦叠加；`gong` 为 5 个非整数倍泛音，1.5 秒衰减；`quack` 为 300Hz 方波，经过两个共振峰带通；`tick` 为 1500Hz 正弦，0.03 秒。

**`run` 的循环：**
- 每 `TICK_MS` 执行一次：计算 `scheduleWindow(steps, plan, lastTo, session.time() + LOOKAHEAD_SECONDS × rate, opts)`，然后把 `lastTo` 推进到窗口末尾。每个 hit 和口令在 `session.clockTimeOf(time)` 时刻启动一个 `AudioBufferSourceNode`，hit 设置 `playbackRate`。
- 总线结构：音效与用户音乐走 `musicGain`，口令走 `voiceGain`，两者汇入 `masterGain`。
- 每个口令开始时，`musicGain` 在该时刻设为 `DUCK_GAIN`；口令结束时，用 0.1 秒线性恢复到 1。
- 暂停时不排程，停止用户音乐源并记住播放位置；恢复时从该位置继续。
- `session.onJump` 触发时，把 `lastTo` 重置为 `session.time()`。
- `session.time()` 达到 `timelineEnd(steps)` 时，播放 `done` 口令并通知 `onDone`。

- [ ] **Step 1: 写失败测试**

```ts
it('returns decode error for non-audio blobs (Review Focus 5)', async () => {
  const ctx = { decodeAudioData: vi.fn().mockRejectedValue(new DOMException('bad')) } as unknown as BaseAudioContext
  expect(await decodeUserMusic(ctx, new Blob(['not audio']))).toEqual({ ok: false, error: 'decode' })
})
it('returns buffer on success', async () => {
  const buf = {} as AudioBuffer
  const ctx = { decodeAudioData: vi.fn().mockResolvedValue(buf) } as unknown as BaseAudioContext
  expect(await decodeUserMusic(ctx, new Blob(['x']))).toEqual({ ok: true, buffer: buf })
})
it('has a recipe for every SoundId lasting at most 1.5s', () => {
  const ids: SoundId[] = ['kick', 'snare', 'hat', 'bass', 'duang', 'muyu', 'gong', 'quack', 'tick']
  ids.forEach(id => expect(SOUND_RECIPES[id].duration).toBeLessThanOrEqual(1.5))
})
```

- [ ] **Step 2: 运行确认失败** — Run: `npx vitest run tests/audio`，Expected: FAIL
- [ ] **Step 3: 实现三个文件**；写 `voice/README.md`，列出 `VOICE_IDS` 与要录的文本：`n1`-`n20` 读"一"到"二十"，`start` 读"开始"，`switch` 读"换边"，`rest` 读"休息一下"，`last3` 读"最后三次"，`done` 读"完成，太棒了"，`hey` 读"嘿！"。
- [ ] **Step 4: 运行确认通过** — Expected: PASS
- [ ] **Step 5: 手动试听**：在 `src/main.tsx` 临时挂一个按钮，点击后依次调用 `unlock`、`init`，再用一个固定方案调用 `run`。确认：三种风格都听得到；最后三次音调升高；口令响起时音乐变小。确认后撤掉临时按钮。
- [ ] **Step 6: 提交** — `git add -A && git commit -m "feat: add synthesized audio engine"`

> 口令 mp3 由你按设计文档第 14.2 节选定可商用 TTS 后生成，放入 `public/assets/voice/`。在此之前引擎会跳过缺失的口令，其余功能不受影响。

---

### Task 10: 本地存储

**Files:**
- Create: `src/storage/storage.ts`
- Test: `tests/storage/storage.test.ts`（文件开头 `import 'fake-indexeddb/auto'`）

**Interfaces:**
- Consumes: `Plan`（Task 3），`StyleId`（Task 8）
- Produces:
  - `interface Settings { readonly mainStyle: StyleId; readonly volume: number; readonly mirror: boolean; readonly disclaimerAccepted: boolean; readonly clickWithUserMusic: boolean; readonly useUserMusic: boolean }`
  - `DEFAULT_SETTINGS: Settings = { mainStyle: 'guichu', volume: 0.8, mirror: true, disclaimerAccepted: false, clickWithUserMusic: false, useUserMusic: false }`
  - `interface WorkoutRecord { readonly id: string; readonly date: string; readonly plan: Plan; readonly completedItems: readonly boolean[]; readonly actualSeconds: number }`（`date` 为 ISO 8601 字符串，如 `2026-11-06T08:30:00.000Z`）
  - `type StoreResult<T> = { ok: true; value: T } | { ok: false }`
  - `loadSettings(): Promise<Settings>`：读取失败或缺字段时与 `DEFAULT_SETTINGS` 合并
  - `saveSettings(s: Settings): Promise<StoreResult<void>>`
  - `appendRecord(r: WorkoutRecord): Promise<StoreResult<void>>`
  - `listRecords(): Promise<StoreResult<readonly WorkoutRecord[]>>`：按日期倒序
  - `saveUserMusic(blob: Blob, name: string): Promise<StoreResult<void>>`、`loadUserMusic(): Promise<{ blob: Blob; name: string } | null>`

所有函数在内部捕获异常、用 `console.error` 记录详细信息，不向外抛出。使用 `idb-keyval` 的自定义 store `createStore('moxing-fitness', 'kv')`，键名为 `settings`、`records`、`userMusic`。

- [ ] **Step 1: 写失败测试**

```ts
it('round-trips settings and fills defaults', async () => {
  await saveSettings({ ...DEFAULT_SETTINGS, volume: 0.3 })
  expect(await loadSettings()).toEqual({ ...DEFAULT_SETTINGS, volume: 0.3 })
})
it('lists records newest first', async () => {
  await appendRecord(rec('2026-11-01T10:00:00.000Z')); await appendRecord(rec('2026-11-05T10:00:00.000Z'))
  const r = await listRecords()
  expect(r.ok && r.value.map(x => x.date)).toEqual(['2026-11-05T10:00:00.000Z', '2026-11-01T10:00:00.000Z'])
})
it('reports failure instead of throwing when IndexedDB is unavailable', async () => {
  vi.spyOn(idb, 'set').mockRejectedValueOnce(new Error('blocked'))
  expect(await appendRecord(rec('2026-11-06T00:00:00.000Z'))).toEqual({ ok: false })
  vi.spyOn(idb, 'get').mockRejectedValueOnce(new Error('blocked'))
  expect(await loadSettings()).toEqual(DEFAULT_SETTINGS)
})
```

（`idb` 为 `import * as idb from 'idb-keyval'`；`rec(date)` 用 fixture 方案构造一条记录。）

- [ ] **Step 2: 运行确认失败** — Expected: FAIL
- [ ] **Step 3: 实现**
- [ ] **Step 4: 运行确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — `git add -A && git commit -m "feat: add local storage for settings and records"`

---

### Task 11: 3D 舞台

**Files:**
- Create: `src/stage/pose.ts`、`src/stage/webgl.ts`、`src/stage/Stage.tsx`
- Test: `tests/stage/pose.test.ts`

**Interfaces:**
- Consumes: `TrainingState`、`stateAt`、`Step`（Task 6），`TrainingSession`（Task 7），`Exercise`、`IDLE_CLIP`、`MODEL_URL`、`THUMB_URL`（Task 1、5），`Plan`（Task 3）
- Produces:
  - `CROSSFADE_SECONDS = 0.3`
  - `interface Pose { readonly clip: string; readonly clipTime: number }`
  - `computePose(state: TrainingState, t: number, clipOf: (itemIndex: number) => { clip: string; clipSeconds: number }, idleSeconds: number): Pose`：work 时 `clipTime = repProgress × clipSeconds`；rest、prepare 时为 `IDLE_CLIP`，`clipTime = t mod idleSeconds`
  - `blendWeight(t: number, switchedAt: number): number` = `min(1, (t − switchedAt) / 0.3)`
  - `hasWebGL(): boolean`
  - `type CameraPreset = 'threeQuarter' | 'front' | 'side'`，`CAMERA_POSITIONS: Record<CameraPreset, [number, number, number]>` = `{ threeQuarter: [2.2, 1.4, 2.6], front: [0, 1.2, 3.2], side: [3.2, 1.2, 0] }`，观察点为 `[0, 0.9, 0]`
  - 组件 `Stage`，props：`{ session: TrainingSession; steps: readonly Step[]; plan: Plan; catalog: readonly Exercise[]; mirror: boolean; preset: CameraPreset }`

**Stage 的行为：**
- `Canvas` 设置 `dpr={[1, 2]}`；`OrbitControls` 只允许旋转；地面用 `ContactShadows`；相机位置随 `preset` 变化。
- 每帧（`useFrame`）：取 `t = session.time()`，算 `state = stateAt(steps, t)` 和 `pose = computePose(…)`；把当前片段 `AnimationAction` 的 `time` 设为 `pose.clipTime`；片段切换时记录 `switchedAt`，旧片段权重设为 `1 − w`、新片段设为 `w`（`w = blendWeight`）；最后调用 `mixer.update(0)`。不使用 `delta`，暂停时画面自然停住。
- `mirror` 为 true 时模型 `scale.x = -1`。
- `hasWebGL()` 为 false 时不渲染 Canvas，改为显示当前动作的 `<img src={THUMB_URL(clip)}>`。
- 模型加载失败：ErrorBoundary 先自动重试一次（`useGLTF.clear(MODEL_URL)` 后重新挂载）；再失败则显示"网络不佳，3D 模型加载失败"和"重试"按钮。

- [ ] **Step 1: 写失败测试**

```ts
it('work pose follows rep progress', () => {
  const st = { ...workState, repProgress: 0.25 }
  expect(computePose(st, 0, () => ({ clip: 'Squat', clipSeconds: 2 }), 3)).toEqual({ clip: 'Squat', clipTime: 0.5 })
})
it('rest pose loops idle', () => {
  expect(computePose(restState, 7, () => ({ clip: 'X', clipSeconds: 2 }), 3)).toEqual({ clip: IDLE_CLIP, clipTime: 1 })
})
it('blend weight ramps over 0.3s', () => {
  expect(blendWeight(10.15, 10)).toBeCloseTo(0.5); expect(blendWeight(11, 10)).toBe(1)
})
```

（`workState`、`restState` 由 fixture 方案的时间线经 `stateAt` 得到。）

- [ ] **Step 2: 运行确认失败** — Expected: FAIL
- [ ] **Step 3: 实现 `pose.ts`、`webgl.ts`、`Stage.tsx`**
- [ ] **Step 4: 运行确认通过** — Expected: PASS
- [ ] **Step 5: 手动检查**：`npm run dev`，在临时页面挂 `Stage` 并播放一个固定方案。确认动作与节拍对齐、切换动作时平滑、镜像生效。在 Chrome 开发者工具中开启 4 倍 CPU 降速，帧率保持在 30 以上。
- [ ] **Step 6: 提交** — `git add -A && git commit -m "feat: add 3D stage driven by session time"`

---

### Task 12: 页面与流程

**Files:**
- Create: `src/ui/store.ts`、`src/ui/format.ts`、`src/ui/pages/{Home,Preview,Training,Done}.tsx`、`src/ui/components/{Disclaimer,SettingsSheet,About}.tsx`、`src/App.tsx`
- Modify: `src/main.tsx`
- Test: `tests/ui/format.test.ts`、`tests/ui/Home.test.tsx`、`tests/ui/Preview.test.tsx`

**Interfaces:**
- Consumes: 前面所有任务
- Produces:
  - `formatDuration(seconds: number): string`（`mm:ss`，四舍五入到秒）
  - `repsLabel(reps: number, sided: boolean): string`（`'8 次'` 或 `'左右各 8 次'`）
  - `type Page = 'home' | 'preview' | 'training' | 'done'`
  - `useAppStore`（zustand），状态：`page`、`catalog`、`settings`、`input`、`plan`、`lastResult: { record: WorkoutRecord; saved: boolean } | null`；动作：`setInput`、`generate()`（`seed = Date.now() % 2 ** 31`）、`regenerate()`（`seed + 1`）、`replace(index, exercise)`、`remove(index)`、`startTraining()`、`finishTraining(session: TrainingSession)`（生成 `crypto.randomUUID()` 作为 id、`new Date().toISOString()` 作为日期，`completedItems[i] = !session.skippedItems().has(i)`，`actualSeconds = session.activeSeconds()`，调用 `appendRecord`）、`updateSettings(patch)`（同时调用 `saveSettings`）、`go(page)`

**固定文案：**
- 免责声明：`本应用提供的动作仅供一般健身参考，不构成医疗建议。如有心血管疾病、关节损伤、怀孕或其他健康问题，请先咨询医生。训练中如感到疼痛、头晕或不适，请立即停止。` 按钮：`我已了解并同意`
- 不足提示：`可选动作不足，本方案约 {mm:ss}。可以增加部位或缩短时长。`
- 后台暂停：`已暂停，点击继续`
- 保存失败：`本次记录无法保存`
- 自选音乐解码失败：`此文件格式不支持`
- 按钮与标签：时长 `5 分钟` 等；难度 `入门`、`进阶`、`挑战`；分段 `热身`、`主训`、`拉伸`；`生成方案`、`换一套`、`开始训练`、`替换`、`删除`、`预计 {mm:ss}`、`暂停`、`继续`、`上一个`、`跳过`、`正面`、`侧面`、`再练一次`、`设置`、`关于`

**页面要点：**
- **Home**：6 个部位多选、5 个时长单选、3 个难度单选；至少选中一个部位时"生成方案"才可点。未同意免责声明时先弹出 `Disclaimer`。右上角"设置"打开 `SettingsSheet`，内含：主训风格、音量、镜像、自选音乐开关与选文件、点击音开关、"关于"入口。
- **Preview**：按三段分组，每行显示动作名、`repsLabel`、禁忌；"替换"按钮在候选为空时禁用，点开为候选列表；"删除"按钮在只剩 1 个动作时禁用；显示"预计 mm:ss"；`shortfallSeconds > 0` 时显示不足提示；底部为"换一套"和"开始训练"。
- **Training**："开始训练"的点击处理中同步调用 `engine.unlock()`，然后 `init` 并 `run`。上方约 60% 为 `Stage`，带"正面""侧面"按钮切换相机（默认 `threeQuarter`）；下方为动作名、次数（分左右时加"左侧"或"右侧"）、进度条、每次动作轮换一条要点、禁忌；控制按钮为暂停/继续、上一个、跳过、音量、风格切换。rest 时显示下一个动作的名称和缩略图。`visibilitychange` 变为 hidden 时暂停并显示后台暂停文案。`settings.useUserMusic` 为 true 时从 `loadUserMusic` 取文件并解码，失败时显示 toast 并以内置风格训练。URL 带 `speed` 参数且 `import.meta.env.VITE_ALLOW_SPEED === 'true'` 时，把它作为 `rate` 传给 `TrainingSession`。`onDone` 时调用 `finishTraining` 并进入完成页。
- **Done**：显示 `formatDuration(actualSeconds)` 和"完成 X / Y 个动作"；`lastResult.saved` 为 false 时显示保存失败文案；"再练一次"回到首页。
- **About**：desk-break 的 MIT 版权声明与来源链接。

- [ ] **Step 1: 写失败测试**

```ts
it('formats durations and reps', () => {
  expect(formatDuration(65.4)).toBe('01:05')
  expect(repsLabel(8, true)).toBe('左右各 8 次'); expect(repsLabel(8, false)).toBe('8 次')
})
it('Home disables generate until a part is chosen', async () => {
  render(<Home />)
  expect(screen.getByRole('button', { name: '生成方案' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: '腰腹' }))
  expect(screen.getByRole('button', { name: '生成方案' })).toBeEnabled()
})
it('Preview disables delete with one item but keeps start enabled (Review Focus 4)', () => {
  // 把 store 的 plan 设为只含 1 个动作的方案后渲染 Preview
  expect(screen.getByRole('button', { name: '删除' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '开始训练' })).toBeEnabled()
})
it('Preview shows shortfall notice', () => {
  // plan.shortfallSeconds = 120
  expect(screen.getByText(/可选动作不足/)).toBeInTheDocument()
})
```

（另装 `@testing-library/user-event`、`@testing-library/jest-dom`。）

- [ ] **Step 2: 运行确认失败** — Expected: FAIL
- [ ] **Step 3: 实现 store、format、页面和组件**（页面组件内不直接调用 `Date` 或 `Math.random`，需要时通过 store 动作取得）
- [ ] **Step 4: 运行确认通过** — Run: `npx vitest run`，Expected：全部 PASS
- [ ] **Step 5: 手动走一遍**：`npm run dev`，在手机尺寸视口完成：选择 → 预览（替换、删除、换一套）→ 训练（暂停、跳过、上一个、切到后台再回来、切换正面侧面）→ 完成。
- [ ] **Step 6: 提交** — `git add -A && git commit -m "feat: add pages and app flow"`

---

### Task 13: PWA、端到端测试与真机清单

**Files:**
- Modify: `vite.config.ts`（加入 `VitePWA` 和覆盖率阈值）、`package.json`（加 `"build:e2e": "vite build --mode e2e"`）
- Create: `.env.e2e`（`VITE_ALLOW_SPEED=true`）、`public/assets/icons/icon-192.png`、`public/assets/icons/icon-512.png`、`playwright.config.ts`、`e2e/workout.spec.ts`、`docs/device-test-checklist.md`

**Interfaces:**
- Consumes: 完整应用

**配置值：**
- `VitePWA({ registerType: 'autoUpdate', manifest: { name: '魔性健身', short_name: '魔性健身', display: 'standalone', theme_color: '#111111', background_color: '#111111', icons: [{ src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' }] }, workbox: { globPatterns: ['**/*.{js,css,html,json,glb,png,mp3,svg}'], maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, clientsClaim: true, skipWaiting: true } })`
- Playwright：单个 project，`devices['Pixel 7']`；`webServer.command` 为 `npm run build:e2e && npx vite preview --port 4173`，`baseURL` 为 `http://localhost:4173`
- 覆盖率阈值：`src/planner/**`、`src/player/**`、`src/beat/**` 的 lines、branches、functions 均为 80

- [ ] **Step 1: 写 E2E 测试 `e2e/workout.spec.ts`**

```ts
async function runWorkout(page: Page) {
  await page.getByRole('button', { name: '腰腹' }).click()
  await page.getByRole('button', { name: '5 分钟' }).click()
  await page.getByRole('button', { name: '生成方案' }).click()
  await expect(page.getByText(/预计/)).toBeVisible({ timeout: 3000 })
  await page.getByRole('button', { name: '开始训练' }).click()
  await expect(page.getByText(/完成 \d+ \/ \d+ 个动作/)).toBeVisible({ timeout: 30000 })
}
test('select, preview, train, finish, record', async ({ page }) => {
  await page.goto('/?speed=60')
  await page.getByRole('button', { name: '我已了解并同意' }).click()
  await runWorkout(page)
  await expect(page.getByText('本次记录无法保存')).toHaveCount(0)
})
test('works offline after first visit', async ({ page, context }) => {
  await page.goto('/?speed=60')
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: '我已了解并同意' }).click()
  await runWorkout(page)
})
```

- [ ] **Step 2: 运行确认失败** — Run: `npm run e2e`，Expected：离线用例 FAIL（尚未配置 PWA）
- [ ] **Step 3: 配置 PWA、生成图标、配置覆盖率阈值**
- [ ] **Step 4: 运行全部检查**

Run: `npm run coverage && npm run validate:catalog && npm run e2e`
Expected：单元测试全部 PASS 且覆盖率达标；校验无输出；两个 E2E 用例 PASS。

- [ ] **Step 5: 写 `docs/device-test-checklist.md`**：对 iPhone Safari（开启静音键）、中端安卓 Chrome、微信内置浏览器三种环境，逐项列出可勾选的检查：4G 网络下首次加载 5 秒内显示 3D 人物；选择后 3 秒内出方案；节拍与动作对齐；口令时音乐变小；锁屏或切后台后自动暂停、回来可继续；自选音乐可用；断网后可完整训练一套；动画流畅无明显卡顿。
- [ ] **Step 6: 提交** — `git add -A && git commit -m "feat: add PWA offline support and e2e tests"`
