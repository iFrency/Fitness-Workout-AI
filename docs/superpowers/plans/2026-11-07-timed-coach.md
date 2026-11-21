# 按时间计与魔性语音教练 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把练习量从"按次数、逐次报数"改为"按时间计、多轮循环"，并用一张预先算好、不重叠的播报清单驱动魔性语音教练。

**Architecture:** 方案仍然把秒数换算成整数次，所以节拍、动画、会话的核心逻辑基本不变；时间线新增 `switch` 换边步骤，开场准备改为 8 秒。新增 `src/coach/`：`phrases.ts` 是唯一的语句来源（App 和生成脚本共用），`cues.ts` 用纯函数一次性生成整场的播报清单（`Cue[]`），并按优先级和时间窗口排程。音频引擎只负责按清单播放，原来逐次报数的 `voiceCues.ts` 删除。

**Tech Stack:** 沿用现有技术栈（Vite、React、TypeScript、R3F、zustand、Vitest、Playwright）；语音由豆包 seed-tts-2.0（Vivi 2.0）在构建时生成。

**Spec:** `docs/superpowers/specs/2026-11-07-timed-coach-design.md`（在已实现的 MVP 之上修改，MVP 设计见 `docs/superpowers/specs/2026-11-06-fitness-workout-mvp-design.md`）

## Global Constraints

- 时长：热身 30 秒；主训入门/进阶/挑战 30/40/45 秒；拉伸每侧 30 秒；休息 20/15/10 秒；换边 5 秒；开场准备 8 秒。休息、换边、准备都向上取整到整小节（4 拍，按下一个动作的 BPM）。
- `reps = max(1, round(目标秒数 / repSeconds(beatsPerRep, bpm)))`；界面和语音一律使用实际秒数 `reps × repSeconds`。
- 主训轮数取 1、2、3 中使"轮数 × 一轮时长"最接近主训预算的值；各轮动作顺序相同。
- 总时长目标误差 ±30 秒；凑整顺序：最后一轮从末尾去掉动作（至少留 1 个），再把最后一个主训动作的 `workSeconds` 调整到该档位时长的 50% 到 150%；3 轮仍不足时才给 `shortfallSeconds`。
- 播报排程：优先级从高到低，同优先级按 `earliest`；放在不早于 `earliest`、且与已放置播报至少间隔 0.15 秒的最早时刻；晚于 `latest` 则放弃；固定时刻播报 `latest = earliest`；默认 `latest = earliest + 4`；任何播报的结束时刻不得晚于下一段倒数（`n3` 或 `n5`）的开始时刻。
- 优先级：倒数 5；开始、换边、完成、全部完成 4；准备、下一个、轮次 3；动作要点、休息语 2；过半、快完成 1。
- 倒数按真实秒数播放，不对齐节拍；随机抽取使用方案的 `seed`；同一步骤内同一条语句不重复。
- 语音文件 id 只含小写字母、数字和连字符；清单 `public/assets/voice/manifest.json` 的格式为 `{ "<id>": 时长秒数 }`。
- 安全类内容（`caution`）保持专业措辞。
- 沿用 MVP 的约束：中文界面、无 emoji、不可变数据、文件不超过 400 行、函数不超过 50 行；API key 只通过环境变量传入，不写入任何文件。

## Review Focus

1. **挑战档 10 秒休息时，"下一个，<长动作名>"加上"三，二，一"放不下**：下一个动作名应被放弃或提前结束，绝不能与倒数重叠。测试在 Task 5。
2. **分左右的拉伸（每侧 30 秒）**：换边步骤内有"三，二，一"；在换边时按"跳过"直接开始右侧；右侧不播动作要点。测试在 Task 3、Task 5。
3. **动作要点语音很长（3 秒以上）**，同时动作只有 30 秒：要点不得与过半鼓励重叠，优先级低的被放弃。测试在 Task 5。
4. **替换第 2 轮里的动作**：保持 `round` 和 `workSeconds`；删除第 1 轮的动作不影响第 2 轮的同名动作。测试在 Task 2。
5. **清单缺少部分语音，或清单整体加载失败**：缺的播报跳过，训练照常，不抛异常。测试在 Task 5、Task 6。

