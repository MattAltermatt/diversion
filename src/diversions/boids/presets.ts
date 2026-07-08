// presets.ts — declared data (framework renders one dropdown per group). Two
// independent axes: flocking dynamics (how it moves) and palette (how it looks).
import type { PresetGroup } from '../../framework/types'
import type { BoidsConfig } from './schema'

export const boidsPresets: PresetGroup<BoidsConfig>[] = [
  {
    label: 'Flock',
    options: [
      // Every option in a group patches the SAME key-set (framework matchPresets
      // rule) — all three set separation/alignment/cohesion/perception/maxSpeed.
      { name: 'Tight Formation', patch: { separation: 1.4, alignment: 1.3, cohesion: 1.1, perception: 55, maxSpeed: 85 } },
      { name: 'Loose Drift', patch: { separation: 1.0, alignment: 0.7, cohesion: 0.6, perception: 65, maxSpeed: 70 } },
      { name: 'Wild Vortices', patch: { separation: 0.9, alignment: 1.6, cohesion: 1.3, perception: 75, maxSpeed: 150 } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Dusk Murmuration', patch: { palette: ['#4d7fffcc', '#8f5bffcc', '#d65bffcc', '#ff5ba0cc', '#ffb15bcc'], background: '#060814' } },
      { name: 'Ice Flight', patch: { palette: ['#bfefffcc', '#8fd7ffcc', '#5bb8ffcc', '#dff6ffcc'], background: '#040910' } },
      { name: 'Ember Swarm', patch: { palette: ['#ffcf5bcc', '#ff8f5bcc', '#ff5b5bcc', '#ffe3a3cc'], background: '#100604' } },
    ],
  },
]
