import type { QuasicrystalConfig } from './schema'

// Symmetry = number of wave gratings → the rotational order of the lattice.
export const symmetryPresets: { name: string; patch: Pick<QuasicrystalConfig, 'waves'> }[] = [
  { name: 'Pentafoil',  patch: { waves: 5 } },
  { name: 'Snowflake',  patch: { waves: 6 } },
  { name: 'Heptafoil',  patch: { waves: 7 } },
  { name: 'Nonafoil',   patch: { waves: 9 } },
  { name: 'Dense',      patch: { waves: 11 } },
]

// Duotone crest/trough pairs (high contrast — UX invariant #5).
export const colorPresets: { name: string; patch: Pick<QuasicrystalConfig, 'colorA' | 'colorB'> }[] = [
  { name: 'Aurora',  patch: { colorA: '#0a0420', colorB: '#3ad0ff' } },
  { name: 'Ink',     patch: { colorA: '#0a0a0c', colorB: '#f4f4fa' } },
  { name: 'Gold',    patch: { colorA: '#100a02', colorB: '#ffcf5a' } },
  { name: 'Magma',   patch: { colorA: '#120406', colorB: '#ff6a2a' } },
  { name: 'Orchid',  patch: { colorA: '#100420', colorB: '#ff5de0' } },
]
