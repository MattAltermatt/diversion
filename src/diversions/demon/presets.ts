import type { DemonConfig } from './schema'

type ColorGroup = DemonConfig['color']

export const palettePresets: Array<{ name: string; patch: Partial<DemonConfig> }> = [
  { name: 'Rainbow', patch: { color: { hueStart: 0, hueSpan: 360, saturation: 70, lightness: 55 } as ColorGroup } },
  { name: 'Sunset', patch: { color: { hueStart: 350, hueSpan: 110, saturation: 80, lightness: 55 } as ColorGroup } },
  { name: 'Ice', patch: { color: { hueStart: 170, hueSpan: 90, saturation: 65, lightness: 60 } as ColorGroup } },
  { name: 'Lava', patch: { color: { hueStart: 0, hueSpan: 60, saturation: 90, lightness: 50 } as ColorGroup } },
  { name: 'Mono', patch: { color: { hueStart: 210, hueSpan: 20, saturation: 25, lightness: 60 } as ColorGroup } },
]

// All patterns sit in a lively regime (or a gentle settle→reseed cycle for the T=2
// 'Broad' look, ~7s cadence via the reseed lifecycle). 'Spiral' equals the schema
// default so the picker shows it selected on a fresh load (#38). Threshold caps at 2 —
// higher freezes the CA (see the schema help / #140/#194).
export const patternPresets: Array<{ name: string; patch: Partial<DemonConfig> }> = [
  { name: 'Classic', patch: { field: 'square', colors: 12, dominanceReach: 1, threshold: 1 } },
  { name: 'Spiral', patch: { field: 'hexagon', colors: 8, dominanceReach: 1, threshold: 1 } },
  { name: 'RPS', patch: { field: 'hexagon', colors: 6, dominanceReach: 2, threshold: 2 } },
  { name: 'Broad', patch: { field: 'hexagon', colors: 10, dominanceReach: 1, threshold: 2 } },
]
