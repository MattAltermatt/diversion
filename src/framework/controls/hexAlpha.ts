// hexAlpha.ts — splitting and rejoining the alpha byte of a "#rrggbbaa" stop, shared by
// ColorList (a palette row) and Swatch (a single colour field). Both need the same answer
// to "does this value carry alpha", so it lives beside them rather than inside either
// (mirrors matrixTransforms.ts), which also lets both export nothing but their component
// so React Fast Refresh keeps working on them (#308).

/** Split a stop into rgb + alpha percent. "#rrggbbaa" carries an alpha byte;
 *  a 6-digit "#rrggbb" is alpha-less by design (e.g. an opaque density LUT whose
 *  field never uses alpha) — it reports `hasAlpha: false` so the row hides its
 *  alpha slider and edits stay 6-hex (matching the field's own regex). */
export function splitColor(hex: string): { rgb: string; alpha: number; hasAlpha: boolean } {
  const hasAlpha = hex.length >= 9
  return {
    rgb: hex.slice(0, 7),
    alpha: hasAlpha ? Math.round((parseInt(hex.slice(7, 9), 16) / 255) * 100) : 100,
    hasAlpha,
  }
}

/** ("#rrggbb", 0..100) -> "#rrggbbaa" */
export function joinColor(rgb: string, alphaPct: number): string {
  const aa = Math.round((alphaPct / 100) * 255)
    .toString(16)
    .padStart(2, '0')
  return `${rgb}${aa}`
}
