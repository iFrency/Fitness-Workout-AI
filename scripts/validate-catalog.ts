import { readFileSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { IDLE_CLIP } from '../src/catalog/constants'
import { PARTS, parseCatalog, type Exercise, type Level, type Part, type SegmentType } from '../src/catalog/types'
import { bpmFor, fitBeats } from '../src/planner/timing'

const MAX_GLB_BYTES = 3 * 1024 * 1024
const DURATION_TOLERANCE = 0.05

interface GltfJson {
  animations?: { name?: string; samplers: { input: number }[] }[]
  accessors?: { max?: number[] }[]
}

export function readGlbAnimations(bytes: Uint8Array): Map<string, number> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('不是 GLB 文件')
  const jsonLength = view.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as GltfJson
  const result = new Map<string, number>()
  for (const anim of json.animations ?? []) {
    const max = Math.max(...anim.samplers.map(s => json.accessors?.[s.input]?.max?.[0] ?? 0))
    result.set(anim.name ?? '', max)
  }
  return result
}

function bpmsFor(e: Exercise): number[] {
  if (e.type !== 'main') return [bpmFor(e.type, 1)]
  return ([1, 2, 3] as Level[]).filter(l => l >= e.level).map(l => bpmFor('main', l))
}

function clipErrors(catalog: readonly Exercise[], clips: Map<string, number>): string[] {
  const errors: string[] = []
  if (!clips.has(IDLE_CLIP)) errors.push(`待机动画 ${IDLE_CLIP} 不在 GLB 中`)
  for (const e of catalog) {
    const seconds = clips.get(e.clip)
    if (seconds === undefined) errors.push(`动作 ${e.id} 的动画 ${e.clip} 不在 GLB 中`)
    else if (Math.abs(seconds - e.clipSeconds) > DURATION_TOLERANCE) {
      errors.push(`动作 ${e.id} 的 clipSeconds ${e.clipSeconds} 与 GLB 时长 ${seconds.toFixed(3)} 不符`)
    }
    for (const bpm of bpmsFor(e)) {
      if (!fitBeats(e.clipSeconds, e.beatsPerRep, bpm)) errors.push(`动作 ${e.id} 在 ${bpm} BPM 下无法对齐节拍`)
    }
  }
  return errors
}

function count(catalog: readonly Exercise[], type: SegmentType, test: (e: Exercise) => boolean): number {
  return catalog.filter(e => e.type === type && test(e)).length
}

function coverageErrors(catalog: readonly Exercise[]): string[] {
  const errors: string[] = []
  const covers = (part: Part) => (e: Exercise) => e.parts.includes(part) || e.parts.includes('全身')
  for (const part of PARTS.slice(0, 5)) {
    if (count(catalog, 'main', e => e.parts.includes(part) && e.level === 1) < 2) errors.push(`${part} 的入门主训动作少于 2 条`)
    if (count(catalog, 'warmup', covers(part)) < 1) errors.push(`${part} 没有可用的热身动作`)
    if (count(catalog, 'stretch', covers(part)) < 1) errors.push(`${part} 没有可用的拉伸动作`)
  }
  if (count(catalog, 'warmup', () => true) < 6) errors.push('热身动作少于 6 条')
  if (count(catalog, 'stretch', () => true) < 8) errors.push('拉伸动作少于 8 条')
  return errors
}

export function validateCatalog(catalog: readonly Exercise[], clips: Map<string, number>, glbBytes: number): string[] {
  const errors: string[] = []
  if (catalog.length < 40 || catalog.length > 80) errors.push(`动作数 ${catalog.length} 不在 40 到 80 之间`)
  if (glbBytes >= MAX_GLB_BYTES) errors.push(`GLB 大小 ${(glbBytes / 1048576).toFixed(2)}MB，应小于 3MB`)
  return [...errors, ...clipErrors(catalog, clips), ...coverageErrors(catalog)]
}

function main(): void {
  const catalog = parseCatalog(JSON.parse(readFileSync('public/assets/catalog/exercises.json', 'utf8')))
  const glbPath = 'public/assets/models/mannequin.glb'
  const errors = validateCatalog(catalog, readGlbAnimations(readFileSync(glbPath)), statSync(glbPath).size)
  errors.forEach(e => console.error(e))
  process.exit(errors.length > 0 ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
