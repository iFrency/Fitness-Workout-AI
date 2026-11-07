# Mixamo 动作素材管线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Mixamo 动画重新绑定到木头人骨架，合并进 `mannequin.glb` 和 `exercises.json`，交付第一批跳跃类和徒手力量动作。

**Architecture:** 离线两段式。`tools/mixamo/run.ts` 逐个调用 Blender 脚本 `tools/mixamo/retarget.py`，输出每个动作一个 GLB 和一份测量报告，由 `checkReport.ts` 判定是否通过；`tools/catalog/build.ts` 新增 `--mixamo` 参数，用 `mergeClips.ts` 按骨骼名把这些动画挂到 desk-break 文档上，后面沿用现有的压缩和动作库生成流程。App 运行时代码不改。

**Tech Stack:** TypeScript（tsx 运行）、@gltf-transform/core 4、zod 4、vitest；Blender 5.2 Python（bpy、mathutils、numpy）。

**Spec:** `docs/superpowers/specs/2026-11-07-mixamo-clip-pipeline-design.md`

## Global Constraints

- Mixamo FBX 放在 `../_vendor/mixamo/`，重新绑定的中间文件放在 `../_vendor/mixamo-retargeted/`，都不进仓库；仓库只提交 `mannequin.glb`、`exercises.json`、缩略图、语音和文档。
- 木头人骨骼名（不得改动）：`hips legL kneeL footL legR kneeR footR spine armL elbowL handL armR elbowR handR neck prop`。
- 检查阈值：循环接缝每根骨骼角度差 ≤ 10°、髋部位置差 ≤ 0.03 米；踝部最低 ≥ 0.03 米；原地化后首尾水平位移 ≤ 0.05 米；时长 0.5 到 6 秒；`mannequin.glb` < 3 MB（现有 `validate:catalog` 已检查）。
- 跳跃类（`impact: 'high'`）动作难度必须 ≥ 2。
- `defaultReps` 统一为 8；每个动作 2 条要点。
- Blender 路径取环境变量 `BLENDER`，未设置时用 `D:/Program Files/Blender Foundation/Blender 5.2/blender.exe`。
- 不带 `--mixamo` 时，`build.ts` 的输出必须和现在完全一致。
- 界面文案、报错信息用中文；源码不使用 emoji。

## Review Focus

1. 清单里写的 FBX 文件名和实际下载的不一致（Mixamo 文件名带空格、大小写不同）：应在调用 Blender 之前报错，并列出期望的完整路径。→ Task 6 `missingFbx` 测试。
2. Blender 中途崩溃，报告 JSON 不完整或字段缺失：应报“动作 x 的报告格式错误”，而不是读到 `undefined` 后判为通过。→ Task 1 `parseReport` 测试。
3. Mixamo 动作 id 与 desk-break 动作 id 或待机动画重名：应在测试中失败，而不是在 GLB 里悄悄覆盖。→ Task 2 测试。
4. 跳跃类动作误标为入门难度，导致入门方案出现跳跃：应在测试中失败。→ Task 2 测试。
5. 重新绑定目录里缺某个动作的 GLB，或者 GLB 里的动画名和 id 不一致：`build.ts` 应报错并指出 id，而不是生成缺动画的模型。→ Task 3 `mergeClips` 测试。

---

### Task 1: 报告格式与检查规则

**Files:**
- Create: `tools/mixamo/checkReport.ts`
- Test: `tests/tools/checkReport.test.ts`

**Interfaces:**
- Produces:
  - `ReportSchema`（zod）与 `type ClipReport = { id: string; missingBones: string[]; seamMaxAngleDeg: number; seamHipsDistance: number; minAnkleHeight: number; driftAfterFix: number; durationSeconds: number }`
  - `LIMITS = { seamMaxAngleDeg: 10, seamHipsDistance: 0.03, minAnkleHeight: 0.03, driftAfterFix: 0.05, minDuration: 0.5, maxDuration: 6 } as const`
  - `parseReport(id: string, data: unknown): ClipReport`：格式错误时抛出 `Error('动作 <id> 的报告格式错误: <字段>: <原因>')`
  - `checkReport(r: ClipReport): string[]`：返回错误信息，空数组表示通过

- [ ] **Step 1: Write the failing tests**

