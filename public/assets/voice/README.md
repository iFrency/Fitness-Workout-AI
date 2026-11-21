# 口令音频

由 `scripts/gen-voice.ts` 用豆包语音合成 2.0（音色 Vivi 2.0，`zh_female_vv_uranus_bigtts`）生成。

重新生成：

```bash
DOUBAO_TTS_API_KEY=<你的 key> npx tsx scripts/gen-voice.ts
```

文件名与文本对照见 `scripts/gen-voice.ts` 中的 `VOICE_TEXTS`：`n1`-`n20` 读一到二十，`start` 开始，`switch` 换边，`rest` 休息一下，`last3` 最后三次，`done` 完成，太棒了，`hey` 嘿。
