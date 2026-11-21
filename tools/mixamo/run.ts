/**
 * Batch-retargets every Mixamo selection row through Blender and checks each report.
 * Usage: npx tsx tools/mixamo/run.ts <fbx 目录> <输出目录> [--sheet] [--force]
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { MIXAMO_SELECTION, type MixamoRow } from '../catalog/mixamoSelection'
import { checkReport, parseReport } from './checkReport'

const DEFAULT_BLENDER = 'D:/Program Files/Blender Foundation/Blender 5.2/blender.exe'
const MANNEQUIN = 'public/assets/models/mannequin.glb'
const RETARGET_SCRIPT = resolve('tools/mixamo/retarget.py')

export function missingFbx(rows: readonly MixamoRow[], fbxDir: string, files: readonly string[]): string[] {
  const present = new Set(files)
  return rows.filter(r => !present.has(r.fbx)).map(r => join(fbxDir, r.fbx))
}

export function blenderPath(env: NodeJS.ProcessEnv): string {
  return env.BLENDER || DEFAULT_BLENDER
}

async function prepareRig(outDir: string): Promise<string> {
  await MeshoptDecoder.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  const doc = await io.read(MANNEQUIN)
  for (const ext of doc.getRoot().listExtensionsUsed()) ext.dispose()
  const rig = join(outDir, '_rig.glb')
  await io.write(rig, doc)
  return rig
}

function isUpToDate(glb: string, inputs: readonly string[]): boolean {
  if (!existsSync(glb)) return false
  const built = statSync(glb).mtimeMs
  return inputs.every(f => statSync(f).mtimeMs < built)
}

export async function main(argv: readonly string[], rows: readonly MixamoRow[] = MIXAMO_SELECTION): Promise<number> {
  const [fbxDir, outDir] = argv.filter(a => !a.startsWith('--'))
  if (!fbxDir || !outDir) {
    console.error('用法: npx tsx tools/mixamo/run.ts <fbx 目录> <输出目录> [--sheet] [--force]')
    return 1
  }
  const sheet = argv.includes('--sheet')
  const force = argv.includes('--force')

  const files = existsSync(fbxDir) ? readdirSync(fbxDir) : []
  const missing = missingFbx(rows, fbxDir, files)
  if (missing.length > 0) {
    console.error(`缺少 ${missing.length} 个 FBX 文件:`)
    missing.forEach(m => console.error(`  ${m}`))
    return 1
  }

  const blender = blenderPath(process.env)
  if (!existsSync(blender)) {
    console.error('找不到 Blender，请设置环境变量 BLENDER')
    return 1
  }

  mkdirSync(outDir, { recursive: true })
  const rig = await prepareRig(outDir)
  const errors: string[] = []

  for (const row of rows) {
    const fbx = join(fbxDir, row.fbx)
    const glb = join(outDir, `${row.id}.glb`)
    if (!force && isUpToDate(glb, [fbx, RETARGET_SCRIPT])) {
      console.log(`跳过 ${row.id}（输出已是最新）`)
      continue
    }
    const args = ['-b', '--python', RETARGET_SCRIPT, '--', '--rig', rig, '--fbx', fbx, '--id', row.id, '--out', outDir]
    if (row.frames) args.push('--frames', String(row.frames[0]), String(row.frames[1]))
    if (sheet) args.push('--sheet')
    console.log(`重新绑定 ${row.id} ...`)
    const result = spawnSync(blender, args, { stdio: 'inherit' })
    if (result.status !== 0) errors.push(`动作 ${row.id}：Blender 运行失败，退出码 ${result.status ?? result.error?.message}`)
  }

  const summary: string[] = []
  for (const row of rows) {
    const reportFile = join(outDir, `${row.id}.report.json`)
    if (!existsSync(reportFile)) {
      if (!errors.some(e => e.startsWith(`动作 ${row.id}：`))) errors.push(`动作 ${row.id}：缺少报告文件 ${reportFile}`)
      continue
    }
    try {
      const report = parseReport(row.id, JSON.parse(readFileSync(reportFile, 'utf8')))
      const problems = checkReport(report)
      errors.push(...problems)
      if (problems.length === 0) {
        summary.push(`${row.id}：时长 ${report.durationSeconds} 秒，脚踝最低高度 ${report.minAnkleHeight}`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  if (errors.length > 0) {
    errors.forEach(e => console.error(e))
    return 1
  }
  summary.forEach(s => console.log(s))
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => process.exit(code), e => { console.error(e); process.exit(1) })
}