```ts
const ok: ClipReport = { id: 'burpee', missingBones: [], seamMaxAngleDeg: 2, seamHipsDistance: 0.01,
  minAnkleHeight: 0.054, driftAfterFix: 0, durationSeconds: 3.17 }

it('a clean report passes', () => expect(checkReport(ok)).toEqual([]))
it('values exactly at the limits pass', () => expect(checkReport({ ...ok, seamMaxAngleDeg: 10,
  seamHipsDistance: 0.03, minAnkleHeight: 0.03, driftAfterFix: 0.05, durationSeconds: 6 })).toEqual([]))
it.each([
  ['missingBones', { missingBones: ['mixamorig:LeftFoot'] }, 'mixamorig:LeftFoot'],
  ['seamMaxAngleDeg', { seamMaxAngleDeg: 10.5 }, '10.5'],
  ['seamHipsDistance', { seamHipsDistance: 0.031 }, '0.031'],
  ['minAnkleHeight', { minAnkleHeight: 0.029 }, '0.029'],
  ['driftAfterFix', { driftAfterFix: 0.06 }, '0.06'],
  ['durationSeconds low', { durationSeconds: 0.4 }, '0.4'],
  ['durationSeconds high', { durationSeconds: 6.1 }, '6.1'],
])('%s out of range fails with id and value', (_, patch, value) => {
  const errors = checkReport({ ...ok, ...patch })
  expect(errors).toHaveLength(1)
  expect(errors[0]).toContain('burpee')
  expect(errors[0]).toContain(value)
})
it('parseReport rejects a truncated report naming the clip', () =>
  expect(() => parseReport('burpee', { id: 'burpee', missingBones: [] })).toThrow(/动作 burpee 的报告格式错误/))
it('parseReport rejects a report whose id does not match', () =>
  expect(() => parseReport('burpee', { ...ok, id: 'push-up' })).toThrow(/burpee/))
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/tools/checkReport.test.ts`
Expected: FAIL，找不到模块 `tools/mixamo/checkReport`

- [ ] **Step 3: Implement `tools/mixamo/checkReport.ts`**

每一项检查生成一条中文信息，格式为 `动作 <id>：<检查项> <实际值>，应 <标准>`；`missingBones` 非空时只报这一项（其余数值无意义）。

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/tools/checkReport.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/mixamo/checkReport.ts tests/tools/checkReport.test.ts
git commit -m "feat: add Mixamo retarget report checks"
```

### Task 2: 动作字段转换与 Mixamo 清单

**Files:**
- Create: `tools/catalog/exercise.ts`（把 `build.ts` 里的 `bpmsFor`、`pickBeats` 原样移过来）
- Create: `tools/catalog/mixamoSelection.ts`
- Modify: `tools/catalog/build.ts`（改为从 `exercise.ts` 导入这两个函数，行为不变）
- Test: `tests/tools/mixamoSelection.test.ts`

**Interfaces:**
- Produces:
  - `bpmsFor(type: SegmentType, level: Level): number[]`、`pickBeats(clipSeconds: number, bpms: number[]): number`（签名与现有一致）
  - `interface MixamoRow { id: string; fbx: string; frames?: [number, number]; name: string; parts: readonly Part[]; type: SegmentType; level: Level; impact: 'low' | 'high'; sided: boolean; cues: readonly string[]; caution: string }`
  - `MIXAMO_SELECTION: readonly MixamoRow[]`
  - `fromMixamoRow(row: MixamoRow, clipSeconds: number): Exercise`：`clip = id`，`defaultReps = 8`，`beatsPerRep = pickBeats(clipSeconds, bpmsFor(type, level))`

- [ ] **Step 1: Write the failing tests**

```ts
it('every row becomes a valid exercise', () =>
  expect(() => parseCatalog(MIXAMO_SELECTION.map(r => fromMixamoRow(r, 1.1)))).not.toThrow())
it('ids do not clash with desk-break rows or the idle clip', () => {
  const taken = new Set([...SELECTION.map(r => r[0]), IDLE_ID])
  MIXAMO_SELECTION.forEach(r => expect(taken.has(r.id), r.id).toBe(false))
})
it('high-impact moves are never beginner level', () =>
  MIXAMO_SELECTION.filter(r => r.impact === 'high').forEach(r => expect(r.level, r.id).toBeGreaterThanOrEqual(2)))
