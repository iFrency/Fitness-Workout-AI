import { beatEventsInWindow, type BeatEvent } from '../../src/beat/events'
import { hitsForEvent, styleForSegment } from '../../src/beat/patterns'
import { scheduleWindow } from '../../src/beat/schedule'
import { generatePlan } from '../../src/planner/generatePlan'
import { buildTimeline } from '../../src/player/timeline'
import { fixtureCatalog } from '../fixtures/catalog'

const plan = generatePlan({ parts: ['全身'], minutes: 10, level: 2 }, fixtureCatalog, 1)
const steps = buildTimeline(plan)

const workEvent: BeatEvent = {
  time: 0, stepIndex: 1, kind: 'work', segment: 'main', side: null, beatInStep: 5, beatsLeftInStep: 27,
  repIndex: 1, beatInRep: 1, isRepEnd: false, repsLeft: 7,
}
const restEvent: BeatEvent = {
  time: 0, stepIndex: 2, kind: 'rest', segment: 'main', side: null, beatInStep: 1, beatsLeftInStep: 6,
  repIndex: 0, beatInRep: 0, isRepEnd: false, repsLeft: 0,
}
const sounds = (e: BeatEvent, style: Parameters<typeof hitsForEvent>[1]) => hitsForEvent(e, style).map(h => h.sound).sort()

describe('beatEventsInWindow', () => {
  it('beats are evenly spaced and cover each work step', () => {
    const w = steps.find(s => s.kind === 'work')!
    const ev = beatEventsInWindow(steps, plan, w.start, w.end)
    expect(ev).toHaveLength(w.reps * w.beatsPerRep)
    expect(ev.filter(e => e.isRepEnd)).toHaveLength(w.reps)
    expect(ev.at(-1)!.repsLeft).toBe(1)
  })
  it('window is half-open with no duplicates across consecutive windows', () => {
    const a = beatEventsInWindow(steps, plan, 0, 10)
    const b = beatEventsInWindow(steps, plan, 10, 20)
    expect(beatEventsInWindow(steps, plan, 0, 20)).toEqual([...a, ...b])
  })
  it('prepare beats count down to 1', () => {
    const ev = beatEventsInWindow(steps, plan, 0, steps[0].end)
    expect(ev).toHaveLength(Math.round(steps[0].end / (60 / steps[0].bpm)))
    expect(ev.slice(-3).map(e => e.beatsLeftInStep)).toEqual([3, 2, 1])
  })
})

describe('hitsForEvent', () => {
  it('guichu kicks every beat', () => expect(sounds(workEvent, 'guichu')).toEqual(['kick']))
  it('guangchang alternates kick and snare', () => {
    expect(sounds({ ...workEvent, beatInStep: 4 }, 'guangchang')).toEqual(['kick'])
    expect(sounds({ ...workEvent, beatInStep: 5 }, 'guangchang')).toEqual(['snare'])
  })
  it('muyu adds bass on bar start', () => {
    expect(sounds({ ...workEvent, beatInStep: 4 }, 'muyu')).toEqual(['bass', 'muyu'])
  })
  it('rep end adds the style accent', () => {
    expect(sounds({ ...workEvent, isRepEnd: true }, 'guichu')).toEqual(['duang', 'kick'])
    expect(sounds({ ...workEvent, isRepEnd: true, beatInStep: 5 }, 'guangchang')).toEqual(['gong', 'snare'])
  })
  it('last rep pitches up three semitones and stacks layers', () => {
    const hits = hitsForEvent({ ...workEvent, repsLeft: 1, isRepEnd: true }, 'guichu')
    expect(hits.map(h => h.sound).sort()).toEqual(['bass', 'duang', 'hat', 'kick', 'snare'])
    hits.forEach(h => expect(h.rate).toBeCloseTo(2 ** (3 / 12)))
  })
  it('rest counts down with ticks and is light otherwise', () => {
    expect(hitsForEvent({ ...restEvent, beatsLeftInStep: 3 }, 'guichu')).toEqual([{ sound: 'tick', gain: 1, rate: 1 }])
    expect(hitsForEvent(restEvent, 'guichu')).toEqual([{ sound: 'hat', gain: 0.3, rate: 1 }])
  })
  it('styleForSegment', () => {
    expect(styleForSegment('warmup', 'guichu')).toBe('guangchang')
    expect(styleForSegment('stretch', 'guichu')).toBe('muyu')
    expect(styleForSegment('main', 'muyu')).toBe('muyu')
  })
})

describe('scheduleWindow', () => {
  const opts = { mainStyle: 'guichu' as const, userMusic: false, clickWithUserMusic: false }
  const cues = [{ time: 1, clip: 'start', duration: 0.5, priority: 4 }, { time: 31, clip: 'n5', duration: 0.5, priority: 5 }]
  it('emits hits inside the window and only the cue-sheet voices inside it', () => {
    const s = scheduleWindow(steps, plan, 0, 30, opts, cues)
    expect(s.hits.length).toBeGreaterThan(0)
    expect(s.hits.every(x => x.time >= 0 && x.time < 30)).toBe(true)
    expect(s.voices).toEqual([{ time: 1, clip: 'start' }])
  })
  it('user music mode keeps coach voices and only clicks when enabled', () => {
    const off = scheduleWindow(steps, plan, 0, 30, { ...opts, userMusic: true }, cues)
    expect(off.hits).toHaveLength(0)
    expect(off.voices).toHaveLength(1)
    const on = scheduleWindow(steps, plan, 0, 30, { ...opts, userMusic: true, clickWithUserMusic: true }, cues)
    expect(on.hits.length).toBeGreaterThan(0)
    expect(on.hits.every(h => h.sound === 'tick' && h.gain === 0.3)).toBe(true)
  })
})
