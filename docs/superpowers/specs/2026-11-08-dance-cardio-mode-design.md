# 燃脂跳操模式 设计文档

- 日期：2026-11-08
- 状态：待审阅
- 前置：`2026-11-06-fitness-workout-mvp-design.md`（MVP）、`2026-11-07-timed-coach-design.md`（按时间计与语音教练）、`2026-11-07-mixamo-clip-pipeline-design.md`（子项目 ①，已实现）
- 范围：方向 A 的子项目 ②。首页新增“燃脂跳操”模式，与“部位塑形”并列

## 1. 背景与目标

方向 A 面向年轻减脂人群和上班族。现有“部位塑形”是循环训练：练 30 到 45 秒，休 10 到 20 秒，循环 1 到 3 轮。燃脂跳操要的是另一种体验：像跟着跳操视频一样连续不停，动作在节拍上切换，强度有起伏，最后放松。

### 1.1 已确认的决定

| 项 | 决定 |
|---|---|
| 课程形态 | 连续课程：没有休息页，靠低强度动作缓一缓 |
| 强度曲线 | 波浪：热身 → 多个“段落”（每段 中 → 中 → 高潮 → 缓）→ 放松；每段 BPM 递增 |
| 动作来源 | 从 desk-break 导入低冲击有氧、舞蹈和少量搞笑动作；现有开合跳、高抬腿、波比跳等用于高潮 |
| 段内编排 | 先学后连：每个动作单独学 4 个八拍，再把整段连起来，每个动作 2 个八拍，连两遍 |
| 音乐 | 新的合成“跳操”节奏，按强度档位和乐句位置变化；仍支持自选音乐 |
| 语音 | 教练式口令：“下一个，X”、踩拍的“五、六、七、八”、段落口令和魔性鼓劲 |
| 输入 | 练多久、难度、安静模式（不跳）；不选部位 |
| 架构 | 方案 1：新的编排模型 `Routine`，编译成现有的 `Plan`，时间线、舞台、会话控制不改 |

### 1.2 成功标准

1. 首页可以在“燃脂跳操”和“部位塑形”之间切换；部位塑形的行为与现在完全一致。
2. 燃脂跳操全程没有休息页；动作只在八拍的“八”之后切换，切换点与节拍对齐。
3. 每段的强度是 中 → 中 → 高潮 → 缓；后一段比前一段快（到上限为止）。
4. 安静模式或入门档不出现任何高冲击动作，也不播任何含“跳”字的语音。
5. 每种时长、档位、安静模式组合，总时长都在目标 ±30 秒内。
6. 每次切换动作前都有“五、六、七、八”踩拍口令（连起来阶段的段内切换除外，见第 6 节），并且屏幕上提前一个八拍显示下一个动作。

## 2. 课程结构与强度

### 2.1 输入

```ts
type DanceMinutes = 10 | 15 | 20 | 30
interface DanceInput { readonly mode: 'dance'; readonly minutes: DanceMinutes; readonly level: Level; readonly quiet: boolean }
```

入门档（`level === 1`）时 `quiet` 强制为 `true`。

### 2.2 一节课的组成

| 部分 | 内容 | 速度 |
|---|---|---|
| 热身 | 3 到 6 个强度 1 的动作，每个 4 个八拍，不连 | 100 BPM |
| 段落 × N | 4 个动作位，先学后连（见 2.3） | 每段递增（见 2.4） |
| 放松 | 2 个强度 1 的动作，每个 4 个八拍；然后 1 到 4 个现有拉伸动作，每个 30 秒，沿用现有拉伸挑选规则 | 96 BPM，拉伸 80 BPM |

### 2.3 一个段落

- 4 个动作位，强度依次为 **2、2、3、1**（中、中、高潮、缓）。
- **学动作**：按动作位顺序，每个动作 4 个八拍（32 拍），共 128 拍。
- **连起来**：4 个动作按同样顺序各 2 个八拍（16 拍），一遍 64 拍；默认连 2 遍（`comboPasses = 2`），共 128 拍。
- 一段共 256 拍，120 BPM 时约 128 秒。

### 2.4 速度