---

## File Structure

```
src/planner/timing.ts        + WORK_SECONDS / SWITCH_SECONDS / PREPARE_SECONDS / workSecondsFor / repsForSeconds
src/planner/types.ts         PlanItem + round, workSeconds；Plan + rounds
src/planner/generatePlan.ts  按秒换算、主训多轮、新的凑整规则
src/planner/editPlan.ts      替换保持 round / workSeconds
src/player/timeline.ts       StepKind + 'switch'；准备 8 秒
src/player/session.ts        skip 把 switch 视同休息
src/coach/phrases.ts         新：语句库与动作语句 id
src/coach/cues.ts            新：buildCueSheet + placeCues
src/beat/voiceCues.ts        删除
src/beat/schedule.ts         语音改为从播报清单读取
src/audio/engine.ts          加载 manifest，run 接收播报清单
scripts/mp3.ts               新：mp3Duration
scripts/gen-voice.ts         从 phrases + catalog 生成全部语音与 manifest
src/ui/format.ts             + secondsLabel
src/ui/pages/Preview.tsx     秒数显示、按轮分组
src/ui/pages/Training.tsx    秒数倒计时、休息与换边面板
src/ui/useTrainingRun.ts     生成播报清单并传给引擎
```

---

### Task 1: 时长常量与秒数换算

**Files:**
- Modify: `src/planner/timing.ts`
- Test: `tests/planner/timing.test.ts`

**Interfaces:**
- Produces:
  - `WORK_SECONDS: Readonly<Record<SegmentType, Readonly<Record<Level, number>>>>` = `{ warmup: {1:30,2:30,3:30}, main: {1:30,2:40,3:45}, stretch: {1:30,2:30,3:30} }`
  - `SWITCH_SECONDS = 5`、`PREPARE_SECONDS = 8`
  - `workSecondsFor(segment: SegmentType, level: Level): number`
  - `repsForSeconds(seconds: number, beatsPerRep: number, bpm: number): number`
  - `barsCeil(seconds: number, bpm: number): number`（向上取整到整小节，供休息、换边、准备共用；`restSeconds` 改为调用它）

- [ ] **Step 1: 写失败测试**

```ts
it('work seconds table', () => {
  expect(workSecondsFor('main', 1)).toBe(30)
  expect(workSecondsFor('main', 3)).toBe(45)
  expect(workSecondsFor('stretch', 3)).toBe(30)
})
it('repsForSeconds rounds to whole reps with a minimum of 1', () => {
  expect(repsForSeconds(30, 4, 120)).toBe(15)   // rep = 2s
  expect(repsForSeconds(30, 4, 110)).toBe(14)   // rep ≈ 2.18s → 13.75
  expect(repsForSeconds(0.5, 4, 120)).toBe(1)
})
it('barsCeil rounds up to whole bars', () => {
  expect(barsCeil(5, 120)).toBeCloseTo(6)       // bar = 2s
  expect(barsCeil(8, 100)).toBeCloseTo(9.6)     // bar = 2.4s
})
```

- [ ] **Step 2: 运行确认失败** — Run: `npx vitest run tests/planner/timing.test.ts`，Expected: FAIL
- [ ] **Step 3: 实现**
- [ ] **Step 4: 运行确认通过**，并运行 `npx vitest run` 确认原有测试仍然通过 — Expected: PASS
- [ ] **Step 5: 提交** — `git commit -am "feat: add timed work durations"`

---

### Task 2: 方案按秒换算、多轮循环与编辑

