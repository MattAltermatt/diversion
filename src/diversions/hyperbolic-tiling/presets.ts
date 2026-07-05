import type { PresetOption } from '../../framework/types'
import type { HyperbolicTilingConfig } from './schema'

// Classic {p,q} pairs — all satisfy (p−2)(q−2) > 4. Named the way the
// tiling-theory literature names them: "order-q p-gonal tiling".
export const tilingPresets: PresetOption<HyperbolicTilingConfig>[] = [
  { name: 'Order-3 Heptagonal {7,3}', patch: { p: 7, q: 3 } },
  { name: 'Order-4 Pentagonal {5,4}', patch: { p: 5, q: 4 } },
  { name: 'Order-5 Square {4,5}', patch: { p: 4, q: 5 } },
  { name: 'Order-4 Hexagonal {6,4}', patch: { p: 6, q: 4 } },
  { name: 'Order-3 Octagonal {8,3}', patch: { p: 8, q: 3 } },
  { name: 'Order-7 Triangular {3,7}', patch: { p: 3, q: 7 } },
]

export const palettePresets: PresetOption<HyperbolicTilingConfig>[] = [
  { name: 'Escher Ink', patch: { colors: ['#f2ead6', '#c9974a', '#8a4a2a', '#3a1c14'], edgeColor: '#160d08', background: '#0c0704' } },
  { name: 'Circle Limit Fire', patch: { colors: ['#ffcf6b', '#e8622c', '#a2183c', '#3a0a1a'], edgeColor: '#0e0308', background: '#0a0308' } },
  { name: 'Deep Sea', patch: { colors: ['#a6f5ec', '#3fb0d8', '#1c5f9c', '#0a2350'], edgeColor: '#040a1a', background: '#03081a' } },
  { name: 'Aurora', patch: { colors: ['#d8ffe8', '#5be0a0', '#1f8a6b', '#0e3a2e'], edgeColor: '#061c14', background: '#061410' } },
  { name: 'Mono', patch: { colors: ['#f2f2f6', '#b6b6c2', '#6a6a78', '#2a2a32'], edgeColor: '#0a0a0e', background: '#0a0a0e' } },
]