| 档位 | 第 1 段 | 每段增加 | 上限 |
|---|---|---|---|
| 入门 | 110 | +4 | 122 |
| 进阶 | 118 | +4 | 130 |
| 挑战 | 124 | +4 | 136 |

### 2.5 凑时长

1. 热身约占目标时长的 10%，放松加拉伸约占 12%，其余给段落：`N = max(1, round(可用时长 / 一段时长))`，一段时长按该段实际 BPM 计算。
2. 与目标仍相差超过 30 秒时，依次调整，直到进入 ±30 秒：
   1. 最后一段的 `comboPasses`（2 或 1）；
   2. 热身动作数（3 到 6）；
   3. 拉伸动作数（1 到 4）。
3. 仍然不行时，`shortfallSeconds = 目标 − 总时长`（与部位塑形相同的提示）。

举例：10 分钟约 3 段，30 分钟约 11 段。

### 2.6 选动作规则

- 只从舞蹈池（见第 3 节）中按动作位强度选。
- **冲击与难度**：
  - 安静模式（含入门档）只选 `impact: 'low'`；
  - 入门档只选 `level ≤ 1`；
  - 进阶和挑战不限 `level`。
- **不重复**：同一节课里，某个强度的可选动作用完之前不重复；相邻两段不出现同一个动作。
- **搞笑动作**：每段最多 1 个，只能放在第 1、2、4 动作位，不放在高潮位。搞笑动作沿用 desk-break 的 id，按 `funny-` 前缀识别，不新增字段。
- **补位**：某个强度一个可选动作都没有时，先找低一档，再找高一档；动作库检查（第 3.4 节）保证正式动作库不会走到这一步。
- 随机使用方案的 `seed`，同一个 seed 结果相同。

## 3. 动作库

### 3.1 字段变更（`src/catalog/types.ts`）

- 新增 `pools: ('shape' | 'dance')[]`，至少一项，表示哪些模式可以选这个动作。
- 新增 `danceTier?: 1 | 2 | 3`：1 为缓、热身或放松；2 为中；3 为高潮。
- 用 zod `superRefine` 校验：
  - `pools` 含 `'dance'` 时，`danceTier` 必填；不含时不能填；
  - 舞蹈池动作不能是 `sided: true`。
- 部位塑形的 `eligible` 增加条件 `pools.includes('shape')`。

### 3.2 现有动作的标记

除下表外，现有动作全部为 `pools: ['shape']`。

| 动作 | pools | danceTier |
|---|---|---|
| `jumping-jacks`、`high-knees`、`burpee` | shape, dance | 3（高冲击） |
| `standing-climber`、`skier-swing`、`overhead-punches` | shape, dance | 3 |
| `step-jack`、`punches` | shape, dance | 2 |
| `march-in-place`、`step-touch-clap` | shape, dance | 1 |

### 3.3 从 desk-break 导入（`tools/catalog/selection.ts` 新增“舞蹈池”一节）

全部为 `pools: ['dance']`，每个动作写中文名、2 条要点，需要时写禁忌，格式与现有行相同。暂定清单如下；最终清单在实施计划中经实际播放检查后确定，放不进八拍或观感不好的直接去掉。

- **低冲击有氧（约 15 个）**：boxer-shuffle、grapevine、jab-cross-step、skater-step-no-hop、heel-dig-punch、low-front-kick、standing-uppercuts、fast-feet-small、power-walk-arms-up、lateral-shuffle-low、cross-knee-tap、half-jack-arms、twist-march、butt-kick-walk、march-arm-circles
- **舞蹈（约 15 个）**：dance-two-step、dance-bounce-groove、dance-running-man-step、dance-cabbage-patch、dance-raise-the-roof、dance-sprinkler、dance-disco-point、dance-pump-it、dance-side-sway、dance-heel-tap、dance-the-swim、dance-hitchhike、dance-carlton、dance-ymca、dance-overhead-clap
- **搞笑（约 6 个）**：funny-chicken-dance、funny-air-guitar、funny-sumo-stomp、funny-penguin-waddle、funny-t-rex-arms、funny-hot-floor

