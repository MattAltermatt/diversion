import type { PresetOption } from '../../framework/types'
import type { LogCirclesConfig } from './schema'

const PALETTE = ['#37d6ffff', '#8a7bffff', '#ff5fa2ff', '#5effc4ff', '#ffd166ff']

// Each Look option patches the whole `color` group (nested group → supplied
// complete; the framework spreads it at the top level). All options share the
// SAME key set so matchPresets flips to "Custom" the moment any field drifts.
export const lookPresets: PresetOption<LogCirclesConfig>[] = [
  {
    name: 'Faithful B/W',
    patch: {
      color: { mode: 'mono', background: '#000000', fg: '#ffffff', tints: PALETTE, scanlines: 0.1, centerDots: true },
    },
  },
  {
    name: 'Neon',
    patch: {
      color: { mode: 'color', background: '#05060a', fg: '#ffffff',
        tints: ['#37d6ffff', '#8a7bffff', '#ff5fa2ff', '#5effc4ff'], scanlines: 0.06, centerDots: true },
    },
  },
  {
    name: 'Sunset',
    patch: {
      color: { mode: 'color', background: '#1a0a14', fg: '#ffffff',
        tints: ['#ff7a59ff', '#ffb15eff', '#ffd166ff', '#ff5fa2ff'], scanlines: 0.08, centerDots: true },
    },
  },
]

export const motionPresets: PresetOption<LogCirclesConfig>[] = [
  { name: 'Calm',     patch: { zoomSpeed: 0.25, rotateSpeed: 0.1,  direction: 'out' } },
  { name: 'Hypnotic', patch: { zoomSpeed: 0.45, rotateSpeed: 0.0,  direction: 'in' } },
  { name: 'Vortex',   patch: { zoomSpeed: 0.5,  rotateSpeed: 0.35, direction: 'out' } },
]
