import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MIXAMO_SELECTION } from '../../tools/catalog/mixamoSelection'
import { blenderPath, missingFbx } from '../../tools/mixamo/run'

const rows = MIXAMO_SELECTION.filter(r => ['burpee', 'push-up'].includes(r.id))

describe('mixamo run helpers', () => {
  it('lists FBX files named in the selection but absent on disk', () =>
    expect(missingFbx(rows, '/v/mixamo', ['Burpee.fbx', 'push up.fbx'])).toEqual([join('/v/mixamo', 'Push Up.fbx')]))
  it('reports nothing when every file is present', () =>
    expect(missingFbx(rows, '/v/mixamo', ['Burpee.fbx', 'Push Up.fbx'])).toEqual([]))
  it('uses BLENDER when set and the default install path otherwise', () => {
    expect(blenderPath({ BLENDER: 'C:/b/blender.exe' })).toBe('C:/b/blender.exe')
    expect(blenderPath({})).toBe('D:/Program Files/Blender Foundation/Blender 5.2/blender.exe')
  })
})
