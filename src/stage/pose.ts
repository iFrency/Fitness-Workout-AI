import { IDLE_CLIP } from '../catalog/constants'
import type { Side, TrainingState } from '../player/timeline'

export const CROSSFADE_SECONDS = 0.3

export interface Pose {
  readonly clip: string
  readonly clipTime: number
}

export interface ClipInfo {
  readonly clip: string
  readonly clipSeconds: number
}

export function computePose(
  state: TrainingState,
  t: number,
  clipOf: (itemIndex: number) => ClipInfo,
  idleSeconds: number,
): Pose {
  if (state.step.kind === 'work' && !state.done) {
    const info = clipOf(state.step.itemIndex)
    return { clip: info.clip, clipTime: state.repProgress * info.clipSeconds }
  }
  return { clip: IDLE_CLIP, clipTime: ((t % idleSeconds) + idleSeconds) % idleSeconds }
}

export function blendWeight(t: number, switchedAt: number): number {
  return Math.min(1, Math.max(0, (t - switchedAt) / CROSSFADE_SECONDS))
}

/** One-sided clips animate a single side; the right side is shown by flipping the model. */
export function shouldMirror(mirrorSetting: boolean, side: Side): boolean {
  return mirrorSetting !== (side === 'right')
}
