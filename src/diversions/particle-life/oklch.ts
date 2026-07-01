// oklch.ts — OKLCH → sRGB with gamut mapping. Species colors are generated in
// OKLCH (Björn Ottosson's OKLab in cylindrical form) so that a fixed lightness L
// reads as the SAME perceived brightness across every hue — unlike HSL, where a
// yellow and a blue at equal "L" differ wildly in brightness. Even hue steps in
// OKLCH are also far more perceptually uniform than in HSL. Out-of-sRGB colors are
// gamut-mapped by reducing chroma at constant L and H (the standard approach), so
// no channel clips and hue/lightness are preserved.
//
// (Local to this diversion for now; a natural future promotion to framework/color.ts.)

const DEG = Math.PI / 180

/** OKLCH (L 0..1, C ≥ 0, H degrees) → LINEAR sRGB (may fall outside [0,1]). */
function oklchToLinear(L: number, C: number, H: number): [number, number, number] {
  const a = C * Math.cos(H * DEG)
  const b = C * Math.sin(H * DEG)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]
}

const inGamut = ([r, g, b]: [number, number, number]) => {
  const e = 1e-4
  return r >= -e && r <= 1 + e && g >= -e && g <= 1 + e && b >= -e && b <= 1 + e
}

/** Linear channel → sRGB gamma → 0-255 integer. */
function encode(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(v * 255)))
}

const hex2 = (v: number) => v.toString(16).padStart(2, '0')

/** OKLCH → "#rrggbb", gamut-mapped by bisecting chroma toward 0 until the color
 *  fits in sRGB (constant L and H). */
export function oklchToHex(L: number, C: number, H: number): string {
  let lin = oklchToLinear(L, C, H)
  if (!inGamut(lin)) {
    let lo = 0, hi = C
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(oklchToLinear(L, mid, H))) lo = mid
      else hi = mid
    }
    lin = oklchToLinear(L, lo, H)
  }
  const [r, g, b] = lin
  return `#${hex2(encode(r))}${hex2(encode(g))}${hex2(encode(b))}`
}
