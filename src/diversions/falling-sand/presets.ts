import type { FallingSandConfig } from './schema'

// Palette = a coordinated element-color set + which elements the emitters may
// pour. Each patch is a full replacement (top-level spread patches whole groups).
export const palettePresets: { name: string; patch: Partial<FallingSandConfig> }[] = [
  {
    name: 'Classic',
    patch: {
      background: '#07080c',
      colors: { sand: '#d9a054', water: '#2e78c9', fire: '#ff7a1e', stone: '#5a5f66', plant: '#3f9e4a' },
      elements: { emitSand: true, emitWater: true, emitFire: true, emitPlant: true },
    },
  },
  {
    name: 'Volcanic',
    patch: {
      background: '#0a0503',
      colors: { sand: '#4a3221', water: '#1c3f52', fire: '#ff4b1f', stone: '#2b2320', plant: '#7a5a2a' },
      elements: { emitSand: true, emitWater: true, emitFire: true, emitPlant: true },
    },
  },
  {
    name: 'Aquarium',
    patch: {
      background: '#031018',
      colors: { sand: '#d8c48a', water: '#1fa2b8', fire: '#ff9d4d', stone: '#39506b', plant: '#2fae7a' },
      elements: { emitSand: true, emitWater: true, emitFire: false, emitPlant: true },
    },
  },
  {
    name: 'Ashfall',
    patch: {
      background: '#0c0c0e',
      colors: { sand: '#8a8a90', water: '#3a4550', fire: '#e0483c', stone: '#242629', plant: '#5a6a52' },
      elements: { emitSand: true, emitWater: false, emitFire: true, emitPlant: true },
    },
  },
]
