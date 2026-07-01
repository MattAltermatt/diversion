import type { PhyllotaxisConfig } from './schema'

// One independent axis: the whole look. Each preset patches background + mesh
// stroke + colorBy + the palette group together, so the piece slides in one click
// from the gallery-tuned dark default to the exact white/rainbow source video.
export interface PalettePreset {
  name: string
  patch: Partial<PhyllotaxisConfig>
}

export const palettePresets: PalettePreset[] = [
  {
    name: 'Nightglass',
    patch: {
      background: '#0b0713', strokeColor: '#05030a', strokeWidth: 0.6, colorBy: 'index',
      color: { stops: ['#5b2a86ff', '#3b5bdbff', '#2bb2c9ff', '#3fbf6fff', '#e8c24aff', '#e0568aff'] },
    },
  },
  {
    // Snaps to Milan Lajtoš's 2012 source video: rainbow-by-index on white.
    name: 'Faithful (Lajtoš)',
    patch: {
      background: '#f4f2ee', strokeColor: '#ffffff', strokeWidth: 0.8, colorBy: 'index',
      color: { stops: ['#ff2d2dff', '#ff9a2dff', '#ffe02dff', '#37d13bff', '#2d9bffff', '#7a3bffff', '#ff2df0ff'] },
    },
  },
  {
    name: 'Mono Gold',
    patch: {
      background: '#0a0805', strokeColor: '#05030a', strokeWidth: 0.5, colorBy: 'radius',
      color: { stops: ['#4a2c0aff', '#8a5a12ff', '#d69a2aff', '#ffd24aff', '#fff0b0ff'] },
    },
  },
  {
    name: 'Dusk',
    patch: {
      background: '#120a1e', strokeColor: '#08040e', strokeWidth: 0.6, colorBy: 'index',
      color: { stops: ['#2a1a4aff', '#6a2a7aff', '#c23a6aff', '#f07a3aff', '#ffc24aff'] },
    },
  },
]
