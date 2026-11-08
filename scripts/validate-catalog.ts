import { readFileSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { IDLE_CLIP } from '../src/catalog/constants'
import { PARTS, parseCatalog, type Exercise, type Level, type Part, type SegmentType } from '../src/catalog/types'
import { bpmFor, fitBeats } from '../src/planner/timing'
import { danceBpmsFor, pickBeats } from '../tools/catalog/exercise'

const MAX_GLB_BYTES = 3 * 1024 * 1024
const DURATION_TOLERANCE = 0.05
const MIN_MOVES = 40
const MAX_MOVES = 120
const EIGHT_COUNT_UNITS: readonly number[] = [1, 2, 4, 8]
const MIN_CLIMAX_MOVES = 6
const MIN_BEGINNER_PER_TIER = 4

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
    if (!e.pools.includes('shape')) continue
    for (const bpm of bpmsFor(e)) {
      if (!fitBeats(e.clipSeconds, e.beatsPerRep, bpm)) errors.push(`动作 ${e.id} 在 ${bpm} BPM 下无法对齐节拍`)
    }
  }
  return errors
}

/** Dance moves must land on an eight-count unit (1, 2, 4 or 8 beats) at every tempo of their tier. */
function danceBeatErrors(catalog: readonly Exercise[]): string[] {
  const errors: string[] = []
  for (const e of catalog) {
    if (!e.pools.includes('dance') || e.danceTier === undefined) continue
    const dualPool = e.pools.includes('shape')
    for (const bpm of danceBpmsFor(e.danceTier)) {
      let beats: number | null
      if (dualPool) {
        try { beats = pickBeats(e.clipSeconds, [bpm]) } catch { beats = null }
      } else {
        beats = fitBeats(e.clipSeconds, e.beatsPerRep, bpm)?.beatsPerRep ?? null
      }
      if (beats === null || !EIGHT_COUNT_UNITS.includes(beats)) {
        errors.push(`动作 ${e.id} 在 ${bpm} BPM 下拍数 ${beats ?? '无法对齐'}，不是八拍制`)
      }
    }
  }
  return errors
}

/** Pool-size checks apply once a catalog has a dance pool at all; a shape-only catalog has no dance mode. */
function dancePoolErrors(catalog: readonly Exercise[]): string[] {
  if (!catalog.some(e => e.pools.includes('dance'))) return []
  const errors: string[] = []
  const dance = catalog.filter(e => e.pools.includes('dance') && e.impact === 'low')
  if (dance.filter(e => e.danceTier === 3).length < MIN_CLIMAX_MOVES) errors.push('低冲击高潮动作少于 6 条')
  for (const tier of [1, 2, 3] as const) {
    if (dance.filter(e => e.danceTier === tier && e.level === 1).length < MIN_BEGINNER_PER_TIER) {
      errors.push(`入门可用的强度 ${tier} 动作少于 4 条`)
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
  if (catalog.length < MIN_MOVES || catalog.length > MAX_MOVES) errors.push(`动作数 ${catalog.length} 不在 ${MIN_MOVES} 到 ${MAX_MOVES} 之间`)
  if (glbBytes >= MAX_GLB_BYTES) errors.push(`GLB 大小 ${(glbBytes / 1048576).toFixed(2)}MB，应小于 3MB`)
  return [
    ...errors, ...clipErrors(catalog, clips), ...danceBeatErrors(catalog),
    ...coverageErrors(catalog.filter(e => e.pools.includes('shape'))), ...dancePoolErrors(catalog),
  ]
}

function main(): void {
  const catalog = parseCatalog(JSON.parse(readFileSync('public/assets/catalog/exercises.json', 'utf8')))
  const glbPath = 'public/assets/models/mannequin.glb'
  const errors = validateCatalog(catalog, readGlbAnimations(readFileSync(glbPath)), statSync(glbPath).size)
  errors.forEach(e => console.error(e))
  process.exit(errors.length > 0 ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
