import { Ducker } from '../../src/audio/ducker'

type Call = [string, number, number?]

function fakeParam() {
  const calls: Call[] = []
  return {
    calls,
    param: {
      value: 1,
      setValueAtTime: (v: number, t: number) => { calls.push(['set', v, t]) },
      linearRampToValueAtTime: (v: number, t: number) => { calls.push(['ramp', v, t]) },
      cancelScheduledValues: (t: number) => { calls.push(['cancel', t]) },
    },
  }
}

it('ducks once and releases after the last overlapping voice ends', () => {
  const { param, calls } = fakeParam()
  const d = new Ducker(param as unknown as AudioParam, 0.398, 0.1)
  d.duck(0, 0.67)
  d.duck(0.5, 0.46)
  d.duck(1.0, 1.25)
  const ramps = calls.filter(c => c[0] === 'ramp')
  const lastRamp = ramps.at(-1)!
  expect(lastRamp).toEqual(['ramp', 1, 2.35])
  const cancelAt = calls.filter(c => c[0] === 'cancel').map(c => c[1])
  expect(cancelAt).toEqual([0, 0.5, 1.0])
})

it('reset cancels pending automation and restores full gain', () => {
  const { param, calls } = fakeParam()
  const d = new Ducker(param as unknown as AudioParam, 0.398, 0.1)
  d.duck(5, 1)
  d.reset(2)
  expect(calls.at(-2)).toEqual(['cancel', 0])
  expect(calls.at(-1)).toEqual(['set', 1, 2])
})
