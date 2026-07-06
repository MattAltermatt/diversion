import { z } from 'zod'

// Red Queen — host–parasite coevolution (matching-allele model). Two well-mixed
// populations, each a frequency vector over a small set of genotypes on a ring.
// Parasites reproduce best when they match the *common* host genotype; hosts
// reproduce best when they are *rare*. Negative frequency-dependent selection sets
// the allele frequencies chasing each other forever — the signature Red Queen
// oscillation, neither side ever winning. Rendered as a scrolling waterfall: time
// runs left→right, the host band on top and the parasite band below, each genotype
// a coloured stripe whose thickness is its frequency. The same colour means the
// same genotype in both bands, so you watch each parasite stripe chase its host.
// The waterfall is a fixed-size history buffer stretched to fill, so a resize never
// restarts the run.

export const redQueenSchema = z.object({
  genotypeCount: z.number().int().min(4).max(16).default(8)
    .meta({ section: 'Genetics', ui: 'slider', min: 4, max: 16, step: 1, label: 'Genotypes',
            help: 'How many distinct host/parasite types compete. More = finer, busier bands.' }),
  matchBreadth: z.number().int().min(0).max(3).default(1)
    .meta({ section: 'Genetics', ui: 'slider', min: 0, max: 3, step: 1, label: 'Infection breadth',
            help: 'A parasite also infects host genotypes within this ring-distance of its own. '
                + '0 = exact match only (sharpest chase); higher = generalist parasites, softer waves.' }),
  virulence: z.number().min(0.2).max(3).default(1.4)
    .meta({ section: 'Genetics', ui: 'slider', min: 0.2, max: 3, step: 0.05, label: 'Virulence',
            help: 'How much being infected hurts a host’s reproduction. Higher = hosts flee common '
                + 'genotypes harder, so the waves swing wider and faster.' }),
  parasiteSelection: z.number().min(0.2).max(3).default(1.6)
    .meta({ section: 'Genetics', ui: 'slider', min: 0.2, max: 3, step: 0.05, label: 'Parasite pressure',
            help: 'How strongly parasites specialise onto the common host. Higher = a tighter, more '
                + 'relentless chase.' }),
  mutationRate: z.number().min(0.001).max(0.08).default(0.012)
    .meta({ section: 'Genetics', ui: 'slider', min: 0.001, max: 0.08, step: 0.001, label: 'Mutation',
            help: 'A trickle of every genotype each generation, so none goes permanently extinct and '
                + 'the chase never stalls. Too high washes the bands toward flat grey.' }),

  palette: z.enum(['spectrum', 'warm-cool', 'sunset', 'ice']).default('spectrum')
    .meta({ section: 'Look', ui: 'segmented', options: ['spectrum', 'warm-cool', 'sunset', 'ice'], label: 'Palette',
            help: 'The genotype color wheel. Each genotype keeps its color across both bands.' }),
  saturation: z.number().min(0.3).max(1).default(0.72)
    .meta({ section: 'Look', ui: 'slider', min: 0.3, max: 1, step: 0.02, label: 'Saturation',
            help: 'Color intensity of the stripes.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070d')
    .meta({ section: 'Look', ui: 'color', label: 'Background',
            help: 'Shows through as the gap between the host and parasite bands.' }),
  showLabels: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Band labels',
            help: 'Label the host band (top) and parasite band (bottom).' }),

  simSpeed: z.number().min(2).max(60).default(24)
    .meta({ section: 'Sim', ui: 'slider', min: 2, max: 60, step: 1, label: 'Scroll speed',
            help: 'Generations per second — how fast the waterfall flows.' }),

  seed: z.number().int().default(5)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed reproduces the same run. A fresh visit rolls a new one.' }),
})

export type RedQueenConfig = z.infer<typeof redQueenSchema>
