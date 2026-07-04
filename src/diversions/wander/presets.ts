import type { PresetOption } from '../../framework/types'
import type { WanderConfig } from './schema'

// Palette group — each shares one key-set (colors + background) so the axis stays
// clean for matchPresets' equal-key-set assumption (framework/presets.ts).
export const palettePresets: PresetOption<WanderConfig>[] = [
  { name: 'Aurora', patch: {
    colors: ['#2ee6c0', '#3aa0ff', '#8a5cff', '#ff5ca8', '#ffc24d'], background: '#060a12' } },
  { name: 'Ember', patch: {
    colors: ['#ffce7a', '#ffa64d', '#ff6b3d', '#c8322e', '#7a1f3a'], background: '#0c0606' } },
  { name: 'Ocean', patch: {
    colors: ['#9bf6ff', '#4dd2ff', '#2a7fe0', '#2a3fb0', '#6ad1a8'], background: '#04101a' } },
  { name: 'Rainbow', patch: {
    colors: ['#ff5c5c', '#ffb14d', '#ffe14d', '#5cff8a', '#4dd2ff', '#8a5cff'], background: '#07070c' } },
  { name: 'Mono Cyan', patch: {
    colors: ['#0a2233', '#2aa0c8', '#9bf0ff'], background: '#03080d' } },
]

// Motion group — each shares one key-set (turnLever + stepSize + speed) so the
// smooth↔jagged axis stays independent of colour.
export const motionPresets: PresetOption<WanderConfig>[] = [
  { name: 'Zen Drift', patch: { turnLever: 0.18, stepSize: 3, speed: 45 } },
  { name: 'Meander', patch: { turnLever: 0.28, stepSize: 3, speed: 60 } },
  { name: 'Restless', patch: { turnLever: 0.55, stepSize: 4, speed: 110 } },
  { name: 'Frenetic', patch: { turnLever: 0.9, stepSize: 5, speed: 170 } },
]
