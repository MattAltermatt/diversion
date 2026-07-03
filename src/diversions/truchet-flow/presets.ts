import type { TruchetFlowConfig } from './schema'

// Palette = trace (dim base) + current (bright flow) + background, as circuit-like
// schemes. High contrast between current and background.
export const palettePresets: {
  name: string
  patch: Pick<TruchetFlowConfig, 'trace' | 'flow' | 'background'>
}[] = [
  { name: 'Circuit', patch: { trace: '#123a2a', flow: '#4dffa0', background: '#060a08' } },
  { name: 'Neon',    patch: { trace: '#123a52', flow: '#4ad8ff', background: '#05080f' } },
  { name: 'Ember',   patch: { trace: '#3a1e08', flow: '#ffb84d', background: '#0c0704' } },
  { name: 'Magenta', patch: { trace: '#3a1234', flow: '#ff5de0', background: '#0a050c' } },
  { name: 'Ice',     patch: { trace: '#2a3244', flow: '#eaf6ff', background: '#080a0f' } },
]
