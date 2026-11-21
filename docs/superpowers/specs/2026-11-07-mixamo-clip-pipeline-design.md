# Mixamo 动作素材管线 设计文档

- 日期：2026-11-07
- 状态：待审阅
- 前置：`docs/superpowers/specs/2026-11-06-fitness-workout-mvp-design.md`（MVP，已实现）、`docs/superpowers/specs/2026-11-07-timed-coach-design.md`（按时间计，已实现）
- 范围：方向 A 的子项目 ①。把 Mixamo 动画重新绑定到现有木头人骨架上，并入动作库，交付第一批跳跃类和徒手力量动作

## 1. 背景

### 1.1 方向 A 与拆分

产品下一阶段确定为方向 A：节拍有氧 / 跳操 + 徒手循环 + 周计划与进阶，目标人群是年轻减脂人群和上班族。首页将并列“燃脂跳操”和“部位塑形”两种模式，无器械的力量动作进入统一动作库，两种模式共用，练法仍按时间计。

方向 A 拆成 4 个子项目，各自走“设计 → 计划 → 实现”：

1. **动作素材管线（本文档）**
2. 燃脂跳操模式（依赖 ①）
3. 部位塑形的徒手力量升级（依赖 ①）
4. 周计划与进阶

### 1.2 为什么需要新素材

现有动作全部来自 desk-break。它的 435 个动作里，有氧、舞蹈、搞笑类共 100 多个，但全部是不跳的低冲击动作，也没有标准俯卧撑、深蹲等徒手力量动作。第一版就需要跳跃动作，所以引入 Mixamo 作为第二个来源。

### 1.3 可行性验证结论

已用开合跳（Jumping Jacks）和波比跳（Burpee）做过一次性验证：

- 木头人骨架只有 16 根骨骼（`hips legL kneeL footL legR kneeR footR spine armL elbowL handL armR elbowR handR neck prop`），初始姿势手臂下垂；Mixamo 骨架有 65 根骨骼，初始姿势是 T 字，单位是厘米。
- 按“肢体朝向一致”重新绑定后，两个动作在正面、侧面各 8 个关键帧的姿势都和原动作吻合。
- 开合跳髋部最高比站立时高约 14 厘米，踝部最低 0.095 米；波比跳平板撑地时踝部最低 0.054 米，是踮脚尖撑地的正常姿态，没有穿地。
- 导出结果保留原来的 16 根骨骼和骨骼名，可以直接合并进 `mannequin.glb`。

## 2. 已确认的决定

| 项 | 决定 |
|---|---|
| 新动作来源 | Mixamo（Adobe），由用户登录后手动下载 FBX |
| 管线方案 | 离线两段式：Blender 重新绑定，再由现有 `build.ts` 合并压缩 |
| 本子项目交付 | 管线 + 第一批动作入库（带中文名、要点、禁忌、缩略图） |
| App 运行时 | 不改动 |
| 原始素材 | Mixamo FBX 和重新绑定的中间文件都不进仓库 |

### 2.1 第一批动作

必需（6 个）：

| id | 中文名 | Mixamo 动作名 | 部位 | 类型 | 难度 | 冲击 |
|---|---|---|---|---|---|---|
| `jumping-jacks` | 开合跳 | Jumping Jacks | 全身 | main | 2 | high |
| `high-knees` | 高抬腿 | High Knees 或 Running In Place（以实际下载为准） | 全身、臀腿 | main | 2 | high |
| `burpee` | 波比跳 | Burpee | 全身 | main | 3 | high |
| `air-squat` | 深蹲 | Air Squat | 臀腿 | main | 1 | low |
| `push-up` | 俯卧撑 | Push Up | 胸背、上肢 | main | 3 | low |
| `stair-run` | 原地爬楼梯 | Running Up Stairs | 全身、臀腿 | main | 1 | low |

可选（找得到就加，按同样字段补进清单）：后踢腿跑（Butt Kicks）、原地跳绳（Jump Rope）、跪姿俯卧撑（Knee Push Up）、卷腹或仰卧起坐（Situps / Crunch）、侧弓步（Side Lunge）、平板开合跳（Plank Jack）。

暂时空缺：

- 深蹲跳：Mixamo 的 Air Squat 不跳，没有找到对应动作，留待以后另找来源。
- 平板登山跑：Mixamo 未找到，先用现有的“站姿登山”（`standing-climber`）代替。
- 箭步蹲：Mixamo 未找到，先用现有的“浅分腿蹲”和“后撤步提膝”代替。

每个动作写 2 条要点；有风险的动作写禁忌，例如波比跳：“膝盖或腰部不适时，改为后撤步，不跳”。`defaultReps` 统一填 8（现有字段要求至少 4；按时间计之后，这个值只用于把动画和节拍对齐）。

