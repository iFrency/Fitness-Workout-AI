import type { Cue } from '../coach/cues'
import type { Plan } from '../planner/types'
import type { Step } from '../player/timeline'
import { beatEventsInWindow } from './events'
import { beatSeconds } from '../planner/timing'
import { hitsForEvent, styleForSegment, type Hit, type StyleId } from './patterns'

export interface ScheduledHit extends Hit {
  readonly time: number
}

export interface ScheduledVoice {
  readonly time: number
  readonly clip: string
}

export interface Scheduled {
  readonly hits: readonly ScheduledHit[]
  readonly voices: readonly ScheduledVoice[]
}

export interface ScheduleOptions {
  readonly mainStyle: StyleId
  readonly userMusic: boolean
  readonly clickWithUserMusic: boolean
}

const CLICK: Hit = { sound: 'tick', gain: 0.3, rate: 1 }
const DANCE_TICK: Hit = { sound: 'tick', gain: 0.6, rate: 1 }

export function scheduleWindow(
  steps: readonly Step[],
  plan: Plan,
  from: number,
  to: number,
  opts: ScheduleOptions,
  cues: readonly Cue[],
): Scheduled {
  const hits: ScheduledHit[] = []
  for (const e of beatEventsInWindow(steps, plan, from, to)) {
    const beat = beatSeconds(steps[e.stepIndex].bpm)
    const danceTick = opts.userMusic && e.dance && e.beatsLeftInStep <= 4
    const eventHits = opts.userMusic
      ? (danceTick ? [DANCE_TICK] : opts.clickWithUserMusic ? [CLICK] : [])
      : hitsForEvent(e, e.dance ? 'dance' : styleForSegment(e.segment, opts.mainStyle))
    eventHits.forEach(h => hits.push({ ...h, time: e.time + (h.offsetBeats ?? 0) * beat }))
  }
  const voices = cues.filter(c => c.time >= from && c.time < to).map(c => ({ time: c.time, clip: c.clip }))
  return { hits, voices }
}