**Files:**
- Modify: `src/planner/types.ts`、`src/planner/generatePlan.ts`、`src/planner/editPlan.ts`
- Test: `tests/planner/generatePlan.test.ts`、`tests/planner/editPlan.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces:
  - `PlanItem` 新增 `readonly round: number`（从 1 开始；热身、拉伸为 1）、`readonly workSeconds: number`（目标秒数）
  - `Plan` 新增 `readonly rounds: number`
  - `itemActualSeconds(item: PlanItem): number` = `reps × repSeconds`，分左右时乘 2（不含换边）
  - `computeTotal` 改为：每个动作的 `restBeforeSeconds + itemActualSeconds`，分左右的动作再加 `barsCeil(SWITCH_SECONDS, bpm)`
  - 签名不变：`generatePlan`、`replaceItem`、`removeItem`、`replacementCandidates`

**算法补充（规格之外由此确定）：**
- 热身、拉伸：沿用现有的 `pickSegment`，但成本改用 `workSecondsFor` 换算的次数。
- 主训：用 `pickSegment` 挑出一轮（预算仍为主训预算），然后复制成 `rounds` 轮。每轮第一个动作之前也有休息（第 1 轮的第一个动作紧接热身，同样有休息）。
- 凑整按 Global Constraints 的顺序；调整 `workSeconds` 时重新计算 `reps`。
- 原有的"次数范围 4 到 `defaultReps × 2`"规则作废。

- [ ] **Step 1: 更新与新增测试**

替换 `generatePlan.test.ts` 中已不成立的断言：把"reps within bounds"改为下面第 2 个测试，把"no duplicates"改为"同一轮内不重复"。新增：

```ts
it.each([1, 2, 3] as const)('level %i: every combination of minutes lands within ±30s or reports shortfall at 3 rounds', level => {
  for (const minutes of [5, 10, 15, 20, 30] as const) {
    for (const parts of [['全身'], ['腰腹'], ['肩颈', '臀腿']] as Part[][]) {
      const p = generatePlan({ parts, minutes, level }, fixtureCatalog, 7)
      const ok = Math.abs(p.totalSeconds - minutes * 60) <= 30 || (p.rounds === 3 && p.shortfallSeconds > 0)
      expect(ok, `${level} ${minutes} ${parts}`).toBe(true)
    }
  }
})
it('work items run for the level duration within one rep', () => {
  const p = generatePlan({ parts: ['全身'], minutes: 15, level: 2 }, fixtureCatalog, 1)
  const lastMain = p.items.map(i => i.segment).lastIndexOf('main')
  p.items.forEach((it, i) => {
    if (i === lastMain) return
    const perSide = itemActualSeconds(it) / (it.sided ? 2 : 1)
    expect(Math.abs(perSide - workSecondsFor(it.segment, 2))).toBeLessThanOrEqual(repSeconds(it.beatsPerRep, it.bpm))
  })
})
it('narrow long request repeats the main circuit before reporting shortfall', () => {
  const p = generatePlan({ parts: ['肩颈'], minutes: 30, level: 1 }, fixtureCatalog, 1)
  expect(p.rounds).toBe(3)
  expect(p.items.filter(i => i.segment === 'main').map(i => i.round)).toContain(3)
})
it('no duplicate exercise within one round', () => {
  const p = generatePlan({ parts: ['全身'], minutes: 30, level: 3 }, fixtureCatalog, 5)
  for (let r = 1; r <= p.rounds; r++) {
    const ids = p.items.filter(i => i.round === r && i.segment === 'main').map(i => i.exerciseId)
    expect(new Set(ids).size).toBe(ids.length)
  }
})
```

在 `editPlan.test.ts` 中新增（Review Focus 4）：

```ts
it('replacing an item in round 2 keeps its round and work seconds', () => {
  const p = generatePlan({ parts: ['肩颈'], minutes: 30, level: 1 }, fixtureCatalog, 1)
  const i = p.items.findIndex(x => x.round === 2)
  const next = replaceItem(p, i, replacementCandidates(p, i, fixtureCatalog)[0])
  expect(next.items[i].round).toBe(2)
  expect(next.items[i].workSeconds).toBe(p.items[i].workSeconds)
})
it('removing a round-1 item leaves round 2 untouched', () => {
  const p = generatePlan({ parts: ['肩颈'], minutes: 30, level: 1 }, fixtureCatalog, 1)
  const i = p.items.findIndex(x => x.round === 1 && x.segment === 'main')
  const id = p.items[i].exerciseId
  const next = removeItem(p, i)
  expect(next.items.filter(x => x.round === 2 && x.exerciseId === id)).toHaveLength(1)
})
```

`replacementCandidates` 的"不在方案中"规则改为"不在同一轮中"。

- [ ] **Step 2: 运行确认失败** — Run: `npx vitest run tests/planner`，Expected: 新测试 FAIL
- [ ] **Step 3: 实现**
- [ ] **Step 4: 运行全部单元测试** — Run: `npx vitest run`。Expected: planner 测试 PASS。timeline、beat、ui 中依赖旧次数的断言，如果在此失败，按新规则就地修正，并在提交信息中注明。
- [ ] **Step 5: 用真实动作库做大规模检查**：写一个临时 tsx 脚本（放在 OS 临时目录，不提交），遍历 63 种部位组合 × 5 种时长 × 3 个档位 × 10 个 seed，统计异常数、空方案数，以及既超出 ±30 秒、又不是 3 轮带不足提示的方案数。Expected：三项都是 0。
- [ ] **Step 6: 提交** — `git commit -am "feat: timed plan items with repeated main rounds"`

---

### Task 3: 换边步骤与 8 秒准备

**Files:**
- Modify: `src/player/timeline.ts`、`src/player/session.ts`
- Test: `tests/player/timeline.test.ts`、`tests/player/session.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `barsCeil`、`SWITCH_SECONDS`、`PREPARE_SECONDS`
- Produces: `StepKind = 'prepare' | 'work' | 'rest' | 'switch'`；`switch` 步骤的 `itemIndex` 是所属动作，`side: null`，`reps: 0`

