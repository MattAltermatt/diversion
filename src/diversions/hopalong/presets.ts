import type { HopalongConfig } from './schema'

export type MapPreset = {
  name: string
  patch: Pick<HopalongConfig, 'map' | 'seed'>
}

// One signature seed per map — a "known-beautiful discovery" for that family
// rather than a raw coefficient set (mirrors strange-attractors).
export const mapPresets: MapPreset[] = [
  { name: 'Martin (sqrt)', patch: { map: 'martin', seed: 7 } },
  { name: 'Sine cousin', patch: { map: 'sine', seed: 7 } },
  { name: 'RR (exponent)', patch: { map: 'rr', seed: 7 } },
]

export type PalettePreset = {
  name: string
  background: HopalongConfig['background']
  palette: HopalongConfig['palette']
}

export const palettePresets: PalettePreset[] = [
  {
    name: 'Plasma',
    background: '#05070f',
    palette: ['#0b1a3d', '#2b4fd6', '#22d0e8', '#ffe45e', '#ffffff'],
  },
  {
    name: 'Ember',
    background: '#0a0503',
    palette: ['#210500', '#8a1a00', '#ff5a00', '#ffb703', '#fff3c4'],
  },
  {
    name: 'Ice',
    background: '#030910',
    palette: ['#041b2d', '#0b5d75', '#39c6c6', '#bdfcff', '#ffffff'],
  },
  {
    name: 'Mono',
    background: '#000000',
    palette: ['#101010', '#4a4a4a', '#a0a0a0', '#ffffff'],
  },
]
