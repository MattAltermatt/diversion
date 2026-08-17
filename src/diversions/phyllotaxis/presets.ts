import type { PhyllotaxisConfig } from './schema'

export interface Preset {
  name: string
  patch: Partial<PhyllotaxisConfig>
}

// FORM axis — the render shape. Each option patches the same key-set (renderMode
// + every leaf knob + zoom) so matchPresets can detect the active one. The four
// leaf shapes reproduce the source video's range from one golden-angle rule: the
// landing burst of dashes, overlapping petals, a bloom of spikes, and the zoomed
// folded-tile vortex.
export const formPresets: Preset[] = [
  // The landing look: a radiating burst of dashes. These ARE the schema defaults —
  // 'Mesh' below was authored from them by flipping renderMode alone, which left the
  // default itself unnamed and the Form dropdown opening on "Custom" (#311).
  { name: 'Sunburst', patch: { renderMode: 'leaf', leafLength: 48, leafWidth: 14, leafAlpha: 0.8, leafRound: 0.5, leafShade: 0, zoom: 1 } },
  { name: 'Pompom', patch: { renderMode: 'leaf', leafLength: 34, leafWidth: 18, leafAlpha: 0.95, leafRound: 0.6, leafShade: 0.1, zoom: 1 } },
  { name: 'Bloom', patch: { renderMode: 'leaf', leafLength: 150, leafWidth: 5, leafAlpha: 0.45, leafRound: 1, leafShade: 0, zoom: 1 } },
  { name: 'Spiral Tiles', patch: { renderMode: 'leaf', leafLength: 62, leafWidth: 46, leafAlpha: 1, leafRound: 0.15, leafShade: 0.75, zoom: 1.8 } },
  { name: 'Mesh', patch: { renderMode: 'mesh', leafLength: 48, leafWidth: 14, leafAlpha: 0.8, leafRound: 0.5, leafShade: 0, zoom: 1 } },
]

// PALETTE axis — colour only. Each option patches background + mesh stroke +
// colorBy + the palette group together.
export const palettePresets: Preset[] = [
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
    // The video's cyan/maroon spiral-tile phase — pairs with the Spiral Tiles form.
    name: 'Cyan / Maroon',
    patch: {
      background: '#0a0a0f', strokeColor: '#05030a', strokeWidth: 0.6, colorBy: 'index',
      color: { stops: ['#7a1414ff', '#c0392bff', '#e8e8ecff', '#28c8d2ff', '#0d6e8cff'] },
    },
  },
  {
    // The video's signature: near-black shapes on white (spike bursts, tiles).
    name: 'Ink',
    patch: {
      background: '#f2f0ec', strokeColor: '#141414', strokeWidth: 0.6, colorBy: 'index',
      color: { stops: ['#171717ff', '#2e2e2eff', '#171717ff'] },
    },
  },
  {
    // Grayscale ramp for the lit-sphere / dome heads.
    name: 'Silver',
    patch: {
      background: '#f4f2ee', strokeColor: '#8a8a8a', strokeWidth: 0.4, colorBy: 'radius',
      color: { stops: ['#fafafaff', '#b8b8b8ff', '#3a3a3aff', '#141414ff'] },
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
