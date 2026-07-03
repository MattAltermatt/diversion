import type { PresetGroup } from '../../framework/types'
import type { RedQueenConfig } from './schema'

// Dynamics sets the genetics (how many types, how hard the chase); Palette recolours
// the genotype wheel. Each option in a group patches an identical key-set.
export const redQueenPresets: PresetGroup<RedQueenConfig>[] = [
  {
    label: 'Dynamics',
    options: [
      { name: 'Classic chase', patch: { genotypeCount: 8, matchBreadth: 1, virulence: 1.4, parasiteSelection: 1.6, mutationRate: 0.012 } },
      { name: 'Sharp & fast', patch: { genotypeCount: 10, matchBreadth: 0, virulence: 2.2, parasiteSelection: 2.4, mutationRate: 0.008 } },
      { name: 'Gentle tides', patch: { genotypeCount: 6, matchBreadth: 1, virulence: 0.9, parasiteSelection: 1.0, mutationRate: 0.02 } },
      { name: 'Generalists', patch: { genotypeCount: 12, matchBreadth: 2, virulence: 1.6, parasiteSelection: 1.8, mutationRate: 0.012 } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Spectrum', patch: { palette: 'spectrum', saturation: 0.72, background: '#05070d' } },
      { name: 'Warm / cool', patch: { palette: 'warm-cool', saturation: 0.78, background: '#0a0608' } },
      { name: 'Sunset', patch: { palette: 'sunset', saturation: 0.82, background: '#0d0508' } },
      { name: 'Ice', patch: { palette: 'ice', saturation: 0.7, background: '#04080d' } },
    ],
  },
]
