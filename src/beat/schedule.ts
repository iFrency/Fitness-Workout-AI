import type { Plan } from '../planner/types'
import type { Step } from '../player/timeline'
import { beatEventsInWindow } from './events'
import { hitsForEvent, styleForSegment, type Hit, type StyleId } from './patterns'
import { voiceForEvent, type VoiceId } from './voiceCues'

export interface ScheduledHit extends Hit {
  readonly time: number
}

export interface ScheduledVoice {
  readonly time: number
  readonly voice: VoiceId
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

export function scheduleWindow(steps: readonly Step[], plan: Plan, from: number, to: number, opts: ScheduleOptions): Scheduled {
  const hits: ScheduledHit[] = []
  const voices: ScheduledVoice[] = []
  for (const e of beatEventsInWindow(steps, plan, from, to)) {
    const eventHits = opts.userMusic
      ? (opts.clickWithUserMusic ? [CLICK] : [])
      : hitsForEvent(e, styleForSegment(e.segment, opts.mainStyle))
    eventHits.forEach(h => hits.push({ ...h, time: e.time }))
    const voice = voiceForEvent(e)
    if (voice) voices.push({ time: e.time, voice })
  }
  return { hits, voices }
}
