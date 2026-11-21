# 魔性健身

一款开源、免费的轻量健身应用。选好想练的部位和时长，应用自动编排一套动作，由 3D 木头人逐个演示，配上和动作节拍同步的魔性音乐和中文语音教练。

无广告、无会员、无账号，不连接任何云端服务：训练记录和设置只保存在你自己的设备上，打开过一次后断网也能完整训练。

## 功能

- **部位塑形**：选择肩颈、上肢、胸背、腰腹、臀腿或全身，加上时长（5 到 30 分钟）和难度（入门、进阶、挑战），按"热身、主训、拉伸"自动生成方案；主训可循环多轮。方案生成后可以替换、删除动作或整套换掉。
- **燃脂跳操**：按"学动作、连起来"的段落编排跳操课程，节奏和强度随段落起伏。
- **3D 演示**：主画面加正面、侧面两个画中画小窗，点小窗即可切换视角；默认镜像，像照镜子一样跟练。
- **节拍音乐**：程序实时合成电子鬼畜、广场舞、木鱼禅意等风格，动作到位落在重拍上；也可以换成手机里自己的音乐（只在本机播放，不上传）。
- **语音教练**：开始、动作要点、过半鼓励、最后十秒、倒数和"下一个"预告，语音互不重叠。
- **训练体验**：休息和换边倒计时、暂停/跳过/上一个/结束、训练中屏幕常亮、意外退出后可继续上次训练。
- **多平台**：网页版可"添加到主屏幕"离线使用（PWA）；另有 Android 应用，全部素材打包进 APK。

## 快速开始

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

在手机上测试：

```bash
npx vite --host
```

然后用手机打开终端显示的局域网地址。离线缓存和标准屏幕常亮接口需要 HTTPS，局域网 http 访问时会自动使用兼容方案。

正式构建与本地预览：

```bash
npm run build
npx vite preview --host
```

Android 应用的构建与签名见 [docs/android.md](docs/android.md)。

## 开发

| 命令 | 作用 |
|---|---|
| `npm test` | 单元测试（Vitest） |
| `npm run coverage` | 单元测试与覆盖率 |
| `npm run e2e` | 端到端测试（Playwright） |
| `npm run validate:catalog` | 检查动作库与 3D 模型是否匹配 |

重新生成语音（需要你自己的豆包语音合成 API key，只通过环境变量传入）：

```bash
DOUBAO_TTS_API_KEY=<你的 key> npx tsx scripts/gen-voice.ts
```

目录概览：

| 目录 | 内容 |
|---|---|
| `src/planner` | 方案生成规则引擎 |
| `src/player` | 训练时间线与会话控制 |
| `src/beat`、`src/audio` | 节拍排程、合成音色、音频引擎 |
| `src/coach` | 语音教练语句库与播报排程 |
| `src/stage` | 3D 舞台（React Three Fiber） |
| `src/ui` | 页面与状态 |
| `tools`、`scripts` | 素材处理、语音生成、动作库校验 |
| `docs/superpowers` | 各功能的设计文档与实现计划 |

设计文档：

- [MVP 设计](docs/superpowers/specs/2026-11-06-fitness-workout-mvp-design.md)
- [按时间计与语音教练](docs/superpowers/specs/2026-11-07-timed-coach-design.md)
- [Mixamo 动画接入流程](docs/superpowers/specs/2026-11-07-mixamo-clip-pipeline-design.md)
- [燃脂跳操模式](docs/superpowers/specs/2026-11-08-dance-cardio-mode-design.md)
- [真机检查清单](docs/device-test-checklist.md)

## 健康提示

本应用提供的动作仅供一般健身参考，不构成医疗建议。如有心血管疾病、关节损伤、怀孕或其他健康问题，请先咨询医生。训练中如感到疼痛、头晕或不适，请立即停止。

## 许可证与第三方素材

本项目代码以 [MIT 许可证](LICENSE) 发布。

第三方素材按各自条款使用：

- **3D 人体模型与大部分动作动画**：来自 [desk-break](https://github.com/shlomorsh/desk-break)，作者 Shlomy Reshef，MIT 许可。
- **部分动作动画**（开合跳、高抬腿、波比跳、深蹲、俯卧撑）：来自 [Adobe Mixamo](https://www.mixamo.com)，按 Mixamo 条款合入本项目的模型文件；原始动画文件不随仓库分发。
- **语音口令**：由豆包语音合成（音色 Vivi 2.0）生成。
- **节拍音效**：由程序实时合成，不含外部采样。

详细说明见 [public/assets/models/LICENSES.md](public/assets/models/LICENSES.md)。
