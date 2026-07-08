import type { RainOnGlassConfig } from './schema'
import { DEFAULT_PALETTE } from './schema'

export interface PalettePreset {
  name: string
  background: string
  palette: string[]
  hueDrift: number
}

export const palettePresets: PalettePreset[] = [
  { name: 'City Night', background: '#05070c', palette: DEFAULT_PALETTE, hueDrift: 0.12 },
  {
    name: 'Dusk',
    background: '#140b1f',
    palette: ['#ff9d6cef', '#ffd39ac2', '#c98bffb8', '#6f5ecfa3'],
    hueDrift: 0.2,
  },
  {
    name: 'Neon',
    background: '#04060f',
    palette: ['#ff2bd6e6', '#28e0ffe6', '#7cff4dcc', '#ffea2bcc'],
    hueDrift: 0.3,
  },
  {
    name: 'Forest',
    background: '#05100b',
    palette: ['#3ddc84cc', '#8fffd1b3', '#ffcf7acc', '#3aa0ffb3'],
    hueDrift: 0.08,
  },
]

export function palettePatch(p: PalettePreset): Partial<RainOnGlassConfig> {
  return { background: p.background, palette: p.palette, hueDrift: p.hueDrift }
}
