import { useEffect, useState } from 'react'
import { decodeUserMusic } from '../audio/userMusic'
import type { Plan } from '../planner/types'
import { TrainingSession } from '../player/session'
import { buildTimeline, type Step } from '../player/timeline'
import { loadUserMusic, type Settings } from '../storage/storage'
import { getAudio, resumeSession, speedFromUrl } from './audio'

const UI_REFRESH_MS = 100

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
  settings: Settings,
  onDone: (s: TrainingSession, steps: readonly Step[]) => void,
  onMusicFailed: () => void,
): TrainingRun {
  const [{ steps, session }] = useState(() => {
    const built = buildTimeline(plan)
    return { steps: built, session: new TrainingSession(built, { now: () => getAudio().ctx.currentTime }, speedFromUrl()) }
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
      session.start()
      engine.run(session, steps, plan, { mainStyle: settings.mainStyle, userMusic: music.buffer, clickWithUserMusic: settings.clickWithUserMusic })
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
    const timer = setInterval(() => setT(session.time()), UI_REFRESH_MS)
    const onVisibility = () => {
      // Show the overlay even if already paused: the tap on it is the gesture that re-unlocks audio.
      if (document.hidden && session.isStarted()) {
        if (!session.isPaused()) session.pause()
        setBackgroundPaused(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [session])

  const resumeFromBackground = () => {
    resumeSession(session)
    setBackgroundPaused(false)
  }

  return { steps, session, t, ready, toast, backgroundPaused, resumeFromBackground }
}
