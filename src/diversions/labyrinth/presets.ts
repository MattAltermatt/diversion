import type { LabyrinthConfig } from './schema'

type Preset = { name: string; patch: Partial<LabyrinthConfig> }

// Maze complexity + agent count. Structural → update() returns false (full re-setup).
export const densityPresets: Preset[] = [
  { name: 'Open',    patch: { mazeSize: 16, agents: 100000 } },
  { name: 'Classic', patch: { mazeSize: 28, agents: 160000 } },
  { name: 'Dense',   patch: { mazeSize: 44, agents: 280000 } },
]

// The slime's CHARACTER — how it senses, bundles, explores, and heads for the exit,
// plus its pace. (Agents/maze live in the Density axis, so this axis never patches
// them — the two stay independent.) All live-applied → update() returns true.
export const behaviorPresets: Preset[] = [
  { name: 'Veins',
    patch: { sensorAngle: 22.5, sensorDist: 9, turnSpeed: 40, deposit: 0.7, decay: 0.12,
             diffuse: 0.6, exploration: 0.12, goalPull: 0.25, speed: 1 } },
  { name: 'Tendrils', // wandering, branchy, explores hard before committing
    patch: { sensorAngle: 35, sensorDist: 12, turnSpeed: 30, deposit: 0.6, decay: 0.10,
             diffuse: 0.8, exploration: 0.25, goalPull: 0.12, speed: 1 } },
  { name: 'Seeker',   // decisive — beelines down the gradient to the exit
    patch: { sensorAngle: 18, sensorDist: 9, turnSpeed: 50, deposit: 0.8, decay: 0.14,
             diffuse: 0.5, exploration: 0.05, goalPull: 0.55, speed: 1.5 } },
  { name: 'Drift',    // calm, slow, zen
    patch: { sensorAngle: 25, sensorDist: 8, turnSpeed: 35, deposit: 0.7, decay: 0.10,
             diffuse: 0.7, exploration: 0.15, goalPull: 0.25, speed: 0.5 } },
]

// Trail gradient (corridor-dark → slime-bright) + wall + solved-path glow. Each ramp
// rises in perceptual lightness; the wall is a mid-tone readable against the darkest
// stop; the path is a contrasting accent. Live-swap → update() returns true.
export const colorPresets: Preset[] = [
  { name: 'Bioluminescence',
    patch: { stops: ['#020814', '#0a3b66', '#1bd6ff', '#eaffff'], wallColor: '#46597a', pathColor: '#ffd34d' } },
  { name: 'Slime',
    patch: { stops: ['#06150b', '#2f7d22', '#8af23c', '#f0ffd2'], wallColor: '#54663f', pathColor: '#ff4da3' } },
  { name: 'Ember',
    patch: { stops: ['#0a0500', '#7a2a00', '#ff7a18', '#ffe9c2'], wallColor: '#6b513a', pathColor: '#36e0ff' } },
  { name: 'Spore',
    patch: { stops: ['#0c0316', '#5a1a8a', '#d24bff', '#ffd6f4'], wallColor: '#4a3a66', pathColor: '#b6ff3a' } },
  { name: 'Glacier',
    patch: { stops: ['#04101a', '#1a6f8c', '#73dbf2', '#ffffff'], wallColor: '#48607a', pathColor: '#ff9a5c' } },
  { name: 'Inferno',
    patch: { stops: ['#0a021c', '#7d1a64', '#f0613a', '#ffe18c'], wallColor: '#5a4660', pathColor: '#36e6ff' } },
  { name: 'Acid',
    patch: { stops: ['#0c1003', '#647d10', '#ccff32', '#f7ffc6'], wallColor: '#5e6a3c', pathColor: '#9a5cff' } },
  { name: 'Rose',
    patch: { stops: ['#120309', '#7d1f46', '#ff5f8c', '#ffd9e4'], wallColor: '#5a3c4a', pathColor: '#38e0c4' } },
]
