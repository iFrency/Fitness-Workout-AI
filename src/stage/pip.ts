/** Picture-in-picture layout: one main view plus two small views in the bottom corners. */

export type CameraPreset = 'threeQuarter' | 'front' | 'side'

export const CAMERA_POSITIONS: Readonly<Record<CameraPreset, [number, number, number]>> = {
  threeQuarter: [2.2, 1.4, 2.6],
  front: [0, 1.2, 3.2],
  side: [3.2, 1.2, 0],
}

export const VIEW_LABELS: Readonly<Record<CameraPreset, string>> = { threeQuarter: '斜侧', front: '正面', side: '侧面' }

const PRESET_ORDER: readonly CameraPreset[] = ['threeQuarter', 'front', 'side']
const INSET_WIDTH_RATIO = 0.28
const INSET_MAX_HEIGHT_RATIO = 0.4
const INSET_ASPECT = 3 / 4
const INSET_MARGIN = 10

/** A viewport in CSS pixels, measured from the bottom-left like WebGL viewports. */
export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export function insetRects(width: number, height: number): readonly [Rect, Rect] {
  let w = Math.round(width * INSET_WIDTH_RATIO)
  let h = Math.round(w / INSET_ASPECT)
  if (h > height * INSET_MAX_HEIGHT_RATIO) {
    h = Math.round(height * INSET_MAX_HEIGHT_RATIO)
    w = Math.round(h * INSET_ASPECT)
  }
  return [
    { x: INSET_MARGIN, y: INSET_MARGIN, width: w, height: h },
    { x: width - w - INSET_MARGIN, y: INSET_MARGIN, width: w, height: h },
  ]
}

export function viewOrder(main: CameraPreset): { main: CameraPreset; insets: readonly [CameraPreset, CameraPreset] } {
  const others = PRESET_ORDER.filter(p => p !== main)
  return { main, insets: [others[0], others[1]] }
}