- [ ] **Step 1: 写失败测试**

```ts
it('prepare lasts PREPARE_SECONDS rounded to bars', () => {
  expect(steps[0].end).toBeCloseTo(barsCeil(8, plan.items[0].bpm))
})
it('sided items are left, switch, right', () => {
  const idx = plan.items.findIndex(i => i.sided)
  expect(steps.filter(s => s.itemIndex === idx && s.kind !== 'rest').map(s => s.kind + (s.side ?? '')))
    .toEqual(['workleft', 'switch', 'workright'])
})
it('total equals prepare plus plan total', () => {   // 保留原测试，使用新的 computeTotal
  expect(timelineEnd(steps)).toBeCloseTo(steps[0].end + plan.totalSeconds)
})
```

在 `session.test.ts` 中（Review Focus 2）：

```ts
it('skip during a switch starts the right side', () => {
  const sw = steps.find(s => s.kind === 'switch')!
  const c = fake(); const s = new TrainingSession(steps, c); s.start()
  c.advance(sw.start + 1); s.skip()
  const st = stateAt(steps, s.time())
  expect(st.step.kind).toBe('work'); expect(st.step.side).toBe('right'); expect(s.skippedItems().size).toBe(0)
})
```

- [ ] **Step 2: 运行确认失败** — Run: `npx vitest run tests/player`，Expected: FAIL
- [ ] **Step 3: 实现**：`skip` 在 `rest`、`prepare`、`switch` 中跳到"当前步骤之后的第一个 work 步骤"。
- [ ] **Step 4: 运行全部单元测试** — Expected: PASS（stage/pose 把 `switch` 视同休息，播放待机动画）
- [ ] **Step 5: 提交** — `git commit -am "feat: add side switch step and longer prepare"`

---

### Task 4: 语句库、mp3 时长与语音生成

**Files:**
- Create: `src/coach/phrases.ts`、`scripts/mp3.ts`
- Modify: `scripts/gen-voice.ts`
- Generate: `public/assets/voice/*.mp3`、`public/assets/voice/manifest.json`；删除不再使用的语音文件
- Test: `tests/coach/phrases.test.ts`、`tests/scripts/mp3.test.ts`

