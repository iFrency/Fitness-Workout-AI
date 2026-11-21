/** Remembers scheduled audio sources so pause and jumps can silence what is already queued. */
export class SourceTracker {
  private readonly live = new Set<AudioScheduledSourceNode>()

  track(source: AudioScheduledSourceNode): void {
    this.live.add(source)
    source.onended = () => this.live.delete(source)
  }

  stopAll(): void {
    for (const source of this.live) {
      try {
        source.stop()
      } catch {
        // A source that never started cannot be stopped; it is dropped either way.
      }
    }
    this.live.clear()
  }

  size(): number {
    return this.live.size
  }
}
