import { describe, expect, it } from 'vitest'
import { parseCatalog } from '../../src/catalog/types'
import { fromMixamoRow } from '../../tools/catalog/exercise'
import { MIXAMO_SELECTION } from '../../tools/catalog/mixamoSelection'
import { IDLE_ID, SELECTION } from '../../tools/catalog/selection'

describe('MIXAMO_SELECTION', () => {
  it('every row becomes a valid exercise', () =>
    expect(() => parseCatalog(MIXAMO_SELECTION.map(r => fromMixamoRow(r, 2.0)))).not.toThrow())
  it('ids do not clash with desk-break rows or the idle clip', () => {
    const taken = new Set([...SELECTION.map(r => r[0]), IDLE_ID])
    MIXAMO_SELECTION.forEach(r => expect(taken.has(r.id), r.id).toBe(false))
  })
  it('high-impact moves are never beginner level', () =>
    MIXAMO_SELECTION.filter(r => r.impact === 'high').forEach(r => expect(r.level, r.id).toBeGreaterThanOrEqual(2)))
  it('each move has exactly two cues', () => MIXAMO_SELECTION.forEach(r => expect(r.cues, r.id).toHaveLength(2)))
  it('fromMixamoRow fills clip, impact and defaultReps', () => {
    const e = fromMixamoRow(MIXAMO_SELECTION.find(r => r.id === 'burpee')!, 3.167)
    expect(e).toMatchObject({ id: 'burpee', clip: 'burpee', clipSeconds: 3.167, impact: 'high', defaultReps: 8 })
  })
})