`Row` 类型扩展为可带 `pools` 和 `danceTier`；现有行不写时取默认值 `['shape']`。

### 3.4 检查

扩展现有的动作库校验（作为测试运行）：

- 每个舞蹈池动作在 110 到 136 BPM 之间的每一个段落速度，以及 96 和 100 BPM（如果它是强度 1），都能由 `fitBeats` 得到 `beatsPerRep ∈ {1, 2, 4, 8}`，保证八拍整除。
- 低冲击的强度 3 动作至少 6 个，强度 1 和强度 2 各至少 6 个；其中 `level ≤ 1` 的低冲击动作，每个强度至少 4 个（入门档）。
- `mannequin.glb` 不超过 3 MB（沿用现有检查）。现在 2.13 MB，desk-break 关键帧动画每个约 10 到 15 KB，预计导入后约 2.6 MB。超出时先去掉价值最低的搞笑或舞蹈动作。

## 4. 编排模型与编译

### 4.1 模块（`src/dance/`，全部为纯函数）

| 文件 | 职责 |
|---|---|
| `types.ts` | `DanceInput`、`Block`、`Routine` |
| `pool.ts` | 按强度、冲击、难度筛选舞蹈池 |
| `generateRoutine.ts` | `generateRoutine(input, catalog, seed): Routine`，实现第 2 节 |
| `compileRoutine.ts` | `compileRoutine(routine, catalog): Plan` |
| `editRoutine.ts` | `replaceMove(routine, block, slot, exerciseId): Routine` |
| `cues.ts` | 跳操的语音排程（第 6 节） |
| `tempo.ts` | BPM 表和八拍常量 |

```ts
interface Block { readonly index: number; readonly bpm: number; readonly moves: readonly string[]; readonly comboPasses: 1 | 2 }
interface Routine {
  readonly input: DanceInput
  readonly seed: number
  readonly warmup: readonly string[]
  readonly blocks: readonly Block[]
  readonly cooldown: readonly string[]
  readonly stretch: readonly string[]
}
```

### 4.2 编译成 Plan

- 每个条目都是 `restBeforeSeconds = 0`，`sided = false`。
- 热身、学动作、放松条目各 32 拍；连起来条目各 16 拍。`beatsPerRep` 和 `timeScale` 由 `fitBeats` 得出，`reps = 拍数 / beatsPerRep`。`workSeconds` 填实际秒数。
- 拉伸条目用现有的 `toItem(e, 'stretch', …)`，按 30 秒计。
- `segment`：热身为 `warmup`，段落为 `main`，放松动作和拉伸为 `stretch`（放松动作的 BPM 固定为 96，不用 `bpmFor`）。
- 除拉伸条目外，每个条目带 `dance` 信息（见 4.3）；拉伸条目没有 `dance`，因此按现有规则处理。`Plan.rounds` 填段数。

### 4.3 Plan 类型变更（`src/planner/types.ts`）

```ts
interface ShapeInput { readonly mode: 'shape'; readonly parts: readonly Part[]; readonly minutes: Minutes; readonly level: Level }
type PlanInput = ShapeInput | DanceInput

interface DanceItemInfo {
  readonly block: number            // 热身、放松为 0
  readonly phase: 'warmup' | 'learn' | 'combo' | 'cooldown'
  readonly tier: 1 | 2 | 3
  readonly pass: number             // 连起来的第几遍，其他阶段为 0
}
// PlanItem 新增 readonly dance?: DanceItemInfo
// Plan 新增 readonly routine?: Routine
```

- `generatePlan` 只接受 `ShapeInput`，内部逻辑不变。
- **旧数据**：`storage.ts` 读取训练记录和训练进度时，`input` 没有 `mode` 的一律补成 `'shape'`。不改 IndexedDB 的版本。
- 读取到的跳操进度如果编译失败，按现有“放弃”处理，并输出一条 `console.warn`。

### 4.4 编辑

- **替换**：在某段选一个动作，换成同强度、同样满足筛选条件的动作。改 `Routine` 后重新编译，这个动作在学动作和连起来里的所有条目一起换。热身和放松动作同理。
- **换一套**：用 `seed + 1` 重新生成，与现在相同。
- **删除**：跳操不提供（删掉一个动作位会破坏连起来的结构）。部位塑形不变。

