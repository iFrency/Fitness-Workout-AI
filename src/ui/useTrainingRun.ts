import { useEffect, useState } from 'react'
import { decodeUserMusic } from '../audio/userMusic'
import type { Exercise } from '../catalog/types'
import { buildCueSheet } from '../coach/cues'
import type { Plan } from '../planner/types'
import { TrainingSession } from '../player/session'
import { buildTimeline, timelineEnd, type Step } from '../player/timeline'
import { loadUserMusic, saveProgress, type Settings, type TrainingProgress } from '../storage/storage'
import { getAudio, resumeSession, speedFromUrl } from './audio'
import { browserWakeLockEnv, createWakeLock } from './wakeLock'

const UI_REFRESH_MS = 100
const SAVE_PROGRESS_MS = 5000

export interface TrainingRun {
  readonly steps: readonly Step[]
  readonly session: TrainingSession
  readonly t: number
  readonly ready: boolean
  readonly toast: string | null
  readonly backgroundPaused: boolean
  resumeFromBackground(): void
}

async function loadMusic(ctx: AudioContext, settings: Settings): Promise<{ buffer: AudioBuffer | null; failed: boolean }> {
  if (!settings.useUserMusic) return { buffer: null, failed: false }
  const stored = await loadUserMusic()
  if (!stored) return { buffer: null, failed: false }
  const result = await decodeUserMusic(ctx, stored.blob)
  return result.ok ? { buffer: result.buffer, failed: false } : { buffer: null, failed: true }
}

export function useTrainingRun(
  plan: Plan,
  catalog: readonly Exercise[],
  settings: Settings,
  onDone: (s: TrainingSession, steps: readonly Step[]) => void,
  onMusicFailed: () => void,
  resumeFrom: TrainingProgress | null,
): TrainingRun {
  const [{ steps, session }] = useState(() => {
    const built = buildTimeline(plan)
    // Bind the clock to this context, so a replaced engine can never move this session's time.
    const { ctx } = getAudio()
    return { steps: built, session: new TrainingSession(built, { now: () => ctx.currentTime }, speedFromUrl()) }
  })
  const [t, setT] = useState(0)
  const [ready, setReady] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [backgroundPaused, setBackgroundPaused] = useState(false)

  useEffect(() => {
    let cancelled = false
    const { ctx, engine } = getAudio()
    const offDone = engine.onDone(() => onDone(session, steps))
    void (async () => {
      await engine.init()
      const music = await loadMusic(ctx, settings)
      if (cancelled) return
      if (music.failed) {
        setToast('此文件格式不支持，已切回内置音乐')
        onMusicFailed()
      }
      engine.setVolume(settings.volume)
      if (resumeFrom) {
        session.startAt(resumeFrom.time, resumeFrom.skipped)
        setBackgroundPaused(true)
      } else {
        session.start()
      }
      const cues = buildCueSheet(steps, plan, catalog, engine.manifest())
      engine.run(session, steps, plan, { mainStyle: settings.mainStyle, userMusic: music.buffer, clickWithUserMusic: settings.clickWithUserMusic }, cues)
      setReady(true)
    })()
    return () => {
      cancelled = true
      offDone()
      engine.stop()
    }
    // Runs once per training page mount; later setting changes go through engine.setOptions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const snapshot = () => {
      if (!session.isStarted() || session.time() >= timelineEnd(steps)) return
      void saveProgress({ plan, time: session.time(), skipped: [...session.skippedItems()], savedAt: new Date().toISOString() })
    }
    const wakeLock = createWakeLock(browserWakeLockEnv())
    // Keep the screen on while the workout is running; let it sleep when paused.
    const timer = setInterval(() => {
      setT(session.time())
      if (session.isStarted() && !session.isPaused()) wakeLock.acquire()
      else wakeLock.release()
    }, UI_REFRESH_MS)
    const saver = setInterval(snapshot, SAVE_PROGRESS_MS)
    const onVisibility = () => {
      // Show the overlay even if already paused: the tap on it is the gesture that re-unlocks audio.
      if (document.hidden && session.isStarted()) {
        if (!session.isPaused()) session.pause()
        setBackgroundPaused(true)
        // iOS may discard a background page; save now so the workout can be resumed.
        snapshot()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      clearInterval(saver)
      wakeLock.release()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [session, steps, plan])

  const resumeFromBackground = () => {
    resumeSession(session)
    setBackgroundPaused(false)
  }

  return { steps, session, t, ready, toast, backgroundPaused, resumeFromBackground }
}
