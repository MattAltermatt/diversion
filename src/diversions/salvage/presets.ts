import type { PresetGroup } from '../../framework/types'
import type { SalvageConfig } from './schema'

// Two axes. Crew: how the colony behaves. Palette: the ramp the Contours source is
// painted in — Ablation's six, so the two pieces share one look. Every option in a
// group patches the SAME key set (matchPresets rule), and Calm / Bathymetric ARE the
// defaults so both pickers open on a name (#311). Palette patches ONLY the ramp,
// not `source` as Ablation's do: Salvage opens on Pictures, and a patch carrying
// `source: 'Contours'` would read "Custom" against untouched defaults.
export const salvagePresets: PresetGroup<SalvageConfig>[] = [
  {
    label: 'Palette',
    options: [
      { name: 'Bathymetric', patch: { palette: ['#1b4f6b', '#247091', '#2f8b9b', '#67b8ab', '#b2d18d', '#f2e2b0'] } },
      { name: 'Ember',       patch: { palette: ['#6b2810', '#963a12', '#c25518', '#e08128', '#f4ad46', '#ffe0a3'] } },
      { name: 'Monochrome',  patch: { palette: ['#4d4d4d', '#f2f2f2'] } },
      { name: 'Verdigris',   patch: { palette: ['#18543d', '#217a58', '#33a074', '#6fc298', '#a9dcb8', '#e6f2d9'] } },
      { name: 'Ultraviolet', patch: { palette: ['#4d2694', '#6b34b3', '#8b4cd1', '#ac72e0', '#cd9bee', '#f0d9ff'] } },
      { name: 'Mariners',    patch: { palette: ['#1a3d9e', '#2350d0', '#3d72f0', '#4d9bff', '#f0b429', '#ffe9b0'] } },
    ],
  },
  {
    label: 'Crew',
    options: [
      { name: 'Calm',          patch: { drones: 60,  strength: 3, chunkSize: 12, immunity: 20, trailFade: 25 } },
      { name: 'Swarm',         patch: { drones: 320, strength: 8, chunkSize: 12, immunity: 5,  trailFade: 10 } },
      { name: 'Heavy lifting', patch: { drones: 50,  strength: 2, chunkSize: 24, immunity: 20, trailFade: 40 } },
    ],
  },
]
