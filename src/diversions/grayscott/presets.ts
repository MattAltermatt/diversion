import type { GrayScottConfig } from './schema'

// Each pattern is a known-good feed/kill pair from Pearson's classification of
// the Gray-Scott manifold (🎚️ starting points, confirm at verify). Diffusion
// (DU/DV) is shared and lives in gl.ts — these two knobs ARE the visual character.
export const patternPresets: { name: string; patch: Pick<GrayScottConfig, 'feed' | 'kill'> }[] = [
  { name: 'Coral',   patch: { feed: 0.0545, kill: 0.0620 } }, // iconic labyrinth
  { name: 'Mitosis', patch: { feed: 0.0367, kill: 0.0649 } }, // cells endlessly divide
  { name: 'Maze',    patch: { feed: 0.0290, kill: 0.0570 } }, // winding corridors
  { name: 'Spots',   patch: { feed: 0.0140, kill: 0.0540 } }, // moving spots / gliders
  { name: 'Worms',   patch: { feed: 0.0260, kill: 0.0510 } }, // worms / fingerprints
]

// V-concentration → color ramps, dark background (empty) → bright core (dense V).
// 6-hex = opaque (no alpha slider). High contrast (UX invariant #5).
export const colorPresets: { name: string; patch: Pick<GrayScottConfig, 'stops'> }[] = [
  { name: 'Deep Coral', patch: { stops: ['#06121f', '#0a4f6e', '#58d8ff'] } },
  { name: 'Ink Bloom',  patch: { stops: ['#f5f1e6', '#6b5b4a', '#14110d'] } },
  { name: 'Magma',      patch: { stops: ['#0a0500', '#b23a00', '#ffd27f'] } },
  { name: 'Bone',       patch: { stops: ['#0c0c10', '#5a5a66', '#f0f0f5'] } },
]
