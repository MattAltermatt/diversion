import type { FlowFieldConfig } from './schema'

// The flow-character fields a Flow preset sets (motion: shape, pace, density,
// ribbon length, thickness). Seed and color are deliberately excluded — the
// 🎲 dice stays independent and color is its own preset axis.
export type FlowFields = Pick<
  FlowFieldConfig,
  | 'noiseScale'
  | 'fieldDrift'
  | 'speed'
  | 'lifespan'
  | 'trailLength'
  | 'particles'
  | 'particleSize'
  | 'fadeTrails'
>

export type FlowPreset = { name: string; flow: FlowFields }

// All presets keep fadeTrails on (trails are core to the look).
export const flowPresets: FlowPreset[] = [
  {
    name: 'Aurora',
    flow: { noiseScale: 0.0022, fieldDrift: 0.16, speed: 0.3, lifespan: 2.2,
            trailLength: 50, particles: 6500, particleSize: 1.6, fadeTrails: true },
  },
  {
    name: 'Maelstrom',
    flow: { noiseScale: 0.013, fieldDrift: 0.45, speed: 0.72, lifespan: 1.0,
            trailLength: 18, particles: 9500, particleSize: 4.0, fadeTrails: true },
  },
  {
    name: 'Wisp',
    flow: { noiseScale: 0.0035, fieldDrift: 0.08, speed: 0.18, lifespan: 4.5,
            trailLength: 28, particles: 2200, particleSize: 3.6, fadeTrails: true },
  },
  {
    name: 'Silk',
    flow: { noiseScale: 0.0014, fieldDrift: 0.05, speed: 0.24, lifespan: 6.5,
            trailLength: 72, particles: 7200, particleSize: 0.8, fadeTrails: true },
  },
  {
    name: 'Filament',
    flow: { noiseScale: 0.006, fieldDrift: 0.0, speed: 0.42, lifespan: 3.0,
            trailLength: 78, particles: 8500, particleSize: 1.0, fadeTrails: true },
  },
  {
    name: 'Slow Fuzz',
    flow: { noiseScale: 0.0014, fieldDrift: 0.71, speed: 0.11, lifespan: 6.5,
            trailLength: 72, particles: 16200, particleSize: 2.6, fadeTrails: true },
  },
]

// ─── Color presets ───────────────────────────────────────────────────────────
// The color axis is independent of flow: a Color preset sets the palette/gradient
// plus the canvas it sits on (background + blend). Motion is the Flow preset's job.
// Every alpha is 0x66 (40%) — high enough that a stroke reads its true color before
// the additive build-up climbs to white. No pure white in any palette (it blows out).
export type ColorFields = Pick<FlowFieldConfig, 'background' | 'blend' | 'color'>
export type ColorPreset = { name: string } & ColorFields

// Unused-axis fallbacks so every preset carries a complete, valid color group:
// palette presets keep the default gradient stops, the gradient preset keeps the
// default palette — so toggling Mode in the form never lands on empty data.
const FALLBACK_COLORS = ['#1e63ff66', '#16d6ff66', '#ff3ea566', '#d6e6ff66']
const FALLBACK_STOPS = ['#ff3b3b66', '#ffd23b66', '#3bff7a66', '#3bd2ff66', '#6a3bff66']

function palette(colors: string[]): FlowFieldConfig['color'] {
  return { mode: 'palette', colors, source: 'flow-angle', stops: FALLBACK_STOPS }
}
function gradient(stops: string[]): FlowFieldConfig['color'] {
  return { mode: 'gradient', colors: FALLBACK_COLORS, source: 'flow-angle', stops }
}

export const colorPresets: ColorPreset[] = [
  { name: 'Nebula', background: '#05060f', blend: 'screen',
    color: palette(['#3a6dff66', '#18d2ff66', '#ff45a866', '#d6e6ff66']) },
  { name: 'Mariners', background: '#050810', blend: 'normal',
    color: palette(['#2a5cf066', '#4d9bff66', '#ffc22e66', '#ffe08a66']) },
  // pyr3 — the fractal-flame renderer's own brand fire: its favicon "hot base"
  // amber→crimson gradient (#ffbe3e → #bf2408) + the #ff8c1a accent, on the
  // attractor-heart black #0a0a0c. A true molten-metal flame ramp.
  { name: 'pyr3', background: '#0a0a0c', blend: 'screen',
    color: palette(['#bf240866', '#ff8c1a66', '#ffbe3e66', '#ffb56e66']) },
  { name: 'Bloom', background: '#0c0408', blend: 'screen',
    color: palette(['#ff5d8f66', '#ff8fb366', '#ff4d6a66', '#ffe0d066']) },
  { name: 'Acid', background: '#02080a', blend: 'screen',
    color: palette(['#39ff1466', '#aaff0066', '#00ffc866', '#d4ff3a66']) },
  { name: 'Mono', background: '#050507', blend: 'screen',
    color: palette(['#e6ebf266', '#a8b3c466', '#5e6a7e66']) },
  { name: 'Spectrum', background: '#06060a', blend: 'screen',
    color: gradient(['#ff4d6a66', '#ffb24d66', '#7cff4d66', '#4dd6ff66', '#9a6bff66']) },
  // Dusk — a second gradient preset (indigo → magenta → warm amber) to give the
  // gradient mode variety beyond Spectrum's full rainbow. No pure white; 0x66 alpha.
  { name: 'Dusk', background: '#06060f', blend: 'screen',
    color: gradient(['#3b2d8f66', '#c43b9a66', '#ff8a3b66']) },
]
