import type { LyapunovConfig } from './schema'

// Palette = the chaos void + the warm city ramp (edge → deep). High contrast.
export const palettePresets: {
  name: string
  patch: Pick<LyapunovConfig, 'chaosColor' | 'cityEdge' | 'cityDeep'>
}[] = [
  { name: 'Zircon',  patch: { chaosColor: '#060312', cityEdge: '#ffd27a', cityDeep: '#5a120a' } },
  { name: 'Ember',   patch: { chaosColor: '#0a0402', cityEdge: '#ffb24a', cityDeep: '#7a1e05' } },
  { name: 'Gold',    patch: { chaosColor: '#04060f', cityEdge: '#fff0a0', cityDeep: '#8a4a10' } },
  { name: 'Copper',  patch: { chaosColor: '#0c0608', cityEdge: '#ffcf9e', cityDeep: '#5c1f12' } },
  { name: 'Verdant', patch: { chaosColor: '#02100c', cityEdge: '#e8ff9a', cityDeep: '#1e5a12' } },
]