**Interfaces:**
- Produces:
  - `FIXED_PHRASES: Readonly<Record<string, string>>`：`ready`、`start`、`switch`、`round-2`、`round-3`、`finish`、`n1`…`n5`，文本严格按规格第 3.3 节，其中 `n1: '一，'`、`n2: '二！'`、`n3: '三！'`、`n4: '四！'`、`n5: '五，'`
  - `POOLS: Readonly<Record<'half' | 'last10' | 'done' | 'rest', readonly string[]>>`：每个元素是 id（如 `half-1`）
  - `POOL_TEXTS: Readonly<Record<string, string>>`：池中每个 id 对应的文本，按规格第 3.3 节逐字
  - `nextClipId(exerciseId: string): string` = `next-${exerciseId}`；`cueClipId(exerciseId: string, k: 0 | 1): string` = `cue-${exerciseId}-${k}`
  - `exercisePhrases(catalog: readonly Exercise[]): Record<string, string>`：`next-<id>` 为"下一个，<name>"；`cue-<id>-0` 为 `cues[0]`；`cue-<id>-1` 为 `cues[1] ?? caution`，两者都为空则不生成
  - `allPhrases(catalog): Record<string, string>` = 固定语句 + 语句池 + 动作语句
  - `mp3Duration(bytes: Uint8Array): number`（在 `scripts/mp3.ts`）：跳过 ID3v2 标签，逐帧累加；支持 MPEG1/2/2.5 Layer III；遇到无效的帧头就停止
  - `VOICE_MANIFEST_URL = '/assets/voice/manifest.json'`（加入 `src/catalog/constants.ts`）

- [ ] **Step 1: 写失败测试**

```ts
// phrases
it('pool texts follow the spec', () => {
  expect(POOLS.half).toHaveLength(8); expect(POOLS.last10).toHaveLength(6)
  expect(POOLS.done).toHaveLength(6); expect(POOLS.rest).toHaveLength(4)
  expect(POOL_TEXTS['half-1']).toBe('一半啦！腿还在吗？')
  expect(FIXED_PHRASES.finish).toBe('全部练完！今天的你超魔性！')
})
it('builds exercise phrases with safe ids', () => {
  const p = exercisePhrases([makeExercise({ id: 'mini-squat', name: '浅蹲', cues: ['双脚与肩同宽'], caution: '膝盖不要内扣' })])
  expect(p['next-mini-squat']).toBe('下一个，浅蹲')
  expect(p['cue-mini-squat-1']).toBe('膝盖不要内扣')
  Object.keys(allPhrases(fixtureCatalog)).forEach(id => expect(id).toMatch(/^[a-z0-9-]+$/))
})
// mp3
const frame = (header: number[], length: number) => { const f = new Uint8Array(length); f.set(header); return f }
it('measures MPEG1 Layer III frames', () => {
  const bytes = concat(Array.from({ length: 10 }, () => frame([0xff, 0xfb, 0x90, 0x64], 417)))
  expect(mp3Duration(bytes)).toBeCloseTo(10 * 1152 / 44100, 4)
})
it('measures MPEG2 Layer III 24kHz frames and skips ID3v2', () => {
  const id3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 10, ...new Array(10).fill(0)])
  const bytes = concat([id3, ...Array.from({ length: 10 }, () => frame([0xff, 0xf3, 0x44, 0xc4], 96))])
  expect(mp3Duration(bytes)).toBeCloseTo(10 * 576 / 24000, 4)
})
```

（`concat` 为测试内的辅助函数，用于拼接多个 `Uint8Array`。）

- [ ] **Step 2: 运行确认失败** — Expected: FAIL
- [ ] **Step 3: 实现 `phrases.ts`、`mp3.ts`；改写 `gen-voice.ts`**：
  - 读取 `exercises.json`，用 `allPhrases` 得到全部语句。
  - 已存在的文件默认跳过（`n1`–`n5` 因此沿用现有文件）；传 `--force` 时全部重新生成。
  - 对清单里每个 id 用 `mp3Duration` 写入 `manifest.json`。
  - 删除 `public/assets/voice/` 下不在清单中的 `.mp3`。
  - 移除旧的 `VOICE_TEXTS`；`tests/audio/audio.test.ts` 中对应的测试改为测 `allPhrases`。
