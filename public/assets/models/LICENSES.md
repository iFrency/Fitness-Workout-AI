# 素材授权

`mannequin.glb` 中的木头人体模型和动作动画（下文 Mixamo 一节列出的除外）来自 desk-break 项目：

- 来源：https://github.com/shlomorsh/desk-break
- 作者：Shlomy Reshef（https://parametric.co.il）
- 许可：MIT，完整原文见同目录 `LICENSE-desk-break.txt`

本项目只选取了其中 57 个动画，经过裁剪和压缩（`tools/catalog/build.ts`）。
动作中文名、要点和禁忌提示根据原项目英文步骤改写。

## Mixamo

以下动作的动画来自 Adobe Mixamo（https://www.mixamo.com），经 `tools/mixamo/retarget.py` 重新绑定到上面的木头人体模型后合入 `mannequin.glb`：

- `jumping-jacks`（开合跳）
- `high-knees`（高抬腿）
- `burpee`（波比跳）
- `air-squat`（深蹲）
- `push-up`（俯卧撑）

按 Adobe Mixamo 条款，这些动画免版税用于本项目的作品中；本项目不单独分发原始动画素材，原始 FBX 文件和中间文件不进仓库。
