import type { CrystalConfig } from './schema'

// Curated whole-look combos (group + palette + scale + density). Picking one
// patches every field at once through the normal update path.
type Look = Pick<CrystalConfig, 'group' | 'palette' | 'cellSize' | 'motifComplexity'>

export const lookPresets: { name: string; patch: Look }[] = [
  { name: 'Shuffle',     patch: { group: 'auto', palette: 'auto', cellSize: 140, motifComplexity: 4 } },
  { name: 'Moorish',     patch: { group: 'p4m', palette: 'Zellige', cellSize: 150, motifComplexity: 5 } },
  { name: 'Hex Star',    patch: { group: 'p6m', palette: 'Alhambra', cellSize: 160, motifComplexity: 4 } },
  { name: 'Pinwheel',    patch: { group: 'p4g', palette: 'Neon', cellSize: 130, motifComplexity: 4 } },
  { name: 'Kaleidoscope',patch: { group: 'p3m1', palette: 'Jewel', cellSize: 150, motifComplexity: 6 } },
  { name: 'Damask',      patch: { group: 'cmm', palette: 'Byzantine', cellSize: 170, motifComplexity: 5 } },
  { name: 'Frieze',      patch: { group: 'pmg', palette: 'Ukiyo', cellSize: 120, motifComplexity: 3 } },
]