it('each move has exactly two cues', () => MIXAMO_SELECTION.forEach(r => expect(r.cues, r.id).toHaveLength(2)))
it('fromMixamoRow fills clip, impact and defaultReps', () => {
  const e = fromMixamoRow(MIXAMO_SELECTION.find(r => r.id === 'burpee')!, 3.167)
  expect(e).toMatchObject({ id: 'burpee', clip: 'burpee', clipSeconds: 3.167, impact: 'high', defaultReps: 8 })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/tools/mixamoSelection.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 3: Move `bpmsFor` and `pickBeats` into `tools/catalog/exercise.ts`; add `fromMixamoRow` there; update imports in `build.ts`**

- [ ] **Step 4: Write `tools/catalog/mixamoSelection.ts` with the 6 required rows**

| id | fbx | name | parts | level | impact | 禁忌（caution） |
|---|---|---|---|---|---|---|
| `jumping-jacks` | `Jumping Jacks.fbx` | 开合跳 | 全身 | 2 | high | 膝盖不适时改为无跳开合步 |
| `high-knees` | `High Knees.fbx` | 高抬腿 | 全身、臀腿 | 2 | high | 落地用前脚掌，膝盖不适时改为原地踏步 |
| `burpee` | `Burpee.fbx` | 波比跳 | 全身 | 3 | high | 膝盖或腰部不适时，改为后撤步，不跳 |
| `air-squat` | `Air Squat.fbx` | 深蹲 | 臀腿 | 1 | low | 膝盖对准脚尖，不要内扣 |
| `push-up` | `Push Up.fbx` | 俯卧撑 | 胸背、上肢 | 3 | low | 做不了时改为跪姿，不要塌腰 |
| `stair-run` | `Running Up Stairs.fbx` | 原地爬楼梯 | 全身、臀腿 | 1 | low | （空） |

全部 `type: 'main'`、`sided: false`。每个动作写 2 条要点，语气与 `selection.ts` 现有要点一致（第一条讲起始姿势，第二条讲动作过程）。`fbx` 文件名以 Task 7 实际下载的为准。

- [ ] **Step 5: Run the new tests and the existing suite**

Run: `npx vitest run`
Expected: 全部 PASS

- [ ] **Step 6: Verify `build.ts` output is unchanged**

Run: `npx tsx tools/catalog/build.ts ../_vendor/desk-break && git status --short public/assets`
Expected: 没有输出（模型和动作库与提交版本一致）

- [ ] **Step 7: Commit**

```bash
git add tools/catalog/exercise.ts tools/catalog/mixamoSelection.ts tools/catalog/build.ts tests/tools/mixamoSelection.test.ts
git commit -m "feat: add Mixamo selection and shared exercise helpers"
```

### Task 3: 按骨骼名合并动画

**Files:**
- Create: `tools/catalog/mergeClips.ts`
- Test: `tests/tools/mergeClips.test.ts`

**Interfaces:**
- Produces: `mergeClip(target: Document, source: Document, clipName: string): number`。把 `source` 中名为 `clipName` 的动画复制进 `target`：通道按目标节点**名字**对应到 `target` 中同名节点，输入、输出数据复制为 `target` 里的新 accessor，插值方式保持；返回动画时长（秒，输入 accessor 的最大值）。
- 错误（中文，都包含 `clipName`）：
  - `source` 里没有这个名字的动画
  - 某个通道指向的节点名在 `target` 里不存在（信息里包含节点名）
  - `target` 里已有同名动画

- [ ] **Step 1: Write the failing tests**

测试用 `new Document()` 手工搭两份文档：`target` 有节点 `hips`、`spine`，没有动画；`source` 有同名节点和一个名为 `burpee` 的动画（`hips` 的 translation 通道和 `spine` 的 rotation 通道，时间点 `[0, 1.5]`）。

```ts
it('copies channels onto same-named nodes in the target', () => {
  expect(mergeClip(target, source, 'burpee')).toBeCloseTo(1.5)
  const anim = target.getRoot().listAnimations().find(a => a.getName() === 'burpee')!
  expect(anim.listChannels().map(c => [c.getTargetNode()!.getName(), c.getTargetPath()]))
    .toEqual([['hips', 'translation'], ['spine', 'rotation']])
  anim.listChannels().forEach(c => expect(target.getRoot().listNodes()).toContain(c.getTargetNode()))
})
it('fails when the source has no animation with that name', () =>
  expect(() => mergeClip(target, source, 'push-up')).toThrow(/push-up/))
it('fails when a channel targets a bone the target lacks', () => {
  /* rename target's spine node to chest first */
  expect(() => mergeClip(target, source, 'burpee')).toThrow(/spine/)
})
it('fails when the target already has that animation', () => {
  mergeClip(target, source, 'burpee')
  expect(() => mergeClip(target, source, 'burpee')).toThrow(/burpee/)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/tools/mergeClips.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 3: Implement `tools/catalog/mergeClips.ts`**

先检查全部通道的节点名都存在，再开始创建对象，保证失败时 `target` 不留下半个动画。新 accessor 放进 `target` 的第一个 buffer（`target.getRoot().listBuffers()[0]`，没有时新建）。

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/tools/mergeClips.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/catalog/mergeClips.ts tests/tools/mergeClips.test.ts
git commit -m "feat: merge retargeted clips into the mannequin by bone name"
```

### Task 4: `build.ts` 支持 `--mixamo`

**Files:**
- Modify: `tools/catalog/build.ts`

**Interfaces:**
- Consumes: `mergeClip`（Task 3）、`MIXAMO_SELECTION`、`fromMixamoRow`（Task 2）
- Produces: 命令 `npx tsx tools/catalog/build.ts <desk-break 目录> [--mixamo <重新绑定目录>]`

- [ ] **Step 1: Parse arguments**

第一个不以 `--` 开头的参数是 desk-break 目录（默认 `../_vendor/desk-break`，与现在一致）；`--mixamo` 后面跟目录。

- [ ] **Step 2: Merge before the existing `prune/resample/meshopt` transform**

带 `--mixamo` 时，对 `MIXAMO_SELECTION` 的每一行读取 `<目录>/<id>.glb`；文件不存在时抛出 `Error('缺少重新绑定文件: <完整路径>，先运行 tools/mixamo/run.ts')`。用 `mergeClip(doc, sourceDoc, id)` 合并，并把返回的时长记进 `durations`（按 desk-break 的同样方式保留 3 位小数）。合并必须在裁剪动画（`keep` 过滤）之后、`doc.transform(...)` 之前。

- [ ] **Step 3: Append Mixamo exercises to the catalog**

`catalog = [...desk-break 部分, ...MIXAMO_SELECTION.map(r => fromMixamoRow(r, durations.get(r.id)!))]`，仍然经过 `parseCatalog`。不带 `--mixamo` 时不追加。

- [ ] **Step 4: Verify the no-flag path is unchanged**

Run: `npx tsx tools/catalog/build.ts ../_vendor/desk-break && git status --short public/assets`
Expected: 没有输出

- [ ] **Step 5: Typecheck and test**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: 无类型错误，全部 PASS

- [ ] **Step 6: Commit**

```bash
git add tools/catalog/build.ts
git commit -m "feat: merge Mixamo clips into the catalog build"
```

### Task 5: Blender 重新绑定脚本

**Files:**
- Create: `tools/mixamo/retarget.py`

**Interfaces:**
- Produces: `blender -b --python tools/mixamo/retarget.py -- --rig <rig.glb> --fbx <x.fbx> --id <id> --out <目录> [--frames <起> <止>] [--sheet]`
  - 输出 `<目录>/<id>.glb`：只含木头人骨架、网格和名为 `<id>` 的一个动画
  - 输出 `<目录>/<id>.report.json`：字段与 Task 1 的 `ClipReport` 完全一致（键名相同，单位米、度、秒）
  - 带 `--sheet` 时输出 `<目录>/<id>.sheet.png`
  - 缺骨骼时只写报告（`missingBones` 非空、其余数值填 0）并以退出码 0 结束，由 `run.ts` 判定

- [ ] **Step 1: Write the script**

导入 `--rig`（无压缩的木头人，Task 6 准备）后删除它带的所有动作，再导入 FBX；按 `--frames` 或 FBX 动作的完整帧段逐帧处理。重新绑定规则见 spec 第 4 节，核心算法如下（已在验证中跑通）：

```python
P = 'mixamorig:'
REQUIRED = ['Hips','Spine','Neck','HeadTop_End','LeftArm','LeftForeArm','LeftHand','LeftHandMiddle1',
            'RightArm','RightForeArm','RightHand','RightHandMiddle1','LeftUpLeg','LeftLeg','LeftFoot',
            'LeftToeBase','RightUpLeg','RightLeg','RightFoot','RightToeBase']
SEG = {  # target bone: (target child or None, source from, source to)
  'armL': ('elbowL','LeftArm','LeftForeArm'), 'elbowL': ('handL','LeftForeArm','LeftHand'),
  'handL': (None,'LeftHand','LeftHandMiddle1'), 'legL': ('kneeL','LeftUpLeg','LeftLeg'),
  'kneeL': ('footL','LeftLeg','LeftFoot'), 'footL': (None,'LeftFoot','LeftToeBase'),
  # ... R side mirrors L; 'neck': (None,'Neck','HeadTop_End')
}
# rest_dir(b): child - head (armature space); hand: own head - parent head;
#   foot: source rest (ToeBase - Foot) with z zeroed; neck: (0,0,1)
def basis(x, up):           # right-handed frame from a lateral and an up vector
    x = x.normalized(); z = (up - x * up.dot(x)).normalized(); return Matrix((x, z.cross(x), z)).transposed()
k = (head['legL'] - head['footL']).length / (src_rest('LeftUpLeg') - src_rest('LeftFoot')).length
ORDER = ['hips','spine','neck','armL','elbowL','handL','armR','elbowR','handR',
         'legL','kneeL','footL','legR','kneeR','footR']
for f in frames:
    scene.frame_set(f)
    for name in ORDER:
        view_layer.update()
        if name == 'hips':
            q = (basis(sw('LeftUpLeg')-sw('RightUpLeg'), sw('Spine')-sw('Hips')) @ Bh_rest.inverted()).to_quaternion()
            pos = head['hips'] + (sw('Hips') - src_rest('Hips')) * k - drift(f)   # drift: see below
        elif name == 'spine':
            q = (basis(sw('LeftArm')-sw('RightArm'), sw('Neck')-sw('Spine')) @ Bs_rest.inverted()).to_quaternion()
            pos = pb.head.copy()
        else:
            _, s0, s1 = SEG[name]; q = rest_dir[name].rotation_difference((sw(s1)-sw(s0)).normalized()); pos = pb.head.copy()
        pb.matrix = Matrix.Translation(pos) @ (q @ rest_q[name]).to_matrix().to_4x4()
        view_layer.update(); keyframe rotation_quaternion (and location for hips)
```

- `sw(n)`：源骨骼 `P+n` 当前帧的世界坐标头部；`src_rest(n)`：初始姿势的世界坐标头部。`Bh_rest` 用木头人的 `legL−legR` 与 `spine−hips` 构造，`Bs_rest` 用 `armL−armR` 与 `neck−spine` 构造。
- **原地化**：先算出未修正的首尾髋部水平位移 `d`（z 置 0），`drift(f) = d × (f − 首帧) / (末帧 − 首帧)`。
- **报告**：
  - `seamMaxAngleDeg`：首帧与末帧各骨骼姿态四元数夹角的最大值
  - `seamHipsDistance`：首尾髋部位置距离
  - `minAnkleHeight`：全部帧里 `footL`、`footR` 头部 z 的最小值
  - `driftAfterFix`：修正后首尾髋部水平距离
  - `durationSeconds`：`(末帧 − 首帧) / fps`
  - `missingBones`：`REQUIRED` 中源骨架没有的骨骼（带 `mixamorig:` 前缀）
- **导出**：导出前删除 FBX 的骨架、网格和全部动作，只留木头人与新建的 `<id>` 动作，然后用 `export_animation_mode='ACTIONS'` 导出（验证时多导出了一个 Mixamo 原始动画，就是因为没删）。
- **对比图**：Workbench 渲染，正面一行、侧面一行，各 8 帧均匀取样，木头人和 Mixamo 原模型并排（Mixamo 模型平移 1.2 米），用 numpy 拼成一张 PNG。

- [ ] **Step 2: Verify on the two downloaded clips**

已下载的 FBX 目前在 `D:/AITools/Project/mixamo-spike/`，先把 `Jumping Jacks.fbx` 和 `Burpee.fbx` 复制到 `../_vendor/mixamo/`。再手工准备无压缩的骨架（Task 6 会把这一步做进 `run.ts`）：

Run: `mkdir -p ../_vendor/mixamo-retargeted && npx tsx -e "import {NodeIO} from '@gltf-transform/core'; import {ALL_EXTENSIONS} from '@gltf-transform/extensions'; import {MeshoptDecoder} from 'meshoptimizer'; await MeshoptDecoder.ready; const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder}); const d = await io.read('public/assets/models/mannequin.glb'); d.getRoot().listExtensionsUsed().forEach(e => e.dispose()); await io.write('../_vendor/mixamo-retargeted/_rig.glb', d)"`
Expected: 生成 `_rig.glb`

然后：

Run: `"$BLENDER" -b --python tools/mixamo/retarget.py -- --rig ../_vendor/mixamo-retargeted/_rig.glb --fbx "../_vendor/mixamo/Burpee.fbx" --id burpee --out ../_vendor/mixamo-retargeted --sheet`
Expected: 生成 `burpee.glb`、`burpee.report.json`、`burpee.sheet.png`；报告中 `minAnkleHeight` 约 0.054、`missingBones` 为空；对开合跳同样运行，`minAnkleHeight` 约 0.095。人工查看两张对比图，姿势和原动作一致。

- [ ] **Step 3: Verify the exported GLB holds only one animation**

Run: `npx tsx -e "import {NodeIO} from '@gltf-transform/core'; new NodeIO().read('../_vendor/mixamo-retargeted/burpee.glb').then(d => console.log(d.getRoot().listAnimations().map(a => a.getName())))"`
Expected: `[ 'burpee' ]`

- [ ] **Step 4: Commit**

```bash
git add tools/mixamo/retarget.py
git commit -m "feat: add Blender script that retargets Mixamo clips onto the mannequin"
```

### Task 6: 批量运行器 `run.ts`

**Files:**
- Create: `tools/mixamo/run.ts`
- Test: `tests/tools/run.test.ts`

**Interfaces:**
- Consumes: `MIXAMO_SELECTION`（Task 2）、`parseReport`、`checkReport`（Task 1）、`retarget.py` 命令行（Task 5）
- Produces:
  - 命令：`npx tsx tools/mixamo/run.ts <fbx 目录> <输出目录> [--sheet] [--force]`
  - 纯函数 `missingFbx(rows: readonly MixamoRow[], fbxDir: string, files: readonly string[]): string[]`：返回清单里有、目录里没有的 FBX 的完整路径
  - 纯函数 `blenderPath(env: NodeJS.ProcessEnv): string`

- [ ] **Step 1: Write the failing tests**

```ts
const rows = MIXAMO_SELECTION.filter(r => ['burpee', 'push-up'].includes(r.id))
it('lists FBX files named in the selection but absent on disk', () =>
  expect(missingFbx(rows, '/v/mixamo', ['Burpee.fbx', 'push up.fbx'])).toEqual([join('/v/mixamo', 'Push Up.fbx')]))
it('reports nothing when every file is present', () =>
  expect(missingFbx(rows, '/v/mixamo', ['Burpee.fbx', 'Push Up.fbx'])).toEqual([]))
it('uses BLENDER when set and the default install path otherwise', () => {
  expect(blenderPath({ BLENDER: 'C:/b/blender.exe' })).toBe('C:/b/blender.exe')
  expect(blenderPath({})).toBe('D:/Program Files/Blender Foundation/Blender 5.2/blender.exe')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/tools/run.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 3: Implement `tools/mixamo/run.ts`**

主流程（只在直接运行时执行，判断方式与 `scripts/validate-catalog.ts` 末行相同）：

1. `missingFbx` 非空时，列出全部缺失路径并以退出码 1 结束，不调用 Blender。
2. `blenderPath` 指向的文件不存在时，报错“找不到 Blender，请设置环境变量 BLENDER”，退出码 1。
3. 准备骨架：读取 `public/assets/models/mannequin.glb`（需要 meshopt 解码器），移除 `listExtensionsUsed()` 里的所有扩展，写成 `<输出目录>/_rig.glb`（不压缩）。
4. 逐行处理：输出 GLB 比 FBX 和 `retarget.py` 都新、且没有 `--force` 时跳过；否则用 `spawnSync` 调用 Blender（参数见 Task 5，`--frames` 来自行的 `frames`，`--sheet` 透传）。Blender 退出码非 0 时记一条错误并继续处理下一个。
5. 读取每个动作的报告：`parseReport` → `checkReport`，汇总全部错误。有错误时逐条打印并以退出码 1 结束；否则打印每个动作的时长和最低踝部高度。

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/tools/run.test.ts`
Expected: PASS

- [ ] **Step 5: Run end-to-end on the two downloaded clips**

此时 `../_vendor/mixamo/` 里只有开合跳和波比跳，所以预期结果是报告缺文件：

Run: `npx tsx tools/mixamo/run.ts ../_vendor/mixamo ../_vendor/mixamo-retargeted`
Expected: 退出码 1，列出 `High Knees.fbx`、`Air Squat.fbx`、`Push Up.fbx`、`Running Up Stairs.fbx` 的完整路径，且没有调用 Blender

- [ ] **Step 6: Commit**

```bash
git add tools/mixamo/run.ts tests/tools/run.test.ts
git commit -m "feat: add batch runner for Mixamo retargeting with report checks"
```

### Task 7: 第一批动作入库

**Files:**
- Modify: `tools/catalog/mixamoSelection.ts`（按实际文件名修正 `fbx`；补充找到的可选动作）
- Modify: `public/assets/models/mannequin.glb`、`public/assets/catalog/exercises.json`、`public/assets/thumbs/*.png`、`public/assets/voice/*`（构建产物）
- Modify: `public/assets/models/LICENSES.md`
- Modify: `docs/device-test-checklist.md`

- [ ] **Step 1: User downloads the remaining FBX files**

由用户登录 Mixamo 下载（设置：FBX Binary、With Skin、30 FPS、Keyframe Reduction 选 none，有 In Place 时勾选）：High Knees（或 Running In Place）、Air Squat、Push Up、Running Up Stairs，以及 spec 第 2.1 节里找得到的可选动作。把这些文件和已下载的 `Jumping Jacks.fbx`、`Burpee.fbx` 一起放进 `../_vendor/mixamo/`。

- [ ] **Step 2: Align the selection with the downloaded files**

按实际文件名修改 `fbx`。可选动作按 spec 第 2.1 节加行，规则不变：跳跃类难度 ≥ 2，每个动作 2 条要点。

Run: `npx vitest run tests/tools`
Expected: PASS

- [ ] **Step 3: Retarget with contact sheets**

Run: `npx tsx tools/mixamo/run.ts ../_vendor/mixamo ../_vendor/mixamo-retargeted --sheet`
Expected: 退出码 0，每个动作打印时长和最低踝部高度

如果某个动作的循环接缝不通过，先在该行加 `frames` 截掉开头或结尾，再重新运行。

- [ ] **Step 4: Human review of every contact sheet**

把 `../_vendor/mixamo-retargeted/*.sheet.png` 发给用户逐张确认姿势正确。用户确认之前不进入下一步。

- [ ] **Step 5: Build, thumbnails, voice**

Run: `npx tsx tools/catalog/build.ts ../_vendor/desk-break --mixamo ../_vendor/mixamo-retargeted`
Run: `npx tsx tools/thumbs/render.ts`
Run: `npx tsx scripts/gen-voice.ts`（需要用户本机设置 `DOUBAO_TTS_API_KEY`；只生成新动作的语音）
Expected: 三条命令都成功；`public/assets/thumbs/` 下出现新动作的 PNG；`public/assets/voice/manifest.json` 里有每个新动作的 `next-<id>`、`cue-<id>-0`、`cue-<id>-1`

- [ ] **Step 6: Validate**

Run: `npm run validate:catalog && npx vitest run && npx tsc --noEmit -p .`
Expected: 动作库校验无错误（包括 GLB < 3MB、每个动作有动画且能对齐节拍）；全部测试 PASS（包括 `tests/coach/manifest.test.ts` 的语音覆盖检查）

- [ ] **Step 7: Check in the browser**

用 preview 打开 App，选“全身 + 10 分钟 + 挑战”生成方案，用“替换”换出开合跳、波比跳、俯卧撑，进入训练，确认 3D 人物动作正确、跟拍、脚不穿地，并截图。

- [ ] **Step 8: Docs**

- `LICENSES.md` 新增“Mixamo”一节：说明哪些动画来自 Adobe Mixamo（列出动作 id）；说明按其条款免版税用于项目、不单独分发原始素材、原始 FBX 不进仓库；并把“本项目只选取了其中 57 个动画”这句话改成与实际一致。
- `device-test-checklist.md` 新增一项：手机上播放开合跳、波比跳时节拍对得上、画面不卡、脚不穿地。

- [ ] **Step 9: Commit**

```bash
git add tools/catalog/mixamoSelection.ts public/assets docs/device-test-checklist.md
git commit -m "feat: add first batch of Mixamo jump and bodyweight strength moves"
```
