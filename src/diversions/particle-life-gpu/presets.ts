// presets.ts — declared data, not chrome. Mirrors the CPU Particle Life's two
// independent axes (how the broth MOVES = Feel, how it LOOKS = Look); the GPU schema
// carries the same fields, so the patches are identical. Each option patches a
// consistent key-set within its group (matchPresets assumes equal key-sets per group),
// so picking one flips only its axis and manual edits drop that axis to "Custom".
import type { PresetGroup } from '../../framework/types'
import type { ParticleLifeGpuConfig } from './schema'

export const particleLifeGpuPresets: PresetGroup<ParticleLifeGpuConfig>[] = [
  {
    label: 'Feel',
    options: [
      { name: 'Calm', patch: { forceScale: 0.6, friction: 0.08, beta: 0.32, attractBias: 0.15, symmetry: 'Symmetric' } },
      { name: 'Balanced', patch: { forceScale: 1, friction: 0.04, beta: 0.3, attractBias: 0.1, symmetry: 'Asymmetric' } },
      { name: 'Lively', patch: { forceScale: 1.6, friction: 0.025, beta: 0.28, attractBias: 0.05, symmetry: 'Asymmetric' } },
    ],
  },
  {
    // Structure — the force-curve dimension (#206). Each option pairs a band shape with
    // a feature scale (rMax) that flatters it: the curves barely differ at a small radius,
    // so a wider radius is what makes each regime read. 'Cells' matches the schema defaults
    // so a fresh load maps here cleanly.
    label: 'Structure',
    options: [
      { name: 'Cells', patch: { forceCurve: 'Standard', rMax: 80 } },
      { name: 'Membranes', patch: { forceCurve: 'Smooth', rMax: 110 } },
      { name: 'Continents', patch: { forceCurve: 'Long-range', rMax: 150 } },
      { name: 'Crystals', patch: { forceCurve: 'Stepped', rMax: 120 } },
    ],
  },
  {
    label: 'Look',
    options: [
      { name: 'Mariners', patch: { palette: 'Mariners', background: '#05070d', trailFade: 0.15, glow: true, dotSize: 2.5 } },
      { name: 'Spectrum', patch: { palette: 'Spectrum', background: '#05070d', trailFade: 0.15, glow: true, dotSize: 2.5 } },
      { name: 'Neon Night', patch: { palette: 'Neon', background: '#05070d', trailFade: 0.2, glow: true, dotSize: 2.5 } },
      { name: 'Pastel Dream', patch: { palette: 'Pastel', background: '#0b0a12', trailFade: 0.25, glow: true, dotSize: 3 } },
      { name: 'Ember', patch: { palette: 'Fire', background: '#0a0503', trailFade: 0.18, glow: true, dotSize: 2.5 } },
      { name: 'Ice', patch: { palette: 'Ice', background: '#04070d', trailFade: 0.2, glow: true, dotSize: 2.5 } },
    ],
  },
]
