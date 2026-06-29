import { hslToRgb } from '../../framework/color'

/** N evenly-spaced hues sampled from [hueStart, hueStart+hueSpan), as CSS rgb() strings. */
export function buildHueRing(
  n: number, hueStart: number, hueSpan: number, saturation: number, lightness: number,
): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const hue = hueStart + (hueSpan * i) / n
    const { r, g, b } = hslToRgb(hue, saturation, lightness)
    out.push(`rgb(${r},${g},${b})`)
  }
  return out
}
