import type { PresetGroup } from '../../framework/types'
import type { GalaxyCollisionConfig } from './schema'

// Two independent axes: the ENCOUNTER geometry (how the cores meet) and the
// PALETTE (the two disk ramps). Each group's options share one key-set (the
// framework's matchPresets assumes that). Defaults equal the first option of
// each group, so a fresh config reads as "Grazing" + "Antennae", not "Custom".
export const galaxyCollisionPresets: PresetGroup<GalaxyCollisionConfig>[] = [
  {
    label: 'Encounter',
    options: [
      // grand grazing fly-by with prograde spin → the iconic long tidal tails
      { name: 'Grazing', patch: { impactParameter: 0.9, approachSpeed: 0.55, retrograde: false } },
      // near head-on smash → shells and a violent bridge
      { name: 'Head-on', patch: { impactParameter: 0.1, approachSpeed: 0.7, retrograde: false } },
      // grazing but the second disk spins against the orbit → stubbier, choppier
      { name: 'Retrograde', patch: { impactParameter: 0.9, approachSpeed: 0.55, retrograde: true } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Antennae',      patch: { colorsA: ['#2a0d02', '#ff7a1e', '#ffe6b0'], colorsB: ['#04121f', '#2f7bff', '#dbecff'] } },
      { name: 'Ember & Ice',   patch: { colorsA: ['#1a0500', '#ff4d2e', '#ffd08a'], colorsB: ['#001318', '#12a7c8', '#e6ffff'] } },
      { name: 'Gold & Violet', patch: { colorsA: ['#241400', '#ffb020', '#fff2c8'], colorsB: ['#120423', '#8b5cff', '#f0e6ff'] } },
      { name: 'Rose & Cyan',   patch: { colorsA: ['#260214', '#ff4f9d', '#ffd8ea'], colorsB: ['#012021', '#1fe0d0', '#e6fffb'] } },
    ],
  },
]
