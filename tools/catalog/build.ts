/**
 * Builds public/assets/catalog/exercises.json and public/assets/models/mannequin.glb
 * from a local desk-break checkout (MIT, Shlomy Reshef).
 * Usage: npx tsx tools/catalog/build.ts <path-to-desk-break>
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt, prune, resample } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { parseCatalog, type Exercise } from '../../src/catalog/types'
import { bpmsFor, pickBeats } from './exercise'
import { IDLE_ID, SELECTION, type Row } from './selection'

interface SourceExercise { id: string; amount_en: string }

function defaultReps(amount: string, clipSeconds: number): number {
  const n = Number(amount.match(/\d+/)?.[0] ?? 8)
  const seconds = /second|minute/.test(amount) ? n * (/minute/.test(amount) ? 60 : 1) : null
  const reps = seconds === null ? n : Math.round(seconds / clipSeconds)
  return Math.min(16, Math.max(4, reps))
}

async function main(src: string): Promise<void> {
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
  await doc.transform(prune(), resample(), meshopt({ encoder: MeshoptEncoder, level: 'high' }))
  mkdirSync('public/assets/models', { recursive: true })
  writeFileSync('public/assets/models/mannequin.glb', await io.writeBinary(doc))

  const source = new Map((JSON.parse(readFileSync(join(lib, 'exercises.json'), 'utf8')).exercises as SourceExercise[]).map(e => [e.id, e]))
  const catalog: Exercise[] = SELECTION.map(([id, name, parts, type, level, sided, cues, caution]) => {
    const clipSeconds = Math.round(durations.get(id)! * 1000) / 1000
    return {
      id, name, clip: id, clipSeconds, parts: [...parts], type, level, impact: 'low' as const,
      beatsPerRep: pickBeats(clipSeconds, bpmsFor(type, level)),
      defaultReps: defaultReps(source.get(id)!.amount_en, clipSeconds), sided, cues: [...cues], caution,
    }
  })
  parseCatalog(catalog)
  mkdirSync('public/assets/catalog', { recursive: true })
  writeFileSync('public/assets/catalog/exercises.json', `${JSON.stringify(catalog, null, 2)}\n`)
  copyFileSync(join(src, 'LICENSE'), 'public/assets/models/LICENSE-desk-break.txt')
}

main(process.argv[2] ?? '../_vendor/desk-break').catch(err => {
  console.error(err)
  process.exit(1)
})
