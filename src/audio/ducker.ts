/**
 * Lowers a gain while voice cues play. Overlapping cues extend one duck window
 * instead of each scheduling its own release, which made the music pump.
 */
export class Ducker {
  private until = Number.NEGATIVE_INFINITY
  private readonly param: AudioParam
  private readonly duckGain: number
  private readonly release: number

  constructor(param: AudioParam, duckGain: number, release: number) {
    this.param = param
    this.duckGain = duckGain
    this.release = release
  }

  duck(start: number, duration: number): void {
    this.until = Math.max(this.until, start + duration)
    this.param.cancelScheduledValues(start)
    this.param.setValueAtTime(this.duckGain, start)
    this.param.setValueAtTime(this.duckGain, this.until)
    this.param.linearRampToValueAtTime(1, this.until + this.release)
  }

  reset(at: number): void {
    this.until = Number.NEGATIVE_INFINITY
    this.param.cancelScheduledValues(0)
    this.param.setValueAtTime(1, at)
  }
}
