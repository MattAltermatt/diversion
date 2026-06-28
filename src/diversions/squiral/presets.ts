import type { SquiralConfig } from './schema'

export interface SquiralPreset { name: string; patch: Partial<SquiralConfig> }

// All four share one key-set (count/disorder/handedness/speed/cellSize) so the
// Motion group stays a clean independent axis — see matchPresets' equal-key-set
// assumption in framework/presets.ts.
export const motionPresets: SquiralPreset[] = [
  { name: 'Classic', patch: { count: 120, disorder: 0.005, handedness: 0.5, speed: 120, cellSize: 4 } },
  { name: 'Orderly', patch: { count: 80, disorder: 0, handedness: 0, speed: 100, cellSize: 4 } },
  { name: 'Chaotic', patch: { count: 200, disorder: 0.03, handedness: 0.5, speed: 200, cellSize: 4 } },
  { name: 'Sparse', patch: { count: 24, disorder: 0.003, handedness: 0.5, speed: 80, cellSize: 7 } },
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
  { name: 'Mariners', patch: {
    background: '#0b1622', cycle: false, cellStyle: 'square',
    color: { mode: 'palette', source: 'y',
      colors: ['#2e6f8eff', '#3a4a6bff', '#5fa8a0ff', '#cfe3dcff', '#274060ff'],
      stops: ['#0b1622ff', '#2e6f8eff', '#cfe3dcff'] } } },
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
