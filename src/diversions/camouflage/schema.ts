import { z } from 'zod'

// Evolving Camouflage — a crypsis arms race. Moths perch and flutter on a textured
// background; each carries an evolvable colour. A predator continually picks off the
// moths that stand out most against their local background, and the survivors breed
// (offspring drift near a well-hidden parent, colour mutated). Generation by
// generation the moths sink into the pattern until they nearly vanish — then the
// predator sharpens its eye and the subtlest mismatches start to matter again.
// Neither side wins for long. The background is baked at a fixed resolution and
// stretched to fill, so a resize never restarts the run.

export const camouflageSchema = z.object({
  background: z.enum(['lichen', 'bark', 'seabed', 'night', 'autumn']).default('lichen')
    .meta({ section: 'World', ui: 'segmented', options: ['lichen', 'bark', 'seabed', 'night', 'autumn'], label: 'Background',
            help: 'The habitat the moths must disappear into. Each is a different mottled palette.' }),
  patternScale: z.number().min(1).max(8).default(3.5)
    .meta({ section: 'World', ui: 'slider', min: 1, max: 8, step: 0.1, label: 'Pattern scale',
            help: 'Size of the background blotches. Bigger blotches give the moths large patches to '
                + 'match, so distinct colour lineages settle in each region.' }),

  mothCount: z.number().int().min(40).max(600).default(220)
    .meta({ section: 'Moths', ui: 'slider', min: 40, max: 600, step: 10, label: 'Moths',
            help: 'Population size. A caught moth is instantly replaced by a survivor’s offspring, so '
                + 'the count stays constant.' }),
  mothSize: z.number().min(2).max(9).default(4.5)
    .meta({ section: 'Moths', ui: 'slider', min: 2, max: 9, step: 0.5, label: 'Moth size',
            help: 'Radius of each moth in pixels.' }),
  mutationRate: z.number().min(0.01).max(0.4).default(0.12)
    .meta({ section: 'Moths', ui: 'slider', min: 0.01, max: 0.4, step: 0.01, label: 'Mutation',
            help: 'How far an offspring’s colour drifts from its parent. Higher = faster (rougher) '
                + 'adaptation and more conspicuous mutants to be picked off.' }),
  drift: z.number().min(0).max(1).default(0.35)
    .meta({ section: 'Moths', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Flutter',
            help: 'How much moths wander from their perch. Some flutter keeps the scene alive; too '
                + 'much and a moth strays over a mismatched patch and gets spotted.' }),

  strikeRate: z.number().min(2).max(40).default(14)
    .meta({ section: 'Predator', ui: 'slider', min: 2, max: 40, step: 1, label: 'Strike rate',
            help: 'How often the predator strikes (per second), each time taking the most conspicuous '
                + 'moth it can see. The engine of selection.' }),
  acuityDrive: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Predator', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Eye sharpening',
            help: 'How aggressively the predator’s eye adapts to spot ever-subtler moths as the '
                + 'population blends in. 0 = fixed eye; high = a relentless co-evolving hunter.' }),

  showStrikes: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Show strikes',
            help: 'Flash a ring when the predator takes a moth.' }),
  showHud: z.boolean().default(true)
    .meta({ section: 'HUD', ui: 'toggle', label: 'Show readout',
            help: 'Overlay how well hidden the population is and how sharp the predator’s eye has become.' }),

  simSpeed: z.number().min(0.25).max(3).default(1)
    .meta({ section: 'Sim', ui: 'slider', min: 0.25, max: 3, step: 0.05, label: 'Sim speed',
            help: 'Time multiplier for the whole scene.' }),

  seed: z.number().int().default(9)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed reproduces the same habitat + arms race. A fresh visit rolls a new one.' }),
})

export type CamouflageConfig = z.infer<typeof camouflageSchema>
