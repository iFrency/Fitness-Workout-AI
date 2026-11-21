import { createWakeLock, type WakeLockEnv } from '../../src/ui/wakeLock'

function fakeEnv(supported: boolean, rejects = false) {
  const sentinels: { released: boolean; release: () => Promise<void> }[] = []
  const listeners: (() => void)[] = []
  const video = { playing: false, play: vi.fn(async () => { video.playing = true }), pause: vi.fn(() => { video.playing = false }) }
  let hidden = false
  const env: WakeLockEnv = {
    wakeLock: supported
      ? {
          request: vi.fn(async () => {
            if (rejects) throw new Error('NotAllowedError')
            const s = { released: false, release: async () => { s.released = true } }
            sentinels.push(s)
            return s
          }),
        }
      : undefined,
    isHidden: () => hidden,
    onVisibilityChange: l => { listeners.push(l) },
    offVisibilityChange: () => { listeners.length = 0 },
    makeVideo: () => video,
  }
  return { env, sentinels, video, setHidden: (h: boolean) => { hidden = h; listeners.forEach(l => l()) } }
}
const flush = () => new Promise(r => setTimeout(r, 0))

it('requests a screen wake lock and releases it', async () => {
  const f = fakeEnv(true)
  const lock = createWakeLock(f.env)
  lock.acquire(); await flush()
  expect(f.env.wakeLock!.request).toHaveBeenCalledWith('screen')
  lock.release(); await flush()
  expect(f.sentinels[0].released).toBe(true)
  expect(f.video.play).not.toHaveBeenCalled()
})

it('acquire is idempotent while held', async () => {
  const f = fakeEnv(true)
  const lock = createWakeLock(f.env)
  lock.acquire(); lock.acquire(); await flush()
  expect(f.env.wakeLock!.request).toHaveBeenCalledTimes(1)
})

it('re-acquires when the page becomes visible again', async () => {
  const f = fakeEnv(true)
  const lock = createWakeLock(f.env)
  lock.acquire(); await flush()
  f.setHidden(true); f.setHidden(false); await flush()
  expect(f.env.wakeLock!.request).toHaveBeenCalledTimes(2)
  lock.release(); f.setHidden(true); f.setHidden(false); await flush()
  expect(f.env.wakeLock!.request).toHaveBeenCalledTimes(2)
})

it('falls back to a silent looping video when the API is missing', async () => {
  const f = fakeEnv(false)
  const lock = createWakeLock(f.env)
  lock.acquire(); await flush()
  expect(f.video.playing).toBe(true)
  lock.release()
  expect(f.video.playing).toBe(false)
})

it('falls back to the video when the request is refused (e.g. not a secure context)', async () => {
  const f = fakeEnv(true, true)
  const lock = createWakeLock(f.env)
  lock.acquire(); await flush()
  expect(f.video.playing).toBe(true)
})
