import { describe, expect, it } from 'vitest'
import { pickBeats } from '../../tools/catalog/exercise'
import { MIXAMO_SELECTION } from '../../tools/catalog/mixamoSelection'
import { DANCE_BPMS, DANCE_SELECTION, DUAL_POOL, IDLE_ID, SELECTION } from '../../tools/catalog/selection'

describe('DANCE_SELECTION', () => {
  it('dance rows are unique and do not clash with SELECTION or MIXAMO_SELECTION ids', () => {
    const ids = DANCE_SELECTION.map(r => r[0])
    expect(new Set(ids).size).toBe(ids.length)
    const taken = new Set([...SELECTION.map(r => r[0]), ...MIXAMO_SELECTION.map(r => r.id), IDLE_ID])
    ids.forEach(id => expect(taken.has(id), id).toBe(false))
  })
  it('every row has valid tier, two cues and a name', () =>
    DANCE_SELECTION.forEach(([id, name, level, tier, cues]) => {
      expect(name, id).not.toBe('')
      expect([1, 2, 3]).toContain(level)
      expect([1, 2, 3]).toContain(tier)
      expect(cues, id).toHaveLength(2)
    }))
})

describe('DUAL_POOL', () => {
  it('every DUAL_POOL id exists in SELECTION or MIXAMO_SELECTION and is not sided', () => {
    const sided = new Map<string, boolean>([
      ...SELECTION.map(r => [r[0], r[5]] as const),
      ...MIXAMO_SELECTION.map(r => [r.id, r.sided] as const),
    ])
    Object.keys(DUAL_POOL).forEach(id => {
      expect(sided.has(id), id).toBe(true)
      expect(sided.get(id), id).toBe(false)
    })
  })
})

describe('pickBeats', () => {
  it('limits the choice to the allowed list', () => {
    expect([1, 2, 4, 8]).toContain(pickBeats(2.2, [...DANCE_BPMS], [1, 2, 4, 8]))
  })
  it('DANCE_BPMS is ascending and starts at 96', () => {
    expect(DANCE_BPMS[0]).toBe(96)
    expect([...DANCE_BPMS]).toEqual([...DANCE_BPMS].sort((a, b) => a - b))
  })
})