## 5. 节奏音乐

### 5.1 选择

- 新增 `StyleId` `'dance'`。节拍事件带 `dance` 信息时用它（即跳操的热身、段落、放松动作），否则沿用 `styleForSegment`（拉伸仍是木鱼禅意）。
- 设置里的“主训风格”只影响部位塑形。

### 5.2 共用代码的改动

- `BeatEvent` 新增可选的 `dance?: { tier; phase; nextTier: 1 | 2 | 3 | null; blockStart: boolean }`，由 `beatEventsInWindow` 根据 `PlanItem.dance` 和下一个条目填写。`blockStart` 表示这是某段第一个条目的第一拍。
- `Hit` 新增可选 `offsetBeats?: 0 | 0.5`，`schedule.ts` 播放时间加上 `offsetBeats × 拍长`。现有风格从不设置这个字段，部位塑形的声音完全不变。
- 新增合成音色 `clap`：3 个间隔约 10 毫秒的带通噪声短脉冲。

### 5.3 各强度的节奏（拍号指八拍内的第几拍，1 到 8）

| 强度 | 底鼓 | 拍手 / 军鼓 | 镲 | 贝斯 | 重音 |
|---|---|---|---|---|---|
| 1 | 1、3、5、7 | 拍手 2、4、6、8，音量 0.5 | 无 | 第 1 拍 | 无 |
| 2 | 每拍 | 拍手 2、4、6、8 | 每个反拍 | 1、3、5、7 | 无 |
| 3 | 每拍 | 拍手加军鼓 2、4、6、8 | 每个正拍和反拍 | 每拍 | 每个八拍第 1 拍加 `duang` |

### 5.4 过渡

- **换动作加花**：任何条目结束前的最后 4 拍，每半拍加一下军鼓，音量从 0.3 递增到 0.9。
- **高潮前铺垫**：`nextTier === 3` 时，在最后 8 拍里所有音的 `rate` 逐拍升高，最多升 4 个半音（与现有次数倒数的升调同理），镲加倍。
- **新段开始**：每段第一拍加一下 `gong`。

### 5.5 自选音乐

与现在相同：开启自选音乐时合成节奏静音；开启“节拍提示”时只播节拍提示音。换动作的最后 4 拍仍用 `tick` 提示，保证听得出切换。

## 6. 语音口令

### 6.1 排程

`src/dance/cues.ts` 为每个条目生成候选播报，然后复用 `src/coach/cues.ts` 的 `placeCues`（按优先级、可顺延、放不下就放弃）。拉伸条目沿用现有按时间计的规则。用 B 表示一拍的时长，S、E 表示条目的开始和结束时刻。

### 6.2 踩拍数数

- `c5`、`c6`、`c7`、`c8`（五、六、七、八）固定在 E−4B、E−3B、E−2B、E−1B，优先级 5。
- 136 BPM 时一拍 0.44 秒，所以这 4 条语音必须 ≤ 0.40 秒：`gen-voice` 生成时用较快语速并去掉首尾静音，由语音清单测试检查。
- 只在相邻两条数数语音之间，免去 0.15 秒间隔的要求。

### 6.3 每个条目的播报

| 条目 | 时间窗口 | 语音 | 优先级 |
|---|---|---|---|
| 第一个热身条目 | S | `dance-start` | 4 |
| 第 2 段起，每段第一个学动作条目 | S | `block-up-*` | 4 |
| 强度 3 的学动作条目 | S | 非安静模式用 `peak-jump-*`；安静模式（含入门）用 `peak-quiet-*` | 4 |
| 强度 1 的学动作条目 | S | `easy-*` | 3 |
| 学动作、热身 | S+8B 起，最晚 S+16B | `cue-<id>-0` | 2 |
| 学动作、热身 | S+16B 起，最晚 S+20B | `hype-*` | 1 |
| 学动作、热身，且下一个是学动作或热身 | 最早 E−16B，必须在 E−4B 前播完 | `next-<下一个 id>` | 3 |
| 每段最后一个学动作条目 | 同上 | `combo` | 3 |
| 学动作、热身、每段连起来的最后一个条目 | E−4B 到 E−1B | `c5` 到 `c8` | 5 |
| 连起来的条目（不是本段最后一个） | E−4B 起，最晚 E−2B | `name-<下一个 id>` | 4 |
| 连起来第 1 遍的最后一个条目 | E−8B 起，最晚 E−6B | `combo-again` | 3 |
| 第一个放松条目 | S | `cooldown` | 4 |
| 最后一个条目 | E | `finish`（现有） | 4 |

