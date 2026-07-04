import type { CelticConfig } from './schema'

// Jewel / metallic band + dark ground pairings. High contrast, luminous on black.
export const palettePresets: {
  name: string
  patch: Pick<CelticConfig, 'colorMode' | 'band' | 'background'>
}[] = [
  { name: 'Gold',    patch: { colorMode: 'single', band: '#f2c14e', background: '#0a0a14' } },
  { name: 'Emerald', patch: { colorMode: 'single', band: '#4de0a0', background: '#04120c' } },
  { name: 'Sapphire',patch: { colorMode: 'single', band: '#5aa8ff', background: '#050a16' } },
  { name: 'Ruby',    patch: { colorMode: 'single', band: '#ff5d7a', background: '#140508' } },
  { name: 'Copper',  patch: { colorMode: 'single', band: '#e8925a', background: '#100a06' } },
  { name: 'Rainbow', patch: { colorMode: 'rainbow', band: '#f2c14e', background: '#0a0a14' } },
]
