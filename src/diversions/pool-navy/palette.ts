// An unbounded supply of faction colours.
//
// Factions never stop arriving, so a fixed list cannot work. The configured
// palette supplies the first few; after that a golden-angle hue walk, which
// keeps consecutive arrivals far apart on the wheel — and consecutive
// arrivals are what a viewer compares.
//
// Only 2-3 factions are alive at once, so the requirement is "the ones on
// screen separate", not "143 distinguishable colours".

import { parseHex6, srgbToOklab } from '../../framework/color'

/** 137.508 deg — consecutive samples land as far apart as a sequence allows. */
export const GOLDEN_ANGLE = 137.508

export function hueFor(index: number): number {
  return (index * GOLDEN_ANGLE + 8) % 360
}

/**
 * Minimum perceptual (OKLab) lightness gap between a hull and the water.
 *
 * ⚠️ MEASURED. An earlier version lifted colours whose HUE landed near the
 * water's, which solves the wrong problem: a hull disappears when its
 * LIGHTNESS matches, and that happens at any hue. Against the default ground
 * (L = 0.571), hue-based lifting left 195 of 496 factions within 0.12 L of the
 * water and a worst case of 0.0015 — invisible boats, at nearly 40% of hues.
 */
export const MIN_WATER_GAP = 0.18

/**
 * Solved against a hair more than the bound, because the scan steps in whole
 * percent of HSL lightness and would otherwise land exactly ON it — 0.179994
 * against a 0.18 guarantee.
 */
const GAP_EPS = 1e-3


/** HSL lightness a generated faction opens at, before any solve. */
const BASE_L = 60

const solved = new Map<string, number>()

/**
 * The HSL lightness nearest BASE_L whose OKLab lightness clears the water by
 * MIN_WATER_GAP.
 *
 * A linear scan outward from BASE_L rather than a bisection, for the same
 * reason `quantize.ts` scans: the gap is V-shaped in lightness — it falls to
 * zero at the water's own L and rises on both sides — so the predicate is not
 * monotone and bisection is only valid on one side of the vee. Scanning both
 * ways also means a LIGHT ground pushes hulls darker with no special case.
 */
function solveLightness(hue: number, saturation: number, waterL: number): number {
  const key = `${hue.toFixed(1)}|${saturation}|${waterL.toFixed(4)}`
  const hit = solved.get(key)
  if (hit !== undefined) return hit
  let best = BASE_L
  for (let d = 0; d <= 46; d += 1) {
    for (const l of d === 0 ? [BASE_L] : [BASE_L + d, BASE_L - d]) {
      if (l < 14 || l > 92) continue
      if (Math.abs(lightnessOfHsl(hue, saturation, l) - waterL) >= MIN_WATER_GAP + GAP_EPS) {
        solved.set(key, l)
        return l
      }
      best = l
    }
  }
  solved.set(key, best)
  return best
}

/** "#rrggbb" -> HSL, hue in degrees, the rest in percent. */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = parseHex6(hex)
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const c = max - min
  if (c === 0) return { h: 0, s: 0, l: l * 100 }
  const s = c / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === R) h = ((G - B) / c) % 6
  else if (max === G) h = (B - R) / c + 2
  else h = (R - G) / c + 4
  return { h: (((h * 60) % 360) + 360) % 360, s: s * 100, l: l * 100 }
}

/**
 * The colour a faction flies.
 *
 * ⚠️ The configured palette runs through the SAME lightness solve as the
 * generated hues. It used to be returned verbatim, which quietly exempted the
 * two opening sides — the landing view, and up to 48 hulls of it — from the
 * guarantee this module exists for. Measured against the default ground
 * (L 0.571): faction 0 `#e5534b` sat at a gap of 0.067 and faction 1
 * `#4a9df0` at 0.112, against a 0.18 requirement, and the `Chlorine` preset
 * reached 0.041. The schema's own help string promised the opposite.
 *
 * The viewer's HUE and SATURATION are kept exactly; only lightness moves, and
 * only as far as it must.
 */
export function factionColor(index: number, palette: readonly string[], background: string): string {
  const waterL = lightnessOf(background)
  const named = palette[index]
  if (named !== undefined) {
    const { h, s, l } = hexToHsl(named)
    if (Math.abs(lightnessOfHsl(h, s, l) - waterL) >= MIN_WATER_GAP) return named
    return `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${solveLightness(h, s, waterL)}%)`
  }
  const h = hueFor(index)
  const sat = 78
  return `hsl(${h.toFixed(1)} ${sat}% ${solveLightness(h, sat, waterL)}%)`
}

/**
 * The outline for a hull of this faction.
 *
 * ⚠️ Derived from the RESOLVED hull colour, not from a fixed lightness. A
 * constant `26%` is not always darker than the hull: on the shipped
 * `Chlorine` preset, `#011627` resolves to L 0.193 while the constant outline
 * came out at L 0.384 — a *lighter* outline, on every ground tested. The old
 * test only ever swept `DEFAULTS.palette` and never saw a preset.
 */
export function factionDark(index: number, palette: readonly string[], background: string): string {
  const hull = factionColor(index, palette, background)
  const { h, s, l } = hull.startsWith('#') ? hexToHsl(hull) : parseHsl(hull)
  // Always a real step down from whatever the hull ended up at.
  return `hsl(${h.toFixed(1)} ${Math.min(70, s).toFixed(1)}% ${Math.max(6, l * 0.42).toFixed(1)}%)`
}

function parseHsl(css: string): { h: number; s: number; l: number } {
  const m = /hsl\(([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\)/.exec(css)
  if (!m) return { h: 0, s: 0, l: 50 }
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) }
}

/** OKLab lightness of an HSL triple. */
export function lightnessOfHsl(h: number, s: number, lPct: number): number {
  const sat = s / 100
  const l = lPct / 100
  const c = (1 - Math.abs(2 * l - 1)) * sat
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m0 = l - c / 2
  const rgb: [number, number, number] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return srgbToOklab((rgb[0] + m0) * 255, (rgb[1] + m0) * 255, (rgb[2] + m0) * 255).L
}

/** Perceptual lightness, for asserting a faction separates from the water. */
export function lightnessOf(css: string): number {
  if (css.startsWith('#')) {
    const { r, g, b } = parseHex6(css)
    return srgbToOklab(r, g, b).L
  }
  const m = /hsl\(([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\)/.exec(css)
  if (!m) return 0.5
  return lightnessOfHsl(Number(m[1]), Number(m[2]), Number(m[3]))
}
