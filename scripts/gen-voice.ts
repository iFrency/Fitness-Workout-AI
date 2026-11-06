/**
 * Generates the 26 voice cue mp3 files with Doubao TTS (seed-tts-2.0, voice "Vivi 2.0").
 * Usage: DOUBAO_TTS_API_KEY=<key> npx tsx scripts/gen-voice.ts
 * The key is read from the environment only and never written to disk.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { VOICE_IDS, type VoiceId } from '../src/beat/voiceCues'

const ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
const RESOURCE_ID = 'seed-tts-2.0'
const SPEAKER = 'zh_female_vv_uranus_bigtts'
const OUT_DIR = 'public/assets/voice'
const NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十']

export const VOICE_TEXTS: Readonly<Record<VoiceId, string>> = {
  ...(Object.fromEntries(NUMBERS.map((t, i) => [`n${i + 1}`, `${t}！`])) as Record<`n${number}`, string>),
  start: '开始！', switch: '换边！', rest: '休息一下', last3: '最后三次！', done: '完成，太棒了！', hey: '嘿！',
} as Record<VoiceId, string>

const SUCCESS_CODES = new Set([0, 20000000])

export function parseTtsStream(body: string): Uint8Array {
  const chunks: Uint8Array[] = []
  for (const line of body.split('\n')) {
    if (!line.trim()) continue
    const msg = JSON.parse(line) as { code: number; message?: string; data?: string | null }
    if (!SUCCESS_CODES.has(msg.code)) throw new Error(`TTS 错误 ${msg.code}: ${msg.message ?? ''}`)
    if (msg.data) chunks.push(Buffer.from(msg.data, 'base64'))
  }
  return Buffer.concat(chunks)
}

async function synthesize(apiKey: string, text: string): Promise<Uint8Array> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'X-Api-Resource-Id': RESOURCE_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify({ req_params: { text, speaker: SPEAKER, audio_params: { format: 'mp3', sample_rate: 24000 } } }),
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`TTS 请求失败 ${response.status}: ${body.slice(0, 200)}`)
  return parseTtsStream(body)
}

async function main(): Promise<void> {
  const apiKey = process.env.DOUBAO_TTS_API_KEY
  if (!apiKey) throw new Error('缺少环境变量 DOUBAO_TTS_API_KEY')
  mkdirSync(OUT_DIR, { recursive: true })
  for (const id of VOICE_IDS) {
    const audio = await synthesize(apiKey, VOICE_TEXTS[id])
    writeFileSync(`${OUT_DIR}/${id}.mp3`, audio)
    console.log(`${id}: ${audio.byteLength} bytes`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
