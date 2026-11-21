import { describe, expect, it } from 'vitest'
import { checkReport, parseReport, type ClipReport } from '../../tools/mixamo/checkReport'

const ok: ClipReport = {
  id: 'burpee',
  missingBones: [],
  seamMaxAngleDeg: 2,
  seamHipsDistance: 0.01,
  minAnkleHeight: 0.054,
  driftAfterFix: 0,
  durationSeconds: 3.17,
}

describe('checkReport', () => {
  it('a clean report passes', () => expect(checkReport(ok)).toEqual([]))

  it('values exactly at the limits pass', () =>
    expect(
      checkReport({
        ...ok,
        seamMaxAngleDeg: 10,
        seamHipsDistance: 0.03,
        minAnkleHeight: 0.03,
        driftAfterFix: 0.05,
        durationSeconds: 6,
      }),
    ).toEqual([]))

  it.each([
    ['missingBones', { missingBones: ['mixamorig:LeftFoot'] }, 'mixamorig:LeftFoot'],
    ['seamMaxAngleDeg', { seamMaxAngleDeg: 10.5 }, '10.5'],
    ['seamHipsDistance', { seamHipsDistance: 0.031 }, '0.031'],
    ['minAnkleHeight', { minAnkleHeight: 0.029 }, '0.029'],
    ['driftAfterFix', { driftAfterFix: 0.06 }, '0.06'],
    ['durationSeconds low', { durationSeconds: 0.4 }, '0.4'],
    ['durationSeconds high', { durationSeconds: 6.1 }, '6.1'],
  ])('%s out of range fails with id and value', (_, patch, value) => {
    const errors = checkReport({ ...ok, ...patch })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('burpee')
    expect(errors[0]).toContain(value)
  })

  it('missing bones suppresses other errors', () =>
    expect(checkReport({ ...ok, missingBones: ['a'], seamMaxAngleDeg: 99 })).toHaveLength(1))
})

describe('parseReport', () => {
  it('accepts a valid report', () => expect(parseReport('burpee', ok)).toEqual(ok))

  it('rejects a truncated report naming the clip', () =>
    expect(() => parseReport('burpee', { id: 'burpee', missingBones: [] })).toThrow(
      /动作 burpee 的报告格式错误/,
    ))

  it('rejects a report whose id does not match', () =>
    expect(() => parseReport('burpee', { ...ok, id: 'push-up' })).toThrow(/burpee/))
})
