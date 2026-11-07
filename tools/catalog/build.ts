/**
 * Builds public/assets/catalog/exercises.json and public/assets/models/mannequin.glb
 * from a local desk-break checkout (MIT, Shlomy Reshef).
 * Usage: npx tsx tools/catalog/build.ts <path-to-desk-break> [--mixamo <retargeted-dir>]
 * With --mixamo, retargeted Mixamo clips (<dir>/<id>.glb) are merged into the mannequin and appended to the catalog.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { NodeIO, type Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt, prune, resample } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { parseCatalog, type Exercise } from '../../src/catalog/types'
import { bpmsFor, fromMixamoRow, pickBeats } from './exercise'
import { mergeClip } from './mergeClips'
import { MIXAMO_SELECTION } from './mixamoSelection'
import { IDLE_ID, SELECTION, type Row } from './selection'

interface SourceExercise { id: string; amount_en: string }

function defaultReps(amount: string, clipSeconds: number): number {
  const n = Number(amount.match(/\d+/)?.[0] ?? 8)
  const seconds = /second|minute/.test(amount) ? n * (/minute/.test(amount) ? 60 : 1) : null
  const reps = seconds === null ? n : Math.round(seconds / clipSeconds)
  return Math.min(16, Math.max(4, reps))
}

interface Args { src: string; mixamoDir?: string }

function parseArgs(argv: readonly string[]): Args {
  const flag = argv.indexOf('--mixamo')
  if (flag >= 0 && (argv[flag + 1] === undefined || argv[flag + 1].startsWith('--'))) {
    throw new Error('--mixamo 后面需要跟重新绑定目录')
  }
  const mixamoDir = flag >= 0 ? argv[flag + 1] : undefined
  const src = argv.find((a, i) => !a.startsWith('--') && i !== flag + 1) ?? '../_vendor/desk-break'
  return { src, mixamoDir }
}

async function mergeMixamoClips(io: NodeIO, doc: Document, dir: string, durations: Map<string, number>): Promise<void> {
  for (const row of MIXAMO_SELECTION) {
    const file = resolve(dir, `${row.id}.glb`)
    if (!existsSync(file)) throw new Error(`缺少重新绑定文件: ${file}，先运行 tools/mixamo/run.ts`)
    durations.set(row.id, Math.round(mergeClip(doc, await io.read(file), row.id) * 1000) / 1000)
  }
}

async function main({ src, mixamoDir }: Args): Promise<void> {
  await MeshoptEncoder.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
  })
  const lib = join(src, 'library')
  const doc = await io.read(join(lib, 'exercises.glb'))
  const keep = new Set([...SELECTION.map(r => r[0]), IDLE_ID])
  const durations = new Map<string, number>()
  for (const anim of doc.getRoot().listAnimations()) {
    if (!keep.has(anim.getName())) anim.dispose()
    else durations.set(anim.getName(), Math.max(...anim.listSamplers().map(s => s.getInput()!.getMax([])[0])))
  }
  if (mixamoDir) await mergeMixamoClips(io, doc, mixamoDir, durations)
  await doc.transform(prune(), resample(), meshopt({ encoder: MeshoptEncoder, level: 'high' }))
  mkdirSync('public/assets/models', { recursive: true })
  writeFileSync('public/assets/models/mannequin.glb', await io.writeBinary(doc))

  const source = new Map((JSON.parse(readFileSync(join(lib, 'exercises.json'), 'utf8')).exercises as SourceExercise[]).map(e => [e.id, e]))
  const deskBreak: Exercise[] = SELECTION.map(([id, name, parts, type, level, sided, cues, caution]) => {
    const clipSeconds = Math.round(durations.get(id)! * 1000) / 1000
    return {
      id, name, clip: id, clipSeconds, parts: [...parts], type, level, impact: 'low' as const,
      beatsPerRep: pickBeats(clipSeconds, bpmsFor(type, level)),
      defaultReps: defaultReps(source.get(id)!.amount_en, clipSeconds), sided, cues: [...cues], caution,
    }
  })
  const mixamo = mixamoDir ? MIXAMO_SELECTION.map(r => fromMixamoRow(r, durations.get(r.id)!)) : []
  const catalog = [...deskBreak, ...mixamo]
  parseCatalog(catalog)
  mkdirSync('public/assets/catalog', { recursive: true })
  writeFileSync('public/assets/catalog/exercises.json', `${JSON.stringify(catalog, null, 2)}\n`)
  copyFileSync(join(src, 'LICENSE'), 'public/assets/models/LICENSE-desk-break.txt')
}

Promise.resolve().then(() => main(parseArgs(process.argv.slice(2)))).catch(err => {
  console.error(err)
  process.exit(1)
})
