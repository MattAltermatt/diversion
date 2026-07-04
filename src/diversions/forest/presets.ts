import type { PresetOption } from '../../framework/types'
import type { ForestConfig } from './schema'

// Two independent preset axes: Season (palette) and Grove (composition/form).
// Each patch is applied over the current config (top-level spread).

export const seasonPresets: PresetOption<ForestConfig>[] = [
  { name: 'Spring blossom', patch: { season: 'Spring', background: '#0b0a10', foliage: true } },
  { name: 'Summer green', patch: { season: 'Summer', background: '#070c0a', foliage: true } },
  { name: 'Autumn amber', patch: { season: 'Autumn', background: '#0e0906', foliage: true } },
  { name: 'Winter snow', patch: { season: 'Winter', background: '#05080b', foliage: true } },
  { name: 'Bare wood', patch: { season: 'Bare', background: '#0a0807', foliage: false } },
]

export const grovePresets: PresetOption<ForestConfig>[] = [
  { name: 'Deep forest', patch: { treeCount: 16, depth: 7, branchAngle: 26, angleJitter: 9, splitFactor: 2, lengthDecay: 0.72 } },
  { name: 'Sparse grove', patch: { treeCount: 6, depth: 8, branchAngle: 22, angleJitter: 7, splitFactor: 2, lengthDecay: 0.74 } },
  { name: 'Tall stand', patch: { treeCount: 9, depth: 8, branchAngle: 16, angleJitter: 6, splitFactor: 2, lengthDecay: 0.78 } },
  { name: 'Broad canopy', patch: { treeCount: 8, depth: 7, branchAngle: 38, angleJitter: 10, splitFactor: 3, lengthDecay: 0.7 } },
  { name: 'Windswept thicket', patch: { treeCount: 14, depth: 7, branchAngle: 30, angleJitter: 20, splitFactor: 2, lengthDecay: 0.68 } },
]
