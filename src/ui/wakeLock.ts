/**
 * Keeps the phone screen on during a workout. Uses the Screen Wake Lock API where it is
 * available (HTTPS or localhost); otherwise plays a tiny silent looping video, which also
 * keeps mobile browsers awake (the usual NoSleep technique).
 */

const KEEP_AWAKE_VIDEO = '/assets/audio/keep-awake.mp4'

interface Sentinel { release(): Promise<void> }
interface LoopVideo { play(): Promise<void>; pause(): void }

export interface WakeLockEnv {
  readonly wakeLock?: { request(type: 'screen'): Promise<Sentinel> }
  isHidden(): boolean
  onVisibilityChange(listener: () => void): void
  offVisibilityChange(listener: () => void): void
  makeVideo(): LoopVideo
}

export interface WakeLock {
  acquire(): void
  release(): void
}

export function browserWakeLockEnv(): WakeLockEnv {
  const nav = navigator as Navigator & { wakeLock?: WakeLockEnv['wakeLock'] }
  return {
    wakeLock: nav.wakeLock,
    isHidden: () => document.hidden,
    onVisibilityChange: l => document.addEventListener('visibilitychange', l),
    offVisibilityChange: l => document.removeEventListener('visibilitychange', l),
    makeVideo: () => {
      const video = document.createElement('video')
      video.src = KEEP_AWAKE_VIDEO
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.setAttribute('playsinline', '')
      video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none'
      document.body.appendChild(video)
      return video
    },
  }
}

export function createWakeLock(env: WakeLockEnv): WakeLock {
  let wanted = false
  let sentinel: Sentinel | null = null
  let requesting = false
  let video: LoopVideo | null = null

  const startVideo = () => {
    video ??= env.makeVideo()
    video.play().catch(err => console.warn('屏幕常亮视频无法播放', err))
  }
  const request = async () => {
    if (!wanted || sentinel || requesting || env.isHidden()) return
    if (!env.wakeLock) return startVideo()
    requesting = true
    try {
      const s = await env.wakeLock.request('screen')
      if (wanted) sentinel = s
      else void s.release()
    } catch (err: unknown) {
      console.warn('屏幕常亮申请失败，改用视频保持亮屏', err)
      startVideo()
    } finally {
      requesting = false
    }
  }
  // The browser drops the lock whenever the page is hidden; ask again when it comes back.
  const onVisibility = () => {
    if (env.isHidden()) sentinel = null
    else void request()
  }

  return {
    acquire() {
      if (wanted) return
      wanted = true
      env.onVisibilityChange(onVisibility)
      void request()
    },
    release() {
      if (!wanted) return
      wanted = false
      env.offVisibilityChange(onVisibility)
      sentinel?.release().catch(err => console.warn('释放屏幕常亮失败', err))
      sentinel = null
      video?.pause()
    },
  }
}
