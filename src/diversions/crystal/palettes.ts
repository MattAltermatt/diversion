// Motif palettes — vivid, high-contrast sets meant to read boldly on a dark
// background (the zen / ornate-wrapping-paper look). Each is 4–5 colours the
// motif shapes draw from. 'auto' (schema) rolls one of these from the seed.

export type Palette = { name: string; colors: string[] }

export const PALETTES: Palette[] = [
  { name: 'Zellige',  colors: ['#0e9c8f', '#e8b23a', '#d8483a', '#f2ede0', '#2a6f8f'] },
  { name: 'Alhambra', colors: ['#e0473a', '#f0a830', '#2b8a6b', '#f2e9d8', '#3a5a8c'] },
  { name: 'Neon',     colors: ['#00e5c8', '#ff2d8e', '#ffd23f', '#8a5cff', '#18f2a0'] },
  { name: 'Ukiyo',    colors: ['#e8734a', '#2d5f7c', '#e8c34a', '#d8d0c0', '#7c3a52'] },
  { name: 'Jewel',    colors: ['#c81d5a', '#1d8fc8', '#e6b422', '#1fae7a', '#f0e6d2'] },
  { name: 'Verdant',  colors: ['#f25c54', '#f4a259', '#8ac926', '#4cc9f0', '#f2e9e4'] },
  { name: 'Byzantine',colors: ['#d4af37', '#7b2d43', '#1c6b5a', '#e8e2d0', '#2c4a6e'] },
  { name: 'Sakura',   colors: ['#f7a3c4', '#e94f7c', '#f6d365', '#7fd8be', '#fdf0e6'] },
]

export const PALETTE_NAMES = PALETTES.map((p) => p.name)

/** Resolve a palette name (or 'auto') + seed → the concrete colour list.
 *  'auto' picks deterministically from the seed so a given seed always shows
 *  the same wallpaper. */
export function resolvePalette(name: string, seed: number): string[] {
  if (name !== 'auto') {
    const found = PALETTES.find((p) => p.name === name)
    if (found) return found.colors
  }
  // deterministic auto-pick from the seed (own hashed stream so it doesn't
  // correlate with the group / motif picks)
  const h = (seed ^ 0x9e3f13a7) >>> 0
  return PALETTES[h % PALETTES.length].colors
}
