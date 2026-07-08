import type { ThornbirdConfig } from './schema'

export type ShapePreset = {
  name: string
  patch: Pick<ThornbirdConfig, 'paramA' | 'paramC' | 'seed'>
}

// Named parameter sets across the map's two free coefficients. `paramA` sets
// the cosine's angular density (branch count); `paramC` sets how much of the
// two-steps-back point is echoed forward (filament length / looseness).
export const shapePresets: ShapePreset[] = [
  { name: 'Classic Bird', patch: { paramA: 1.99, paramC: 0.80, seed: 7 } }, // the source's own defaults
  { name: 'Tight Thicket', patch: { paramA: 2.15, paramC: 0.92, seed: 13 } },
  { name: 'Loose Wisp', patch: { paramA: 1.55, paramC: 0.55, seed: 29 } },
]

export type ColorPreset = {
  name: string
  background: ThornbirdConfig['background']
  blend: ThornbirdConfig['blend']
  color: ThornbirdConfig['color']
}

export const colorPresets: ColorPreset[] = [
  {
    name: 'Frost',
    background: '#05070f',
    blend: 'lighter',
    color: {
      mode: 'gradient', source: 'radius',
      colors: ['#5ce1ff66', '#8f6cff66', '#ff9ecb66', '#ffe08a66'],
      stops: ['#2a1a5566', '#5c3bd966', '#5ce1ff66', '#9effc766', '#ffe08a66'],
    },
  },
  {
    name: 'Ember',
    background: '#0a0503',
    blend: 'lighter',
    color: {
      mode: 'gradient', source: 'radius',
      colors: ['#ff3b1a66', '#ff8a3b66', '#ffd23b66', '#fff0a866'],
      stops: ['#3b0a0266', '#ff3b1a55', '#ffae3b55', '#ffe7a855'],
    },
  },
  {
    name: 'Mono',
    background: '#000000',
    blend: 'lighter',
    color: {
      mode: 'gradient', source: 'radius',
      colors: ['#ffffff33', '#ffffff66'],
      stops: ['#11224455', '#88aaffaa', '#ffffffcc'],
    },
  },
]
