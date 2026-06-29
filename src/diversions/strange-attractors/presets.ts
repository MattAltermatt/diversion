import type { StrangeAttractorsConfig } from './schema'

export type AttractorPreset = {
  name: string
  patch: Pick<StrangeAttractorsConfig, 'attractor' | 'seed'>
}

// One signature seed per map. The seed drives rejection-sampled coefficients,
// so these are "known-beautiful discoveries" rather than raw coefficient sets.
export const attractorPresets: AttractorPreset[] = [
  { name: 'Clifford', patch: { attractor: 'clifford', seed: 7 } },
  { name: 'de Jong', patch: { attractor: 'deJong', seed: 7 } },
]

export type ColorPreset = {
  name: string
  background: StrangeAttractorsConfig['background']
  blend: StrangeAttractorsConfig['blend']
  color: StrangeAttractorsConfig['color']
}

export const colorPresets: ColorPreset[] = [
  {
    name: 'Nebula',
    background: '#050810',
    blend: 'lighter',
    color: {
      mode: 'gradient', source: 'radius',
      colors: ['#2a5cf066', '#4d9bff66', '#ffc22e66', '#ffe08a66'],
      stops: ['#3b1a6a66', '#7a3bff66', '#3bd2ff66', '#3bff7a66', '#ffe08a66'],
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