- [ ] **Step 4: 运行确认通过** — Run: `npx vitest run`，Expected: PASS
- [ ] **Step 5: 生成语音**

```bash
DOUBAO_TTS_API_KEY=<key> npx tsx scripts/gen-voice.ts
```

Expected：输出每个 id 的字节数；`manifest.json` 中约 200 个条目，全部时长大于 0；`n6`–`n20`、`hey`、`last3`、`rest`、`done` 的 mp3 已删除。

- [ ] **Step 6: 提交** — `git add -A && git commit -m "feat: add coach phrase library and voice manifest"`

---

### Task 5: 播报清单

**Files:**
- Create: `src/coach/cues.ts`
- Test: `tests/coach/cues.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `Plan`，Task 3 的 `Step`，Task 4 的语句 id 函数，`mulberry32`
- Produces:
  - `type VoiceManifest = Readonly<Record<string, number>>`
  - `interface Cue { readonly time: number; readonly clip: string; readonly duration: number; readonly priority: number }`
  - `interface Candidate { readonly clip: string; readonly earliest: number; readonly latest: number; readonly priority: number; readonly deadline: number }`（`deadline` 是允许的最晚结束时刻）
  - `CUE_GAP_SECONDS = 0.15`
  - `placeCues(candidates: readonly Candidate[], manifest: VoiceManifest): Cue[]`：按 Global Constraints 的排程规则放置，返回按 `time` 排序的结果；清单中不存在的 clip 直接丢弃
  - `buildCueSheet(steps: readonly Step[], plan: Plan, catalog: readonly Exercise[], manifest: VoiceManifest): readonly Cue[]`

**候选播报的生成（对应规格第 3.1 节）：**
- 每个步骤的 `deadline` 是下一段倒数的开始时刻：本步骤是 work 时为 `E−5`，本步骤是 prepare、rest、switch 时为 `E−3`。完成语和休息开头的播报属于后续的休息步骤，以那个休息步骤的 `E−3` 作为 `deadline`。
- 随机抽取：对每个步骤用 `mulberry32(plan.seed * 1000 + stepIndex)`；同一步骤内抽过的语句不再抽。
- 最后一个 work 步骤结束时，用 `finish` 代替从 `done-*` 抽取的完成语。
- 动作要点在右侧不生成；`k = (round − 1) mod 2`；对应的 clip 不存在时不生成。
- 某一轮的第一个动作之前的休息，开头加 `round-<n>`（n ≥ 2）。

- [ ] **Step 1: 写失败测试**

```ts
const manifest = fullManifest(1.0)   // 测试辅助：所有可能的 clip id，时长均为 1.0 秒
const sheet = (p = plan, m = manifest) => buildCueSheet(buildTimeline(p), p, fixtureCatalog, m)

