import type { ChladniConfig } from './schema'

// Two independent preset axes. "Figure" sets a fixed mode (or hands control back
// to auto-cycle); "Palette" recolors the sand + plate. Each option in a group
// patches the SAME key-set (matchPresets assumes equal key-sets per group).

export const figurePresets: Array<{ name: string; patch: Partial<ChladniConfig> }> = [
  { name: 'Auto-cycle', patch: { autoCycle: 'cycle', modeN: 3, modeM: 4, superposition: '+' } },
  { name: 'Cross (2,3)', patch: { autoCycle: 'fixed', modeN: 2, modeM: 3, superposition: '+' } },
  { name: 'Star (3,5)', patch: { autoCycle: 'fixed', modeN: 3, modeM: 5, superposition: '+' } },
  { name: 'Lattice (4,6)', patch: { autoCycle: 'fixed', modeN: 4, modeM: 6, superposition: '+' } },
  { name: 'Web (5,7)', patch: { autoCycle: 'fixed', modeN: 5, modeM: 7, superposition: '-' } },
  { name: 'Diagonal (2,5)', patch: { autoCycle: 'fixed', modeN: 2, modeM: 5, superposition: '-' } },
]

export const palettePresets: Array<{ name: string; patch: Partial<ChladniConfig> }> = [
  { name: 'Warm sand', patch: { grainColor: '#f4ead2', background: '#0a0a10' } },
  { name: 'White ash', patch: { grainColor: '#fbfbff', background: '#050507' } },
  { name: 'Phosphor', patch: { grainColor: '#8dff9e', background: '#02120a' } },
  { name: 'Blueprint', patch: { grainColor: '#bfe0ff', background: '#071626' } },
  { name: 'Ember', patch: { grainColor: '#ffb066', background: '#12070a' } },
]
