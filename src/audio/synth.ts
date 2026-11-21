import type { SoundId } from '../beat/patterns'

export interface SoundRecipe {
  readonly duration: number
  render(ctx: OfflineAudioContext): void
}

function envelope(ctx: BaseAudioContext, peak: number, decay: number): GainNode {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, 0)
  g.gain.exponentialRampToValueAtTime(peak, 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, decay)
  g.connect(ctx.destination)
  return g
}

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number, to: AudioNode, seconds: number): OscillatorNode {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, 0)
  o.connect(to)
  o.start(0)
  o.stop(seconds)
  return o
}

function noise(ctx: BaseAudioContext, to: AudioNode, seconds: number, at = 0): void {
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(to)
  src.start(at)
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q: number, to: AudioNode): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  f.connect(to)
  return f
}

export const SOUND_RECIPES: Readonly<Record<SoundId, SoundRecipe>> = {
  kick: { duration: 0.45, render: ctx => {
    const o = osc(ctx, 'sine', 150, envelope(ctx, 1, 0.4), 0.45)
    o.frequency.exponentialRampToValueAtTime(45, 0.12)
  } },
  snare: { duration: 0.25, render: ctx => {
    noise(ctx, filter(ctx, 'bandpass', 1800, 0.8, envelope(ctx, 0.8, 0.2)), 0.25)
    osc(ctx, 'triangle', 180, envelope(ctx, 0.4, 0.1), 0.12)
  } },
  hat: { duration: 0.06, render: ctx => noise(ctx, filter(ctx, 'highpass', 7000, 0.7, envelope(ctx, 0.6, 0.05)), 0.06) },
  bass: { duration: 0.4, render: ctx => {
    osc(ctx, 'sawtooth', 55, filter(ctx, 'lowpass', 400, 1, envelope(ctx, 0.8, 0.35)), 0.4)
  } },
  duang: { duration: 0.5, render: ctx => {
    const o = osc(ctx, 'sine', 200, envelope(ctx, 0.9, 0.48), 0.5)
    o.frequency.linearRampToValueAtTime(600, 0.2)
    o.frequency.linearRampToValueAtTime(300, 0.45)
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 25
    lfoGain.connect(o.frequency)
    osc(ctx, 'sine', 9, lfoGain, 0.5)
  } },
  muyu: { duration: 0.15, render: ctx => {
    osc(ctx, 'sine', 800, envelope(ctx, 0.8, 0.12), 0.15)
    osc(ctx, 'sine', 1250, envelope(ctx, 0.4, 0.06), 0.1)
  } },
  gong: { duration: 1.5, render: ctx => {
    ;[1, 1.48, 2.03, 2.6, 3.32].forEach((ratio, i) => osc(ctx, 'sine', 110 * ratio, envelope(ctx, 0.5 / (i + 1), 1.45), 1.5))
  } },
  quack: { duration: 0.3, render: ctx => {
    const out = envelope(ctx, 0.6, 0.28)
    const o = osc(ctx, 'square', 300, filter(ctx, 'bandpass', 900, 5, out), 0.3)
    o.connect(filter(ctx, 'bandpass', 1600, 5, out))
    o.frequency.linearRampToValueAtTime(240, 0.28)
  } },
  clap: { duration: 0.2, render: ctx => {
    ;[0, 0.01, 0.02].forEach(at => {
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(0.7, at + 0.003)
      g.gain.exponentialRampToValueAtTime(0.0001, at + (at === 0.02 ? 0.17 : 0.03))
      g.connect(ctx.destination)
      noise(ctx, filter(ctx, 'bandpass', 1500, 1, g), 0.2 - at, at)
    })
  } },
  tick: { duration: 0.04, render: ctx => { osc(ctx, 'sine', 1500, envelope(ctx, 0.7, 0.03), 0.04) } },
}

export async function renderSounds(sampleRate = 44100): Promise<Record<SoundId, AudioBuffer>> {
  const entries = await Promise.all(
    (Object.keys(SOUND_RECIPES) as SoundId[]).map(async id => {
      const recipe = SOUND_RECIPES[id]
      const ctx = new OfflineAudioContext(1, Math.ceil(recipe.duration * sampleRate), sampleRate)
      recipe.render(ctx)
      return [id, await ctx.startRendering()] as const
    }),
  )
  return Object.fromEntries(entries) as Record<SoundId, AudioBuffer>
}
