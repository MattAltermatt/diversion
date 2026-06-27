import type { GravityWellsConfig } from './schema'

// The motion fields a Motion preset sets: base flow + well dynamics + trails.
// `seed` and color are deliberately excluded — the 🎲 dice and color stay on
// their own axes.
export type MotionFields = Pick<
  GravityWellsConfig,
  | 'particles'
  | 'particleSize'
  | 'noiseScale'
  | 'fieldDrift'
  | 'gravityInfluence'
  | 'swirl'
  | 'speed'
  | 'maxWells'
  | 'wellLifespan'
  | 'forceMin'
  | 'forceMax'
  | 'fadeTrails'
  | 'trailLength'
>

export type MotionPreset = { name: string; motion: MotionFields }

// All keep fadeTrails on (trails are core to the look) and forceMin 0.1.
// Vortex carries the exact shipped schema defaults so the picker reads "Vortex"
// on load. Spread across the swirl axis (0 = drain → 1 = whirlpool).
export const motionPresets: MotionPreset[] = [
  {
    name: 'Vortex',
    motion: { particles: 10600, particleSize: 1.6, noiseScale: 0.0016, fieldDrift: 0.35,
              gravityInfluence: 1.6, swirl: 1, speed: 0.2, maxWells: 5, wellLifespan: 60,
              forceMin: 0.1, forceMax: 1.5, fadeTrails: true, trailLength: 95 },
  },
  {
    name: 'Maelstrom',
    motion: { particles: 9000, particleSize: 2.2, noiseScale: 0.004, fieldDrift: 0.6,
              gravityInfluence: 2, swirl: 0.9, speed: 0.5, maxWells: 8, wellLifespan: 25,
              forceMin: 0.1, forceMax: 1.8, fadeTrails: true, trailLength: 60 },
  },
  {
    name: 'Drain',
    motion: { particles: 9000, particleSize: 1.4, noiseScale: 0.0016, fieldDrift: 0.2,
              gravityInfluence: 1.8, swirl: 0, speed: 0.25, maxWells: 6, wellLifespan: 40,
              forceMin: 0.1, forceMax: 1.6, fadeTrails: true, trailLength: 85 },
  },
  {
    name: 'Spiral',
    motion: { particles: 10000, particleSize: 1.6, noiseScale: 0.002, fieldDrift: 0.4,
              gravityInfluence: 1.6, swirl: 0.55, speed: 0.3, maxWells: 5, wellLifespan: 45,
              forceMin: 0.1, forceMax: 1.5, fadeTrails: true, trailLength: 90 },
  },
  {
    name: 'Drift',
    motion: { particles: 7000, particleSize: 2.4, noiseScale: 0.0012, fieldDrift: 0.15,
              gravityInfluence: 0.8, swirl: 0.7, speed: 0.15, maxWells: 4, wellLifespan: 60,
              forceMin: 0.1, forceMax: 1.2, fadeTrails: true, trailLength: 80 },
  },
  {
    name: 'Galaxy',
    motion: { particles: 14000, particleSize: 1, noiseScale: 0.0008, fieldDrift: 0.25,
              gravityInfluence: 1.4, swirl: 0.95, speed: 0.18, maxWells: 10, wellLifespan: 50,
              forceMin: 0.1, forceMax: 1.3, fadeTrails: true, trailLength: 95 },
  },
]

// ─── Color presets ───────────────────────────────────────────────────────────
// A Color preset sets background + blend + the whole color group. All 0xaa alpha
// (Gravity Wells convention — long trails + lighten blend keep hue, no white-out).
// Tide carries the exact shipped color defaults so the picker reads "Tide" on
// load. Fallbacks equal the schema defaults so palette↔gradient toggling never
// lands on empty data (and Tide deep-equals the default color group).
export type ColorFields = Pick<GravityWellsConfig, 'background' | 'blend' | 'color'>
export type ColorPreset = { name: string } & ColorFields

const FALLBACK_COLORS = ['#3bd2ffaa', '#4d9bffaa', '#ffd23baa', '#ff7a3baa']
const FALLBACK_STOPS = ['#1b3a8aaa', '#3bd2ffaa', '#ffd23baa', '#ff3b3baa']

function palette(colors: string[]): GravityWellsConfig['color'] {
  return { mode: 'palette', colors, source: 'flow-angle', stops: FALLBACK_STOPS }
}
function gradient(
  stops: string[],
  source: GravityWellsConfig['color']['source'] = 'flow-angle',
): GravityWellsConfig['color'] {
  return { mode: 'gradient', colors: FALLBACK_COLORS, source, stops }
}

export const colorPresets: ColorPreset[] = [
  { name: 'Tide', background: '#05060f', blend: 'lighten',
    color: palette(['#3bd2ffaa', '#4d9bffaa', '#ffd23baa', '#ff7a3baa']) },
  { name: 'Nebula', background: '#05060f', blend: 'screen',
    color: palette(['#3a6dffaa', '#18d2ffaa', '#ff45a8aa', '#d6e6ffaa']) },
  { name: 'Ember', background: '#0a0a0c', blend: 'lighten',
    color: palette(['#bf2408aa', '#ff8c1aaa', '#ffbe3eaa', '#ffb56eaa']) },
  { name: 'Acid', background: '#02080a', blend: 'lighten',
    color: palette(['#39ff14aa', '#aaff00aa', '#00ffc8aa', '#d4ff3aaa']) },
  { name: 'Mono', background: '#050507', blend: 'lighten',
    color: palette(['#e6ebf2aa', '#a8b3c4aa', '#5e6a7eaa']) },
  { name: 'Spectrum', background: '#06060a', blend: 'lighten',
    color: gradient(['#ff4d6aaa', '#ffb24daa', '#7cff4daa', '#4dd6ffaa', '#9a6bffaa']) },
  { name: 'Field Heat', background: '#06060f', blend: 'lighten',
    color: gradient(['#1b3a8aaa', '#3bd2ffaa', '#ffd23baa', '#ff3b3baa'], 'field') },
]
