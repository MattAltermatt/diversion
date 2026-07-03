import type { JuliaMorphConfig } from './schema'

// Family = the orbit radius (`shape`), which reshapes the whole Julia lineage.
export const familyPresets: { name: string; patch: Pick<JuliaMorphConfig, 'shape'> }[] = [
  { name: 'Tendrils',  patch: { shape: 0.62 } },
  { name: 'Spirals',   patch: { shape: 0.74 } },
  { name: 'Classic',   patch: { shape: 0.7885 } },
  { name: 'Filigree',  patch: { shape: 0.83 } },
  { name: 'Scattered', patch: { shape: 0.95 } },
]

// Color triples: exterior gradient (A→B) + trapped interior. High contrast.
export const colorPresets: {
  name: string
  patch: Pick<JuliaMorphConfig, 'colorA' | 'colorB' | 'colorInside'>
}[] = [
  { name: 'Gold',    patch: { colorA: '#0b1e5a', colorB: '#ffd36b', colorInside: '#05030f' } },
  { name: 'Ice',     patch: { colorA: '#04263a', colorB: '#8ef0ff', colorInside: '#02060c' } },
  { name: 'Ember',   patch: { colorA: '#2a0602', colorB: '#ff8a3a', colorInside: '#0a0402' } },
  { name: 'Orchid',  patch: { colorA: '#2a0640', colorB: '#ff7de0', colorInside: '#0a0316' } },
  { name: 'Emerald', patch: { colorA: '#03291a', colorB: '#9dff8a', colorInside: '#02100a' } },
]
