import type { PlatonicFoldingConfig } from './schema'

// The color/appearance preset axis (Schema UX canon #256) — each option patches the
// whole Color group so it stays in lockstep with manual edits (matchPresets).
type PaletteFields = Pick<PlatonicFoldingConfig, 'background' | 'palette' | 'lightContrast'>

export const palettePresets: { name: string; patch: PaletteFields }[] = [
  { name: 'Carnival',
    patch: { background: '#06070c', palette: ['#ff6b6b', '#ffd166', '#06d6a0', '#118ab2', '#a06cd5'], lightContrast: 0.7 } },
  { name: 'Ice',
    patch: { background: '#040a12', palette: ['#dff6ff', '#9fd8ff', '#5fb0ff', '#2c7fd6', '#123a66'], lightContrast: 0.6 } },
  { name: 'Ember',
    patch: { background: '#0a0503', palette: ['#3a0d04', '#a83216', '#f0872b', '#ffd97a', '#fff4d6'], lightContrast: 0.8 } },
  { name: 'Copper',
    patch: { background: '#08070a', palette: ['#5a4a2e', '#8f7a4a', '#c3ad74'], lightContrast: 0.5 } },
]
