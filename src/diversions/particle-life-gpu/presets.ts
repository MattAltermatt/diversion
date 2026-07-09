// presets.ts — declared data, not chrome. Two independent axes:
//   • Worlds — WHICH world (the dynamics/identity axis). Every option pins the
//     same 10 keys: 8 dynamics keys plus `count` + `worldSize` (a world declares
//     its own density — #277). The 🎲 Random entries keep matrixSeed:0 (rules
//     follow the rerolling soup seed — these are the old "Feel" presets); the
//     named, curated worlds pin a nonzero matrixSeed (fixed rules) so the same
//     who-chases-whom character grows every visit while the soup rerolls fresh
//     (see the #214 design spec). A curated world is reproducible from
//     matrixSeed ALONE, so no option ever patches the derived `matrix` array.
//   • Look — how it LOOKS (palette/glow/trails). Unchanged; fully orthogonal.
// matchPresets assumes one key-set per group, so picking a world flips only the
// Worlds axis and a manual dynamics edit drops it to "Custom".
import type { PresetGroup } from '../../framework/types'
import type { ParticleLifeGpuConfig } from './schema'

export const particleLifeGpuPresets: PresetGroup<ParticleLifeGpuConfig>[] = [
  {
    label: 'Worlds',
    options: [
      { name: '🎲 Calm',     patch: { count: 8000, worldSize: 1, matrixSeed: 0, colors: 6, symmetry: 'Symmetric',  attractBias: 0.15, forceScale: 0.6, friction: 0.08,  beta: 0.32, rMax: 80 } },
      { name: '🎲 Balanced', patch: { count: 8000, worldSize: 1, matrixSeed: 0, colors: 6, symmetry: 'Asymmetric', attractBias: 0.10, forceScale: 1.0, friction: 0.04,  beta: 0.30, rMax: 80 } },
      { name: '🎲 Lively',   patch: { count: 8000, worldSize: 1, matrixSeed: 0, colors: 6, symmetry: 'Asymmetric', attractBias: 0.05, forceScale: 1.6, friction: 0.025, beta: 0.28, rMax: 80 } },
      // 🎲 Explodey (#277) — high particle count in a big arena, so groupings keep
      // fragmenting into new groupings. Feel-only (matrixSeed 0): rules reroll each visit.
      { name: '🎲 Explodey', patch: { count: 25000, worldSize: 5, matrixSeed: 0, colors: 6, symmetry: 'Asymmetric', attractBias: 0.05, forceScale: 1.25, friction: 0.025, beta: 0.28, rMax: 80 } },
      // Curated worlds (#214) — hand-picked matrixSeeds at the Balanced feel (defaults);
      // matrixSeed pins the who-chases-whom character, the soup seed rerolls each visit.
      { name: 'Tide Pool',     patch: { count: 8000, worldSize: 1, matrixSeed: 1,  colors: 6, symmetry: 'Asymmetric', attractBias: 0.1, forceScale: 1, friction: 0.04, beta: 0.3, rMax: 80 } },
      { name: 'Little Planets', patch: { count: 8000, worldSize: 1, matrixSeed: 4,  colors: 6, symmetry: 'Asymmetric', attractBias: 0.1, forceScale: 1, friction: 0.04, beta: 0.3, rMax: 80 } },
      { name: 'Trilobites',    patch: { count: 8000, worldSize: 1, matrixSeed: 3,  colors: 6, symmetry: 'Asymmetric', attractBias: 0.1, forceScale: 1, friction: 0.04, beta: 0.3, rMax: 80 } },
      { name: 'Starry Night',  patch: { count: 8000, worldSize: 1, matrixSeed: 14, colors: 6, symmetry: 'Asymmetric', attractBias: 0.1, forceScale: 1, friction: 0.04, beta: 0.3, rMax: 80 } },
      { name: 'Terrazzo',      patch: { count: 8000, worldSize: 1, matrixSeed: 12, colors: 6, symmetry: 'Asymmetric', attractBias: 0.1, forceScale: 1, friction: 0.04, beta: 0.3, rMax: 80 } },
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