- 每段连起来的最后一个条目，`c5` 到 `c8` 引向下一段；它前面的 E−16B 窗口不播 `next-`（新段开始时由 `block-up-*` 或 `peak-*` 接上）。
- 连起来阶段的段内切换只报动作名，不数五六七八，避免口令过密。
- 语句库里的随机抽取用方案的 `seed`；同一个条目里不重复使用同一条。

### 6.4 新语句（`src/coach/phrases.ts`）

**固定语句：**

| id | 文本 |
|---|---|
| `c5`–`c8` | 五 / 六 / 七 / 八 |
| `dance-start` | 跟着节奏，动起来！ |
| `combo` | 好，连起来！ |
| `combo-again` | 再来一遍！ |
| `cooldown` | 最后放松一下～ |

**语句库：**

| 库 | 文本 |
|---|---|
| `block-up-1..4` | 加速！跟上！／ 下一段，走起！／ 节奏起来了！／ 再快一点，你可以！ |
| `peak-jump-1..4` | 高潮来了，跳起来！／ 全力冲，脂肪在燃烧！／ 最燃的部分，跳！／ 拼一把，跳高一点！ |
| `peak-quiet-1..4` | 高潮来了，动作做大！／ 全力冲，脂肪在燃烧！／ 最燃的部分，手臂甩起来！／ 拼一把，速度加起来！ |
| `easy-1..4` | 缓一缓，别停！／ 调整呼吸，脚步跟上！／ 放轻松，节奏还在！／ 喘口气，马上再来！ |
| `hype-1..8` | 你在发光！／ 节奏感满分！／ 这一跳值一口奶茶！／ 稳住，越跳越瘦！／ 太魔性了！／ 汗水是脂肪的眼泪！／ 动作标准比速度重要！／ 整条街最靓的就是你！ |

- **“跳”字规则**：安静模式（含入门）下，不能选用任何文本里含“跳”字的语句。因此 `peak-*` 分成两个库，`hype-*` 中含“跳”的条目（第 3、4 条）在安静模式下不参与抽取。由测试检查。
- **动作语句**：每个舞蹈池动作新增 `name-<id>`（只读动作名）；新导入的动作照现有规则生成 `next-<id>`、`cue-<id>-0`、`cue-<id>-1`。
- 预计新增约 190 条语音，约 1.3 MB，由 PWA 预缓存。

### 6.5 出错时的处理

沿用按时间计设计：缺少某条语音时跳过该条；`manifest.json` 加载失败时不播语音，节奏和计时照常。

## 7. 界面

- **首页**：顶部用两个标签切换“燃脂跳操 | 部位塑形”，记住上次的选择（存进设置）。
  - **燃脂跳操**：练多久（10、15、20、30 分钟）、难度、安静模式（不跳）开关，开关下的说明是“适合办公室和楼下有邻居”。入门档时开关强制打开并置灰。
  - **部位塑形**：不变。
- **预览页（跳操）**：分组为“热身 / 第 N 段 · 120 BPM / 放松”。每段列出 4 个动作，并带强度标签（热身、加强、高潮、缓一缓）和本段时长；点动作打开替换列表。“换一套”保留。
- **训练页（跳操）**：
  - 显示当前动作名、阶段标签（“学动作”或“连起来！第 1 遍”），以及 8 个圆点按拍逐个点亮，代替大号秒数倒计时。
  - 每个条目的最后一个八拍显示“下一个”卡片（缩略图加动作名）。
  - 顶部进度条保留；另有“第 2 / 5 段”提示。
  - 暂停、退出不变；跳过直接到下一个条目的第一拍；上一个不变。