**对现有功能的影响**：新动作入库后，现有“部位塑形”就可能选到它们。现有规则只选“难度不超过所选档位”的动作，跳跃类动作都定为难度 2 及以上，因此入门档不会出现跳跃。两种模式如何专门使用这些动作，由子项目 ② 和 ③ 设计。

## 3. 结构与数据流

```
项目外（不进仓库）                                    仓库内（提交）
../_vendor/desk-break/         ─────────────┐
../_vendor/mixamo/*.fbx  ──①Blender 重新绑定──> ../_vendor/mixamo-retargeted/<id>.glb + <id>.report.json
                                            │
                                            └──②build.ts 合并 + 压缩──> public/assets/models/mannequin.glb
                                                                        public/assets/catalog/exercises.json
                                                                        （再跑现有 tools/thumbs 生成缩略图，
                                                                         scripts/gen-voice.ts 增量生成新动作的语音）
```

每个动作在语音教练里有 3 条专属语音（“下一个，动作名”和两条要点，见 `src/coach/phrases.ts` 的 `exercisePhrases`），由 `scripts/gen-voice.ts` 根据动作库增量生成。新动作入库后必须运行一次，否则训练时这些语音缺失。

| 文件 | 新增 / 修改 | 职责 |
|---|---|---|
| `tools/mixamo/retarget.py` | 新增 | Blender 脚本。输入一个 FBX、动作 id、可选起止帧，输出只含木头人骨骼动画的 GLB（动画名就是 id）和测量报告；带 `--sheet` 时额外输出对比图 |
| `tools/mixamo/run.ts` | 新增 | 按清单逐个调用 Blender，读取报告并用 `checkReport` 判定；源 FBX 未变化的动作跳过 |
| `tools/mixamo/checkReport.ts` | 新增 | 纯函数：根据报告和阈值给出通过或失败原因 |
| `tools/catalog/mixamoSelection.ts` | 新增 | Mixamo 动作清单 |
| `tools/catalog/mergeClips.ts` | 新增 | 纯函数：把重新绑定后的 GLB 动画按骨骼名挂到 desk-break 文档的骨骼上 |
| `tools/catalog/build.ts` | 修改 | 新增可选参数指向重新绑定目录；合并后沿用现有的裁剪、重采样、压缩和动作库生成 |
| `public/assets/models/LICENSES.md` | 修改 | 新增 Mixamo 一节 |
| `docs/device-test-checklist.md` | 修改 | 新增跳跃类动作的真机检查项 |

### 3.1 使用方式

```bash
npx tsx tools/mixamo/run.ts ../_vendor/mixamo ../_vendor/mixamo-retargeted
```

```bash
npx tsx tools/catalog/build.ts ../_vendor/desk-break --mixamo ../_vendor/mixamo-retargeted
```

- Blender 路径从环境变量 `BLENDER` 读取；未设置时使用本机默认安装路径 `D:/Program Files/Blender Foundation/Blender 5.2/blender.exe`，找不到时报错并提示设置 `BLENDER`。
- 不带 `--mixamo` 时，`build.ts` 的行为和现在完全一致。

### 3.2 清单格式

`mixamoSelection.ts` 每一行是一个对象：

```ts
interface MixamoRow {
  id: string            // 动作 id，也是动画名
  fbx: string           // ../_vendor/mixamo 下的文件名
  frames?: [number, number] // 可选起止帧（含），用于去掉开头的预备动作
  name: string
  parts: readonly Part[]
  type: SegmentType
  level: Level
  impact: 'low' | 'high'
  sided: boolean
  cues: readonly string[]
  caution: string
}
```

`build.ts` 把这些行和 desk-break 的行一起转成 `Exercise`。`clipSeconds` 和 `beatsPerRep` 的算法与现有动作相同，并统一经过 `parseCatalog` 校验。动作 id 与现有动作重名时报错。

## 4. 重新绑定规则

| 木头人骨骼 | 对齐方式 |
|---|---|
| `armL/R`、`elbowL/R`、`legL/R`、`kneeL/R` | 这段肢体（本骨骼头部到子骨骼头部）的朝向，与 Mixamo 对应肢体一致：`Arm → ForeArm`、`ForeArm → Hand`、`UpLeg → Leg`、`Leg → Foot` |
| `handL/R` | 对 `Hand → HandMiddle1`；初始朝向为小臂方向 |
| `footL/R` | 对 `Foot → ToeBase`；初始朝向为 Mixamo 初始姿势下脚尖的水平方向 |
| `neck` | 对 `Neck → HeadTop_End`；初始朝向向上 |
| `hips` | 由“左右方向（`LeftUpLeg − RightUpLeg`）+ 向上方向（`Spine − Hips`）”构造坐标系，求出整体旋转 |
| `spine` | 由“左右方向（`LeftArm − RightArm`）+ 向上方向（`Neck − Spine`）”构造坐标系，求出整体旋转 |
| `prop` | 不处理 |

