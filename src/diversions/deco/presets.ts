import type { DecoConfig } from './schema'

// Palette = fill colors + a matching border. Each cell picks one fill at random.
export const palettePresets: { name: string; patch: Pick<DecoConfig, 'palette' | 'border'> }[] = [
  { name: 'De Stijl', patch: { palette: ['#f4f0e6', '#e02128', '#0b5ac0', '#f7c700', '#1a1a1e'], border: '#0c0c10' } },
  { name: 'Deco Gold', patch: { palette: ['#0f0e0a', '#c8a24a', '#e8d59a', '#7a5a1e', '#f4ecd0'], border: '#070605' } },
  { name: 'Jewel', patch: { palette: ['#0a1e2e', '#0e7a6e', '#b8305a', '#f0a830', '#3a2a6e'], border: '#05080c' } },
  { name: 'Pastel', patch: { palette: ['#ffd9e0', '#c8e8ff', '#d8f0c8', '#fff0c0', '#e8d8ff'], border: '#2a2a34' } },
  { name: 'Mono', patch: { palette: ['#0f0f12', '#3a3a42', '#7a7a86', '#c8c8d2', '#f4f4fa'], border: '#050507' } },
]
