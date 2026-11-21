/**
 * Generates pronunciation variants for the count cues that sounded odd, plus a page to compare them.
 * Usage: DOUBAO_TTS_API_KEY=<key> npx tsx tools/voice-audition/generate.ts
 * Then: npm run dev, open http://localhost:5173/tools/voice-audition/
 */
import { copyFileSync, writeFileSync } from 'node:fs'
import { synthesize } from '../../scripts/gen-voice'

const DIR = 'tools/voice-audition'
const VARIANTS: readonly { id: string; label: string; text: string }[] = [
  { id: 'n1-a', label: '一（无感叹号）', text: '一' },
  { id: 'n1-b', label: '1（阿拉伯数字）', text: '1' },
  { id: 'n1-c', label: '一，（带停顿）', text: '一，' },
  { id: 'n5-a', label: '五（无感叹号）', text: '五' },
  { id: 'n5-b', label: '5（阿拉伯数字）', text: '5' },
  { id: 'n5-c', label: '五，（带停顿）', text: '五，' },
]

async function main(): Promise<void> {
  const apiKey = process.env.DOUBAO_TTS_API_KEY
  if (!apiKey) throw new Error('缺少环境变量 DOUBAO_TTS_API_KEY')
  for (const v of VARIANTS) writeFileSync(`${DIR}/${v.id}.mp3`, await synthesize(apiKey, v.text))
  copyFileSync('public/assets/voice/n1.mp3', `${DIR}/n1-current.mp3`)
  copyFileSync('public/assets/voice/n5.mp3', `${DIR}/n5-current.mp3`)
  const rows = [
    { id: 'n1-current', label: '一！（当前版本）' }, ...VARIANTS.slice(0, 3),
    { id: 'n5-current', label: '五！（当前版本）' }, ...VARIANTS.slice(3),
  ].map(v => `<li><span>${v.label}</span><audio controls src="./${v.id}.mp3"></audio></li>`).join('\n')
  writeFileSync(`${DIR}/index.html`, `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>口令发音试听</title>
<style>body{font-family:system-ui,sans-serif;padding:16px;max-width:520px;margin:auto}li{display:flex;
flex-direction:column;gap:4px;margin:12px 0}</style></head><body><h1>口令发音试听</h1>
<p>请选出"一"和"五"听起来最自然的写法。</p><ul>${rows}</ul></body></html>\n`)
  console.log(`generated ${VARIANTS.length} variants`)
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
