import { AudioEngine } from '../audio/engine'
import type { TrainingSession } from '../player/session'

interface AudioHandle {
  readonly ctx: AudioContext
  readonly engine: AudioEngine
}

let handle: AudioHandle | null = null

/** Lazily creates the single AudioContext; call first from a user gesture. */
export function getAudio(): AudioHandle {
  if (!handle) {
    const ctx = new AudioContext()
    handle = { ctx, engine: new AudioEngine(ctx) }
  }
  return handle
}

/**
 * Resumes a paused session. Mobile browsers suspend the AudioContext in the background,
 * and the session clock is that context's time, so it must be unlocked on every resume.
 */
export function resumeSession(
  session: TrainingSession,
  unlock: () => Promise<void> = () => getAudio().engine.unlock(),
): void {
  unlock().catch(err => console.warn('音频解锁失败', err))
  session.resume()
}

export function speedFromUrl(): number {
  if (import.meta.env.VITE_ALLOW_SPEED !== 'true') return 1
  const value = Number(new URLSearchParams(window.location.search).get('speed'))
  return Number.isFinite(value) && value > 0 ? value : 1
}
