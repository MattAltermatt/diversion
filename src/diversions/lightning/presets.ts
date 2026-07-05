import type { LightningConfig } from './schema'

// Two independent preset axes:
//   • Form — geometry + branchiness (what shape the discharge takes)
//   • Look — colours + glow + width (how the bolt is lit)
// Seed is excluded from both so the 🎲 dice stays independent.

type FormFields = Pick<LightningConfig, 'mode' | 'eta' | 'strikeSpeed'>

export const formPresets: { name: string; patch: FormFields }[] = [
  { name: 'Cloud-to-Ground', patch: { mode: 'cloud-to-ground', eta: 2.5, strikeSpeed: 160 } },
  { name: 'Lichtenberg Star', patch: { mode: 'radial', eta: 2, strikeSpeed: 220 } },
  { name: 'Feathered Fern', patch: { mode: 'cloud-to-ground', eta: 1, strikeSpeed: 240 } },
  { name: 'Jagged Fork', patch: { mode: 'cloud-to-ground', eta: 4, strikeSpeed: 120 } },
  { name: 'Point Discharge', patch: { mode: 'point-to-point', eta: 3, strikeSpeed: 140 } },
]

type LookFields = Pick<LightningConfig, 'boltWidth' | 'glow' | 'coreColor' | 'haloColor' | 'emberColor' | 'background'>

export const lookPresets: { name: string; patch: LookFields }[] = [
  // Landing look — cold electric blue on near-black night.
  { name: 'Electric Blue', patch: { boltWidth: 1.4, glow: 0.55,
      coreColor: '#eaf3ff', haloColor: '#4a7dff', emberColor: '#ff7a2a', background: '#03040a' } },
  // Deep violet storm.
  { name: 'Violet Storm', patch: { boltWidth: 1.5, glow: 0.65,
      coreColor: '#f4ecff', haloColor: '#9a54ff', emberColor: '#ff4bd0', background: '#06030d' } },
  // Molten plasma — warm core, orange aura.
  { name: 'Plasma Ember', patch: { boltWidth: 1.8, glow: 0.6,
      coreColor: '#fff2d6', haloColor: '#ff8b2e', emberColor: '#c81a10', background: '#0a0402' } },
  // Cold mono — crisp white on charcoal, minimal glow.
  { name: 'Mono White', patch: { boltWidth: 1.2, glow: 0.28,
      coreColor: '#ffffff', haloColor: '#cfe0ff', emberColor: '#8899aa', background: '#08090c' } },
  // High-altitude red sprite — eerie crimson discharge.
  { name: 'Red Sprite', patch: { boltWidth: 1.3, glow: 0.6,
      coreColor: '#ffd9e6', haloColor: '#ff2f5e', emberColor: '#7a1030', background: '#050208' } },
]
