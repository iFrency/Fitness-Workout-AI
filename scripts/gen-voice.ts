/**
 * Generates every coach voice clip with Doubao TTS (seed-tts-2.0, voice "Vivi 2.0") and writes
 * public/assets/voice/manifest.json ({ id: seconds }).
 * Usage: DOUBAO_TTS_API_KEY=<key> npx tsx scripts/gen-voice.ts [--force]
 * Existing clips are kept unless --force is given. The key is read from the environment only.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseCatalog } from '../src/catalog/types'
import { allPhrases } from '../src/coach/phrases'
import { mp3Duration } from './mp3'

const ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
const RESOURCE_ID = 'seed-tts-2.0'
const SPEAKER = 'zh_female_vv_uranus_bigtts'
const OUT_DIR = 'public/assets/voice'
const CATALOG_PATH = 'public/assets/catalog/exercises.json'
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

export async function synthesize(apiKey: string, text: string): Promise<Uint8Array> {
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
  const force = process.argv.includes('--force')
  const phrases = allPhrases(parseCatalog(JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))))
  mkdirSync(OUT_DIR, { recursive: true })
  const manifest: Record<string, number> = {}
  for (const [id, text] of Object.entries(phrases)) {
    const path = `${OUT_DIR}/${id}.mp3`
    if (force || !existsSync(path)) {
      writeFileSync(path, await synthesize(apiKey, text))
      console.log(`generated ${id}`)
    }
    manifest[id] = Math.round(mp3Duration(readFileSync(path)) * 1000) / 1000
  }
  for (const file of readdirSync(OUT_DIR)) {
    if (file.endsWith('.mp3') && !(file.slice(0, -4) in phrases)) {
      rmSync(`${OUT_DIR}/${file}`)
      console.log(`removed ${file}`)
    }
  }
  writeFileSync(`${OUT_DIR}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`manifest: ${Object.keys(manifest).length} clips`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
