import type { SquiralConfig } from './schema'

export interface SquiralPreset { name: string; patch: Partial<SquiralConfig> }

// All four share one key-set (count/disorder/handedness/speed/cellSize) so the
// Motion group stays a clean independent axis — see matchPresets' equal-key-set
// assumption in framework/presets.ts.
// Zen-leaning: calm worm counts + low speeds within the dampened ranges
// (count ≤ 60, speed ≤ 120). The default config is even calmer (3 worms,
// speed 10); these presets offer fuller / livelier variety on demand.
export const motionPresets: SquiralPreset[] = [
  { name: 'Zen', patch: { count: 3, disorder: 0, handedness: 0.5, speed: 10, cellSize: 4 } },
  { name: 'Orderly', patch: { count: 12, disorder: 0, handedness: 0, speed: 18, cellSize: 4 } },
  { name: 'Fuller', patch: { count: 40, disorder: 0.005, handedness: 0.5, speed: 40, cellSize: 4 } },
  { name: 'Lively', patch: { count: 60, disorder: 0.03, handedness: 0.5, speed: 90, cellSize: 4 } },
]

// All five share one key-set (background/cycle/cellStyle/color) so the Color
// group stays a clean independent axis — matchPresets assumes equal key-sets
// per group (see framework/presets.ts). Only Neon restyles cells ('ribbon');
// the other four carry cellStyle at its schema default ('square'), preserving
// behavior while keeping the key-set uniform.
export const colorPresets: SquiralPreset[] = [
  { name: 'Ember', patch: {
    background: '#11131a', cycle: false, cellStyle: 'square',
    color: { mode: 'palette', source: 'y',
      colors: ['#e0a458ff', '#c8762fff', '#7c3f1eff', '#9c5a3cff', '#b0402eff'],
      stops: ['#3a4a6bff', '#c8762fff', '#e0a458ff'] } } },
  // Old-school Mariners — royal blue + gold (matches the Flow Field palette and
  // the squiral default).
  { name: 'Mariners', patch: {
    background: '#0b1622', cycle: false, cellStyle: 'square',
    color: { mode: 'palette', source: 'y',
      colors: ['#2a5cf0ff', '#4d9bffff', '#ffc22eff', '#ffe08aff'],
      stops: ['#0b1622ff', '#2a5cf0ff', '#ffe08aff'] } } },
  { name: 'Mono Blueprint', patch: {
    background: '#0a1a2f', cycle: false, cellStyle: 'square',
    color: { mode: 'palette', source: 'y',
      colors: ['#cfe3ffff', '#9fc6f0ff'], stops: ['#0a1a2fff', '#cfe3ffff'] } } },
  { name: 'Pastel', patch: {
    background: '#f4efe4', cycle: false, cellStyle: 'square',
    color: { mode: 'palette', source: 'y',
      colors: ['#e8a6a1ff', '#a7c4bcff', '#dec5a0ff', '#b8a6d9ff', '#9ec1d4ff'],
      stops: ['#e8a6a1ff', '#a7c4bcff', '#dec5a0ff'] } } },
  { name: 'Neon', patch: {
    background: '#08080c', cycle: true, cellStyle: 'ribbon',
    color: { mode: 'gradient', source: 'y',
      colors: ['#ff2bd1ff', '#2bffd5ff', '#fff02bff'],
      stops: ['#ff2bd1ff', '#2bffd5ff', '#fff02bff'] } } },
]
