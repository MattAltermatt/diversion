import type { PresetOption } from '../../framework/types'
import type { LangtonsLoopsConfig } from './schema'

type Sig = LangtonsLoopsConfig['signal']

export const palettePresets: PresetOption<LangtonsLoopsConfig>[] = [
  { name: 'Reef', patch: { background: '#06080d', sheath: '#1f7a8c',
      signal: { hueStart: 40, hueSpan: 260, saturation: 78, lightness: 66 } as Sig } },
  { name: 'Bone', patch: { background: '#0b0e14', sheath: '#e8e2d0',
      signal: { hueStart: 190, hueSpan: 150, saturation: 38, lightness: 62 } as Sig } },
  { name: 'Ink', patch: { background: '#f4f1e8', sheath: '#3a4252',
      signal: { hueStart: 200, hueSpan: 160, saturation: 45, lightness: 48 } as Sig } },
  { name: 'Nocturne', patch: { background: '#0a0a1f', sheath: '#5a7fd6',
      signal: { hueStart: 170, hueSpan: 90, saturation: 70, lightness: 64 } as Sig } },
]