it('no two cues overlap', () => {
  const s = sheet()
  s.slice(1).forEach((c, i) => expect(c.time).toBeGreaterThanOrEqual(s[i].time + s[i].duration + CUE_GAP_SECONDS - 1e-9))
})
it('every work step has start or switch, a 5..1 countdown on whole seconds, and an ending', () => {
  const steps = buildTimeline(plan); const s = sheet()
  steps.forEach(st => {
    if (st.kind !== 'work') return
    expect(s.some(c => c.time === st.start && (c.clip === 'start' || c.clip === 'switch'))).toBe(true)
    ;[5, 4, 3, 2, 1].forEach(n => expect(s.some(c => c.clip === `n${n}` && Math.abs(c.time - (st.end - n)) < 1e-9)).toBe(true))
  })
  expect(s.at(-1)!.clip).toBe('finish')
})
it('rest ends with three-two-one and the next work has no count of one', () => {
  const steps = buildTimeline(plan); const s = sheet()
  const rest = steps.find(x => x.kind === 'rest')!
  ;[3, 2, 1].forEach(n => expect(s.some(c => c.clip === `n${n}` && Math.abs(c.time - (rest.end - n)) < 1e-9)).toBe(true))
  const work = steps.find(x => x.start === rest.end)!
  expect(s.filter(c => c.clip === 'n1' && c.time > work.start && c.time < work.end - 1.5)).toHaveLength(0)
})
it('short work steps get no last-ten-seconds cue', () => { /* 构造 D < 25 的方案，断言没有 last10-* */ })
it('announces round 2 before the second round', () => {
  const p = generatePlan({ parts: ['肩颈'], minutes: 30, level: 1 }, fixtureCatalog, 1)
  expect(sheet(p).some(c => c.clip === 'round-2')).toBe(true)
})
it('drops the next-exercise name rather than overlapping the countdown on a 10s rest (Review Focus 1)', () => {
  const p = generatePlan({ parts: ['全身'], minutes: 10, level: 3 }, fixtureCatalog, 2)
  const long = { ...manifest, ...Object.fromEntries(Object.keys(manifest).filter(k => k.startsWith('next-')).map(k => [k, 4])) }
  const s = sheet(p, long)
  s.slice(1).forEach((c, i) => expect(c.time).toBeGreaterThanOrEqual(s[i].time + s[i].duration))
})
it('a long form cue never overlaps halfway encouragement (Review Focus 3)', () => {
  const long = { ...manifest, ...Object.fromEntries(Object.keys(manifest).filter(k => k.startsWith('cue-')).map(k => [k, 3.5])) }
  const s = sheet(plan, long)
  s.slice(1).forEach((c, i) => expect(c.time).toBeGreaterThanOrEqual(s[i].time + s[i].duration))
})
it('no form cue on the right side', () => { /* 断言 right 侧 work 步骤区间内没有 cue-* */ })
it('skips clips missing from the manifest without throwing (Review Focus 5)', () => {
  expect(() => sheet(plan, { n1: 1, n2: 1, n3: 1 })).not.toThrow()
  expect(sheet(plan, {})).toEqual([])
})
it('is deterministic for a seed', () => expect(sheet()).toEqual(sheet()))
```

- [ ] **Step 2: 运行确认失败** — Run: `npx vitest run tests/coach`，Expected: FAIL
- [ ] **Step 3: 实现**：`buildCueSheet` 拆成每种步骤一个候选生成函数，再交给 `placeCues`。
- [ ] **Step 4: 运行确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — `git commit -am "feat: build non-overlapping coach cue sheet"`

---

### Task 6: 引擎接入播报清单

**Files:**
- Delete: `src/beat/voiceCues.ts`
- Modify: `src/beat/schedule.ts`、`src/audio/engine.ts`、`src/ui/useTrainingRun.ts`、`src/ui/pages/Training.tsx`（向 hook 传入 catalog）
- Test: `tests/beat/beat.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `Cue`、`VoiceManifest`、`buildCueSheet`；Task 4 的 `VOICE_MANIFEST_URL`
- Produces:
  - `scheduleWindow(steps, plan, from, to, opts, cues: readonly Cue[]): Scheduled`；`Scheduled.voices` 改为 `readonly { time: number; clip: string }[]`，内容是 `cues` 中 `time ∈ [from, to)` 的条目
  - `AudioEngine.init()` 先加载 `manifest.json`（失败时得到 `{}` 并 `console.warn`），再加载清单中的每条语音
  - `AudioEngine.manifest(): VoiceManifest`
  - `AudioEngine.run(session, steps, plan, opts, cues: readonly Cue[])`；`finish` 不再自行播放 `done`
  - `useTrainingRun(plan, catalog, settings, onDone, onMusicFailed, resumeFrom)`：在 `init` 之后调用 `buildCueSheet(steps, plan, catalog, engine.manifest())`

- [ ] **Step 1: 更新 `beat.test.ts`**：删除 `voiceForEvent` 和 `VOICE_IDS` 相关测试；新增：

