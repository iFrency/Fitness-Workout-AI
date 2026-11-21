export type DecodeResult = { ok: true; buffer: AudioBuffer } | { ok: false; error: 'decode' }

export async function decodeUserMusic(ctx: BaseAudioContext, blob: Blob): Promise<DecodeResult> {
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer())
    return { ok: true, buffer }
  } catch (error: unknown) {
    console.error('自选音乐解码失败', error)
    return { ok: false, error: 'decode' }
  }
}
