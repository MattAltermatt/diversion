import type { MorphogenConfig } from './schema'

// Two independent axes (like Gray-Scott's Pattern/Color). Body plan sets the
// mechanism (layout + fate rule + shape); Palette sets the colors. matchPresets
// assumes equal key-sets per group, so every option patches the SAME keys.
type BodyKeys =
  | 'sourceLayout' | 'fateMode' | 'morphogenCount' | 'sourceCount' | 'gradientReach'
  | 'bands' | 'banding' | 'territoryMix' | 'edgeStrength' | 'gradientUnderlay'
  | 'bandGamma' | 'reactionCoupling'

export const bodyPlanPresets: { name: string; patch: Pick<MorphogenConfig, BodyKeys> }[] = [
  { name: 'Territories', patch: { sourceLayout: 'scatter', fateMode: 'territories',
      morphogenCount: 4, sourceCount: 7, gradientReach: 0.5, bands: 3, banding: 0.9,
      territoryMix: 0.7, edgeStrength: 0.4, gradientUnderlay: 0.15, bandGamma: 1, reactionCoupling: 0.1 } },
  { name: 'French Flag', patch: { sourceLayout: 'poles', fateMode: 'bands',
      morphogenCount: 2, sourceCount: 2, gradientReach: 0.7, bands: 3, banding: 0.92,
      territoryMix: 0.65, edgeStrength: 0.45, gradientUnderlay: 0.12, bandGamma: 1, reactionCoupling: 0 } },
  { name: 'Eyespot', patch: { sourceLayout: 'point', fateMode: 'bands',
      morphogenCount: 1, sourceCount: 2, gradientReach: 0.45, bands: 4, banding: 1,
      territoryMix: 0.5, edgeStrength: 0.5, gradientUnderlay: 0.1, bandGamma: 0.75, reactionCoupling: 0 } },
  { name: 'Segments', patch: { sourceLayout: 'edge', fateMode: 'bands',
      morphogenCount: 1, sourceCount: 2, gradientReach: 0.95, bands: 6, banding: 1,
      territoryMix: 0.5, edgeStrength: 0.35, gradientUnderlay: 0.15, bandGamma: 1, reactionCoupling: 0 } },
  { name: 'Lush', patch: { sourceLayout: 'scatter', fateMode: 'territories',
      morphogenCount: 4, sourceCount: 9, gradientReach: 0.4, bands: 4, banding: 0.85,
      territoryMix: 0.6, edgeStrength: 0.45, gradientUnderlay: 0.15, bandGamma: 1, reactionCoupling: 0.25 } },
]

export const palettePresets: { name: string; patch: Pick<MorphogenConfig, 'palette' | 'territoryColors'> }[] = [
  { name: 'Butterfly', patch: { palette: ['#0a0612', '#3b1d6e', '#e8d9ff'],
      territoryColors: ['#ffb300', '#ff4d6d', '#3ad1ff', '#7b2ff7'] } },
  { name: 'Savanna', patch: { palette: ['#2a1a08', '#8a5a1e', '#f2d9a0'],
      territoryColors: ['#c9922e', '#e0b568', '#7a4a1c', '#3a2410'] } },
  { name: 'Embryo', patch: { palette: ['#04121f', '#0a4f6e', '#bfeaff'],
      territoryColors: ['#1f6f9a', '#57c1e8', '#0e3d57', '#a8e6ff'] } },
  { name: 'Coral Reef', patch: { palette: ['#0a0520', '#b23a6a', '#ffd27f'],
      territoryColors: ['#ff6b6b', '#ffd166', '#06d6a0', '#118ab2'] } },
  { name: 'French Flag', patch: { palette: ['#1d3fb0', '#f4f4f8', '#c1272d'],
      territoryColors: ['#1d3fb0', '#c1272d', '#f4f4f8', '#7a7a8a'] } },
]
