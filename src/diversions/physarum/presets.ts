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

export const colorPresets: { name: string; patch: Pick<PhysarumConfig, 'stops'> }[] = [
  { name: 'Bioluminescence', patch: { stops: ['#020814', '#0a3b66', '#1bd6ff', '#eaffff'] } },
  { name: 'Ember', patch: { stops: ['#070302', '#5a1a08', '#ff6a1a', '#ffe7a8'] } },
  { name: 'Mono', patch: { stops: ['#000000', '#3a3a3a', '#dfe6ff', '#ffffff'] } },
]