- **旋转方式**：肢体骨骼取从初始朝向到当前朝向的最小旋转，不处理绕骨骼自身的扭转（木头人没有锁骨、手腕、前臂扭转，扭转误差肉眼几乎不可见）。
- **髋部位移**：`木头人髋部初始位置 + (Mixamo 髋部当前位置 − Mixamo 髋部初始位置) × k`，其中 `k = 木头人腿长 / Mixamo 腿长`（验证时约为 0.92），腿长取髋关节到踝关节的距离。
- **原地化**：首尾帧髋部的水平位移按时间线性平摊到整个动作里减掉，使首尾水平位置一致；动作中间的位移保留。
- **帧率**：按源动画帧率逐帧采样（Mixamo 下载时选 30 帧），之后由 `build.ts` 现有的 `resample()` 精简。
- **导出**：只导出木头人骨架及其动画，并且只保留本动作的动画。验证时发现会多导出一个 Mixamo 原始动画，正式脚本要去掉。

## 5. 自动检查

`retarget.py` 只负责测量并写进 `<id>.report.json`，是否通过由 `checkReport.ts` 判定。任何一项不通过，`run.ts` 都会报错退出，并说明是哪个动作、哪一项、实际数值是多少。

| 检查项 | 报告字段 | 通过标准 | 防止的问题 |
|---|---|---|---|
| 骨骼齐全 | `missingBones` | 为空 | 下载错角色或骨架 |
| 循环接缝 | `seamMaxAngleDeg`、`seamHipsDistance` | 首尾两帧每根骨骼角度差 ≤ 10°，髋部位置差 ≤ 0.03 米 | 循环播放时跳帧 |
| 穿地 | `minAnkleHeight` | ≥ 0.03 米（站立时为 0.08 米） | 脚陷进地面 |
| 原地 | `driftAfterFix` | ≤ 0.05 米 | 越练越走远 |
| 时长 | `durationSeconds` | 0.5 到 6 秒 | 动作截取错误 |

`build.ts` 另外检查：

- 每个动作都能由现有的 `pickBeats` 选出每次动作的拍数，否则报错（沿用现有逻辑）。
- 输出的 `mannequin.glb` 不超过 3 MB（现在是 2.0 MB）。

人工复核：`run.ts --sheet` 为每个动作输出一张对比图（正面、侧面各 8 帧，木头人和 Mixamo 原动作并排），格式与验证时相同，放在重新绑定目录里。每批新动作入库前都要人工看一遍。

## 6. 授权

- `LICENSES.md` 新增 Mixamo 一节：动画来自 Adobe Mixamo，按其条款可免版税用于项目，但不得单独分发原始素材；原始 FBX 不进仓库，只把重新绑定后的动画内嵌在模型文件里。
- 正式上架前，由产品负责人自行核对 Mixamo 当前条款。

## 7. 测试

| 层面 | 内容 |
|---|---|
| 单元测试：`mergeClips` | 用几份小的 GLB 测试数据验证：动画按骨骼名挂到正确的骨骼上；源动画引用了目标中不存在的骨骼时报错；动画名与已有动画重名时报错 |
| 单元测试：`checkReport` | 用报告测试数据覆盖每一项的通过、刚好在阈值、不通过三种情况，并检查错误信息里包含动作 id、检查项和实际数值 |
| 单元测试：清单 | `mixamoSelection` 的每一行都能通过 `parseCatalog`；id 不与 desk-break 清单重名 |
| 动作库校验 | 沿用现有的 `validate:catalog`：每个动作在模型里都有对应动画、都有缩略图；语音清单里有新动作的 3 条语音（现有语音测试已检查清单覆盖动作库） |
| Blender 脚本 | 不进自动化测试；用已下载的开合跳和波比跳实际运行，并人工检查 `--sheet` 对比图 |
| 真机 | `docs/device-test-checklist.md` 新增：手机上播放开合跳、波比跳时节拍对得上、画面不卡、脚不穿地 |

## 8. 不在本子项目范围内

- 燃脂跳操模式的首页入口、编排规则和音乐（子项目 ②）
- 部位塑形对力量动作的专门编排（子项目 ③）
- 周计划、打卡、进阶（子项目 ④）
- 深蹲跳、平板登山跑、箭步蹲的新素材来源
- 用 Start / Stop 过渡动画做动作衔接
- 现有 `gen-voice.ts` 的改动（本子项目只运行它，为新动作生成语音）