- **完成页与训练记录**：标题显示模式，例如“燃脂跳操 · 15 分钟”；其他不变。

## 8. 模块改动

| 模块 | 改动 |
|---|---|
| `src/catalog/types.ts` | `pools`、`danceTier` 和校验 |
| `tools/catalog/selection.ts`、`build.ts`、`exercise.ts` | 舞蹈池导入；`Row` 扩展；八拍和池大小检查 |
| `src/dance/*`（新） | 见 4.1 |
| `src/planner/types.ts` | `PlanInput` 联合类型、`DanceItemInfo`、`Plan.routine` |
| `src/planner/generatePlan.ts` | 只接受 `ShapeInput`；`eligible` 加 `pools` 条件 |
| `src/storage/storage.ts` | 旧数据补 `mode: 'shape'`；设置里保存首页模式 |
| `src/beat/events.ts`、`patterns.ts`、`schedule.ts` | `BeatEvent.dance`、`'dance'` 风格、`offsetBeats` |
| `src/audio/synth.ts` | `clap` 音色 |
| `src/coach/phrases.ts`、`scripts/gen-voice.ts` | 新语句；数数语音加快和去静音 |
| `src/ui/store.ts`、`pages/Home.tsx`、`Preview.tsx`、`Training.tsx`、`Done.tsx`、`format.ts` | 模式切换、按段预览、八拍圆点和下一个卡片 |
| `docs/device-test-checklist.md` | 跳操检查项 |

## 9. 测试

**单元测试：**

- **`generateRoutine`**：遍历 4 种时长 × 3 档 × 安静模式开关 × 50 个 seed，检查：
  - 总时长在 ±30 秒内，或给出 `shortfallSeconds`；
  - 每段的强度依次是 2、2、3、1；
  - 安静模式或入门档没有高冲击动作；入门档没有 `level > 1` 的动作；
  - 相邻两段没有相同动作；
  - 每段最多 1 个搞笑动作，且不在第 3 位；
  - BPM 符合档位表和上限；
  - 同一个 seed 结果相同。
- **`compileRoutine`**：每个条目的拍数都是 8 的倍数；`restBeforeSeconds` 都是 0；学动作 32 拍、连起来 16 拍；连起来遍数是 1 或 2；拉伸条目与 `toItem` 结果一致。
- **`replaceMove`**：所有学动作和连起来条目一起替换；强度保持不变。
- **存储**：没有 `mode` 的旧记录读成部位塑形。
- **`hitsForEvent('dance')`**：各强度节奏、换动作加花、高潮前铺垫、新段 `gong`；现有三种风格的输出与改动前一致（快照）。
- **`schedule.ts`**：`offsetBeats = 0.5` 的音落在半拍上。
- **跳操语音排程**：除相邻数数语音外互不重叠；每个学动作条目以五六七八结尾；安静模式下没有含“跳”的语句；缺少某条语音时跳过不报错；同一个 seed 结果相同。
- **动作库**：第 3.4 节的检查；`pools` 与 `danceTier` 一致；舞蹈池没有分左右的动作。
- **语音清单**：`c5` 到 `c8` 都 ≤ 0.40 秒；每个舞蹈池动作都有 `name-<id>`。

**端到端测试：** 切到“燃脂跳操” → 10 分钟、进阶 → 预览页能看到“热身”“第 1 段”“放松” → 开始 → 能看到八拍圆点和“下一个”卡片。

**真机检查**（加入 `docs/device-test-checklist.md`）：
- 136 BPM 下五六七八与节拍对齐；
- 加花和高潮铺垫听得出来；
- 动作恰好在下一个八拍的第一拍切换；
- 高潮节奏在手机外放时不破音。

## 10. 不在本子项目范围内

- 部位塑形的徒手力量升级（子项目 ③）
- 周计划、打卡、进阶（子项目 ④）
- 真实音乐曲目、自选音乐的 BPM 识别
- 人工编排的固定套路
- 推迟的 Mixamo 动作（跳绳、仰卧起坐、自行车卷腹）