```ts
it('scheduleWindow returns cue-sheet voices inside the window only', () => {
  const cues = [{ time: 1, clip: 'start', duration: 0.5, priority: 4 }, { time: 31, clip: 'n5', duration: 0.5, priority: 5 }]
  const s = scheduleWindow(steps, plan, 0, 30, opts, cues)
  expect(s.voices).toEqual([{ time: 1, clip: 'start' }])
})
it('user music mode still plays coach voices', () => {
  const cues = [{ time: 1, clip: 'start', duration: 0.5, priority: 4 }]
  expect(scheduleWindow(steps, plan, 0, 30, { ...opts, userMusic: true }, cues).voices).toHaveLength(1)
})
```

- [ ] **Step 2: 运行确认失败** — Expected: FAIL
- [ ] **Step 3: 实现上述接口改动，删除 `voiceCues.ts`**
- [ ] **Step 4: 运行全部检查** — Run: `npx tsc --noEmit && npx vitest run`，Expected: 无类型错误，全部 PASS
- [ ] **Step 5: 提交** — `git add -A && git commit -m "feat: drive voice playback from the coach cue sheet"`

---

### Task 7: 界面改为秒数显示

**Files:**
- Modify: `src/ui/format.ts`、`src/ui/pages/Preview.tsx`、`src/ui/pages/Training.tsx`、`src/ui/styles.css`、`docs/device-test-checklist.md`
- Test: `tests/ui/ui.test.tsx`

**Interfaces:**
- Consumes: Task 2 的 `round`、`rounds`、`itemActualSeconds`；Task 3 的 `switch`
- Produces:
  - `secondsLabel(seconds: number, sided: boolean): string`：`'30 秒'` 或 `'左右各 30 秒'`，秒数四舍五入
  - 训练页导出 `StatusPanel`，供测试使用；倒计时元素带 `data-testid="countdown"`，内容为 `Math.ceil(stepRemaining)`

**界面规则：**
- 预览页：每行显示 `secondsLabel(itemActualSeconds(item) / (sided ? 2 : 1), sided)`。`rounds > 1` 时，主训按轮分组，标题为"主训 · 第 N 轮"。
- 训练页：
  - work：显示动作名、侧别、大号倒计时，以及动作要点和禁忌。不再显示"第几 / 几次"。
  - rest：显示"休息一下"、大号倒计时、"下一个：<名>"和缩略图。
  - switch：显示"换边"和大号倒计时。
  - prepare：显示"准备"、大号倒计时和第一个动作名。

- [ ] **Step 1: 写失败测试**

```ts
it('secondsLabel', () => {
  expect(secondsLabel(30.4, false)).toBe('30 秒'); expect(secondsLabel(30, true)).toBe('左右各 30 秒')
})
it('rest panel shows a countdown and the next exercise', () => {
  const steps = buildTimeline(plan); const rest = steps.find(s => s.kind === 'rest')!
  render(<StatusPanel state={stateAt(steps, rest.start + 1)} plan={plan} byId={byId} />)
  expect(screen.getByTestId('countdown')).toHaveTextContent(String(Math.ceil(rest.end - rest.start - 1)))
  expect(screen.getByText(/下一个：/)).toBeInTheDocument()
})
it('Preview groups main items by round', () => {
  useAppStore.setState({ plan: generatePlan({ parts: ['肩颈'], minutes: 30, level: 1 }, fixtureCatalog, 1), page: 'preview' })
  render(<Preview />)
  expect(screen.getByText('主训 · 第 2 轮')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行确认失败** — Expected: FAIL
- [ ] **Step 3: 实现**；在 `device-test-checklist.md` 中加入三项：语音之间不打架、倒数和动作结束同步、魔性语句的听感。
- [ ] **Step 4: 运行全部检查**

Run: `npx tsc --noEmit && npm run -s coverage && npm run -s validate:catalog && npx playwright test`
Expected：无类型错误；单元测试全部 PASS 且覆盖率达标；动作库校验通过；2 个端到端用例 PASS。

- [ ] **Step 5: 在浏览器中检查**：`npm run dev`，在手机尺寸视口中练一套 5 分钟入门方案，确认预览页显示秒数，训练页的练习、休息、换边都有倒计时，控制台无报错。
- [ ] **Step 6: 提交并推送** — `git add -A && git commit -m "feat: show timed countdowns in preview and training" && git push`
