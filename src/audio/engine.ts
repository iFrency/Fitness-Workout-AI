import type { SoundId, StyleId } from '../beat/patterns'
import { scheduleWindow } from '../beat/schedule'
import { VOICE_IDS, type VoiceId } from '../beat/voiceCues'
import { VOICE_URL } from '../catalog/constants'
import type { Plan } from '../planner/types'
import type { TrainingSession } from '../player/session'
import { timelineEnd, type Step } from '../player/timeline'
import { Ducker } from './ducker'
import { renderSounds } from './synth'

export const DUCK_GAIN = 0.398
export const LOOKAHEAD_SECONDS = 0.1
export const TICK_MS = 25
const SILENCE_URL = '/assets/audio/silence.wav'
const DUCK_RELEASE = 0.1

export interface RunOptions {
  readonly mainStyle: StyleId
  readonly userMusic: AudioBuffer | null
  readonly clickWithUserMusic: boolean
}

interface Run {
  readonly session: TrainingSession
  readonly steps: readonly Step[]
  readonly plan: Plan
  readonly opts: RunOptions
  readonly end: number
  lastTo: number
  done: boolean
  unsubscribe: () => void
}

export class AudioEngine {
  private readonly ctx: AudioContext
  private readonly master: GainNode
  private readonly musicGain: GainNode
  private readonly voiceGain: GainNode
  private readonly ducker: Ducker
  private sounds: Record<SoundId, AudioBuffer> | null = null
  private readonly voices = new Map<VoiceId, AudioBuffer>()
  private readonly doneListeners = new Set<() => void>()
  private silent: HTMLAudioElement | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private run_: Run | null = null
  private musicSource: AudioBufferSourceNode | null = null
  private musicOffset = 0
  private musicStartedAt = 0

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.connect(ctx.destination)
    this.musicGain = ctx.createGain()
    this.musicGain.connect(this.master)
    this.voiceGain = ctx.createGain()
    this.voiceGain.connect(this.master)
    this.ducker = new Ducker(this.musicGain.gain, DUCK_GAIN, DUCK_RELEASE)
  }

  /** Must be called inside a user gesture handler. */
  async unlock(): Promise<void> {
    if (!this.silent) {
      this.silent = new Audio(SILENCE_URL)
      this.silent.loop = true
    }
    this.silent.play().catch(err => console.warn('静音音轨播放失败', err))
    await this.ctx.resume()
  }

  async init(): Promise<void> {
    if (this.sounds) return
    this.sounds = await renderSounds(this.ctx.sampleRate)
    await Promise.all(VOICE_IDS.map(async id => {
      try {
        const res = await fetch(VOICE_URL(id))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        this.voices.set(id, await this.ctx.decodeAudioData(await res.arrayBuffer()))
      } catch (err: unknown) {
        console.warn(`口令 ${id} 加载失败，将跳过`, err)
      }
    }))
  }

  run(session: TrainingSession, steps: readonly Step[], plan: Plan, opts: RunOptions): void {
    this.stop()
    this.musicOffset = 0
    const unsubscribe = session.onJump(() => {
      if (this.run_) this.run_.lastTo = session.time()
    })
    this.run_ = { session, steps, plan, opts, end: timelineEnd(steps), lastTo: session.time(), done: false, unsubscribe }
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  setOptions(patch: Partial<RunOptions>): void {
    if (this.run_) this.run_ = { ...this.run_, opts: { ...this.run_.opts, ...patch } }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.run_?.unsubscribe()
    this.run_ = null
    this.stopMusic()
    this.ducker.reset(this.ctx.currentTime)
    this.silent?.pause()
  }

  setVolume(v: number): void {
    this.master.gain.value = Math.min(1, Math.max(0, v))
  }

  onDone(listener: () => void): () => void {
    this.doneListeners.add(listener)
    return () => this.doneListeners.delete(listener)
  }

  private tick(): void {
    const run = this.run_
    if (!run || run.done) return
    if (run.session.isPaused()) {
      this.stopMusic()
      return
    }
    if (run.opts.userMusic && !this.musicSource) this.startMusic(run.opts.userMusic)
    const t = run.session.time()
    if (t >= run.end) {
      this.finish(run)
      return
    }
    const rate = 1 / (run.session.clockTimeOf(t + 1) - run.session.clockTimeOf(t))
    const to = Math.min(run.end, t + LOOKAHEAD_SECONDS * rate)
    if (to <= run.lastTo) return
    const scheduled = scheduleWindow(run.steps, run.plan, run.lastTo, to, {
      mainStyle: run.opts.mainStyle, userMusic: run.opts.userMusic !== null, clickWithUserMusic: run.opts.clickWithUserMusic,
    })
    run.lastTo = to
    scheduled.hits.forEach(h => this.play(this.sounds?.[h.sound], run.session.clockTimeOf(h.time), this.musicGain, h.gain, h.rate))
    scheduled.voices.forEach(v => this.playVoice(v.voice, run.session.clockTimeOf(v.time)))
  }

  private finish(run: Run): void {
    run.done = true
    this.playVoice('done', this.ctx.currentTime)
    this.stopMusic()
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.doneListeners.forEach(l => l())
  }

  private play(buffer: AudioBuffer | undefined, at: number, bus: AudioNode, gain: number, rate: number): number {
    if (!buffer) return 0
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = rate
    const g = this.ctx.createGain()
    g.gain.value = gain
    src.connect(g).connect(bus)
    src.start(Math.max(this.ctx.currentTime, at))
    return buffer.duration / rate
  }

  private playVoice(id: VoiceId, at: number): void {
    const start = Math.max(this.ctx.currentTime, at)
    const duration = this.play(this.voices.get(id), start, this.voiceGain, 1, 1)
    if (duration > 0) this.ducker.duck(start, duration)
  }

  private startMusic(buffer: AudioBuffer): void {
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    src.connect(this.musicGain)
    const offset = this.musicOffset % buffer.duration
    src.start(0, offset)
    this.musicStartedAt = this.ctx.currentTime - offset
    this.musicSource = src
  }

  private stopMusic(): void {
    if (!this.musicSource) return
    this.musicOffset = this.ctx.currentTime - this.musicStartedAt
    this.musicSource.stop()
    this.musicSource.disconnect()
    this.musicSource = null
  }
}
