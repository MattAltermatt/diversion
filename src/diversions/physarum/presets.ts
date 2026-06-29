import type { PhysarumConfig } from './schema'

export type BehaviorFields = Pick<
  PhysarumConfig,
  'sensorAngle' | 'sensorDist' | 'turnSpeed' | 'depositAmount' | 'decay' | 'diffuse'
>

// Names describe the verified morphology each regime produces (Chrome-tuned with
// the respawn lifecycle active): Networks = bold cells + reticular fill;
// Coral = dense tangle with radial sunbursts; Veins = dendritic leaf-vein branching.
export const behaviorPresets: { name: string; patch: BehaviorFields }[] = [
  { name: 'Networks',
    patch: { sensorAngle: 22.5, sensorDist: 9, turnSpeed: 22, depositAmount: 1, decay: 0.10, diffuse: 1 } },
  { name: 'Coral',
    patch: { sensorAngle: 45, sensorDist: 4, turnSpeed: 40, depositAmount: 1.4, decay: 0.06, diffuse: 0.8 } },
  { name: 'Veins',
    patch: { sensorAngle: 9, sensorDist: 14, turnSpeed: 14, depositAmount: 0.8, decay: 0.12, diffuse: 0.5 } },
]

// Density → color ramps. Each climbs monotonically in perceptual lightness from a
// near-black background (lowest density) to a luminous tip (densest network), so
// density reads as brightness; the strongest chroma sits in the middle stops.
export const colorPresets: { name: string; patch: Pick<PhysarumConfig, 'stops'> }[] = [
  { name: 'Bioluminescence', patch: { stops: ['#020814', '#0a3b66', '#1bd6ff', '#eaffff'] } },
  { name: 'Ember', patch: { stops: ['#070302', '#5a1a08', '#ff6a1a', '#ffe7a8'] } },
  { name: 'Mono', patch: { stops: ['#000000', '#3a3a3a', '#dfe6ff', '#ffffff'] } },
  // Green phosphor / bioluminescent fungus.
  { name: 'Spore', patch: { stops: ['#04120b', '#0d6b3c', '#43e389', '#e9fff1'] } },
  // Violet → magenta → pale rose; jewel-toned.
  { name: 'Orchid', patch: { stops: ['#0b0518', '#5a1a8f', '#f24fb0', '#ffe6f4'] } },
  // Borealis: blue-black → teal → green → mint (multi-hue cool).
  { name: 'Aurora', patch: { stops: ['#02060f', '#0c5e6e', '#34e0a2', '#eafff2'] } },
  // Two-temperature lava: black → deep violet → orange → warm cream.
  { name: 'Magma', patch: { stops: ['#070209', '#5e1668', '#f0651e', '#fff1c8'] } },
]
