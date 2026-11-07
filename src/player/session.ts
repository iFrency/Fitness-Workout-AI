import { stateAt, timelineEnd, type Step } from './timeline'

export interface Clock {
  now(): number
}

const MIN_RATE = 1
const MAX_RATE = 60

export class TrainingSession {
  private readonly steps: readonly Step[]
  private readonly clock: Clock
  private readonly rate: number
  private readonly end: number
  private started = false
  private paused = false
  private anchorClock = 0
  private anchorTime = 0
  private activeBefore = 0
  private skipped = new Set<number>()
  private listeners = new Set<() => void>()

  constructor(steps: readonly Step[], clock: Clock, rate = 1) {
    this.steps = steps
    this.clock = clock
    this.rate = Math.min(MAX_RATE, Math.max(MIN_RATE, rate))
    this.end = timelineEnd(steps)
  }

  start(): void {
    this.started = true
    this.paused = false
    this.anchor(0)
  }

  /** Restores a saved position; the session starts paused so the user's tap can unlock audio. */
  startAt(t: number, skipped: readonly number[]): void {
    this.started = true
    this.paused = true
    this.anchorTime = Math.min(this.end, Math.max(0, t))
    this.anchorClock = this.clock.now()
    this.skipped = new Set(skipped)
  }

  pause(): void {
    if (!this.started || this.paused) return
    this.anchorTime = this.time()
    this.activeBefore += this.clock.now() - this.anchorClock
    this.paused = true
  }

  resume(): void {
    if (!this.started || !this.paused) return
    this.paused = false
    this.anchor(this.anchorTime)
    this.emit()
  }

  isPaused(): boolean {
    return this.paused
  }

  isStarted(): boolean {
    return this.started
  }

  time(): number {
    if (!this.started) return 0
    if (this.paused) return this.anchorTime
    return Math.min(this.end, this.anchorTime + (this.clock.now() - this.anchorClock) * this.rate)
  }

  clockTimeOf(t: number): number {
    return this.anchorClock + (t - this.anchorTime) / this.rate
  }

  activeSeconds(): number {
    if (!this.started) return 0
    return this.activeBefore + (this.paused ? 0 : this.clock.now() - this.anchorClock)
  }

  skippedItems(): ReadonlySet<number> {
    return this.skipped
  }

  /** During a rest or the prepare count-in, skip ends the pause; during work it skips the exercise. */
  skip(): void {
    const state = stateAt(this.steps, this.time())
    const current = state.step.itemIndex
    if (state.step.kind !== 'work' && !state.done) {
      const work = this.steps.find(s => s.kind === 'work' && s.itemIndex === current)
      if (work) this.jumpTo(work.start)
      return
    }
    this.skipped = new Set(this.skipped).add(current)
    const next = this.steps.find(s => s.kind !== 'prepare' && s.itemIndex === current + 1)
    if (next) this.jumpTo(next.start)
    else this.finishNow()
  }

  /** Reaching the end while paused would leave the user stuck on the last exercise. */
  private finishNow(): void {
    if (this.paused) {
      this.paused = false
      this.anchor(this.end)
      this.emit()
    } else {
      this.jumpTo(this.end)
    }
  }

  prev(): void {
    const current = stateAt(this.steps, this.time()).step.itemIndex
    const target = Math.max(0, current - 1)
    const work = this.steps.find(s => s.kind === 'work' && s.itemIndex === target)
    const nextSkipped = new Set(this.skipped)
    nextSkipped.delete(target)
    this.skipped = nextSkipped
    if (work) this.jumpTo(work.start)
  }

  onJump(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private anchor(t: number): void {
    this.anchorTime = Math.min(this.end, Math.max(0, t))
    this.anchorClock = this.clock.now()
  }

  private jumpTo(t: number): void {
    if (this.paused) {
      this.anchorTime = Math.min(this.end, Math.max(0, t))
    } else {
      this.activeBefore += this.clock.now() - this.anchorClock
      this.anchor(t)
    }
    this.emit()
  }

  private emit(): void {
    this.listeners.forEach(l => l())
  }
}
