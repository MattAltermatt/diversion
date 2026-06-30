import { hslToRgb } from '../../framework/color'
import type { LangtonsLoopsConfig } from './schema'

/** Number of brightness steps in the aged-coral ramp (active -> settled-dim). */
export const AGE_BUCKETS = 8

/** Which non-background, non-sheath states are "signals" (in ring order). */
const SIGNAL_STATES = [1, 3, 4, 5, 6, 7] as const

const hex = (h: string) => ({
  r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16),
})
const rgb = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`

export interface StateLut {
  /** state index (0..7) -> CSS color. Index 2 is the *active* sheath color. */
  [state: number]: string
  /** aged-sheath ramp: bucket 0 = active sheath, last = most-settled (dim). */
  agedSheath: string[]
}

/** Build the state -> color lookup from config (model B: bg + sheath + signal ring). */
export function buildStateLut(cfg: LangtonsLoopsConfig): StateLut {
  const lut = {} as StateLut
  lut[0] = cfg.background
  lut[2] = cfg.sheath
  const { hueStart, hueSpan, saturation, lightness } = cfg.signal
  SIGNAL_STATES.forEach((state, i) => {
    const hue = hueStart + (hueSpan * i) / SIGNAL_STATES.length
    const { r, g, b } = hslToRgb(hue, saturation, lightness)
    lut[state] = rgb(r, g, b)
  })
  // aged-coral ramp: lerp sheath -> background across buckets, but stop at 65%
  // so settled coral stays visible (recessed, not gone).
  const s = hex(cfg.sheath), bg = hex(cfg.background)
  const agedSheath: string[] = []
  for (let k = 0; k < AGE_BUCKETS; k++) {
    const f = (k / (AGE_BUCKETS - 1)) * 0.65
    agedSheath.push(rgb(s.r + (bg.r - s.r) * f, s.g + (bg.g - s.g) * f, s.b + (bg.b - s.b) * f))
  }
  lut.agedSheath = agedSheath
  return lut
}
