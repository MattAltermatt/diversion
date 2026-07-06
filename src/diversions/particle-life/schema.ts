// schema.ts — single source of truth (form + URL codec + Config type).
import { z } from 'zod'
import { PALETTE_NAMES } from './palette'

export const particleLifeSchema = z.object({
  count: z.number().int().min(200).max(4000).default(1500)
    .meta({ section: 'Life', ui: 'slider', min: 200, max: 4000, step: 100, label: 'Particles',
            help: 'How many particles fill the field. 1500 stays smooth and reads as a living broth. More = denser, richer structures (and more CPU).' }),
  colors: z.number().int().min(3).max(12).default(6)
    .meta({ section: 'Life', ui: 'slider', min: 3, max: 12, step: 1, label: 'Species',
            help: 'Number of distinct colors. Each species pair has its own attract/repel rule, so more species = a busier ecosystem of relationships.' }),

  rMax: z.number().min(30).max(160).default(80)
    .meta({ section: 'Forces', ui: 'slider', min: 30, max: 160, step: 5, label: 'Interaction radius',
            help: 'How far a particle feels its neighbours (the feature scale). Small = tight grains; large = sweeping continents.' }),
  beta: z.number().min(0.1).max(0.5).default(0.3)
    .meta({ section: 'Forces', ui: 'slider', min: 0.1, max: 0.5, step: 0.01, label: 'Personal space',
            help: 'The inner fraction of the radius that always repels — every particle keeps this much distance. It is why the broth never collapses to a dot; higher = airier.' }),
  forceScale: z.number().min(0.1).max(3).default(1)
    .meta({ section: 'Forces', ui: 'slider', min: 0.1, max: 3, step: 0.05, label: 'Force',
            help: 'Overall strength of attraction and repulsion. Low = a slow, gentle drift; high = snappy, energetic swarms.' }),
  friction: z.number().min(0.01).max(0.2).default(0.04)
    .meta({ section: 'Forces', ui: 'slider', min: 0.01, max: 0.2, step: 0.005, label: 'Glide (s)',
            help: 'Velocity half-life in seconds — how long momentum lingers. Low = crisp, damped moves; high = dreamy, gliding motion.' }),
  symmetry: z.enum(['Asymmetric', 'Symmetric']).default('Asymmetric')
    .meta({ section: 'Forces', ui: 'segmented', options: ['Asymmetric', 'Symmetric'], label: 'Relationships',
            help: 'Asymmetric lets A chase B while B flees A — the source of predators, tails and self-replicating chases. Symmetric makes every pair mutual (calmer, more crystalline).' }),
  attractBias: z.number().min(-1).max(1).default(0.1)
    .meta({ section: 'Forces', ui: 'slider', min: -1, max: 1, step: 0.05, label: 'Attraction bias',
            help: 'Nudges every relationship toward attraction (positive → clumpy cells) or repulsion (negative → skittish gas). 0 = whatever the seed rolled.' }),

  palette: z.enum(PALETTE_NAMES as [string, ...string[]]).default('Mariners')
    .meta({ section: 'Look', ui: 'select', options: [...PALETTE_NAMES], label: 'Palette',
            help: 'Species colors are spaced evenly across this palette for maximum contrast.' }),
  dotSize: z.number().min(1).max(5).default(2.5)
    .meta({ section: 'Look', ui: 'slider', min: 1, max: 5, step: 0.5, label: 'Particle size',
            help: 'Radius of each particle in pixels.' }),
  glow: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Glow',
            help: 'Render soft luminous blobs that bloom where they overlap. Off = crisp flat dots.' }),
  trailFade: z.number().min(0).max(0.6).default(0.15)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 0.6, step: 0.01, label: 'Trail length',
            help: 'How slowly the previous frame fades. Higher = longer, dreamier motion trails. 0 = crisp, no trails.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070d')
    .meta({ section: 'Look', ui: 'color', label: 'Background', help: 'Trails fade toward this color. Dark reads best.' }),

  speed: z.number().min(0.25).max(4).default(1)
    .meta({ section: 'Motion', ui: 'slider', min: 0.25, max: 4, step: 0.25, label: 'Speed',
            help: 'Visual playback speed. Below 1× slows the whole broth into a calm, meditative drift; above 1× fast-forwards. Changes only how fast you watch, never the outcome.' }),

  seed: z.number().int().default(1337)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The seed rolls the whole interaction matrix and the starting soup, so the same seed + settings always replays the same world. A fresh visit rolls a new one.' }),
})

export type ParticleLifeConfig = z.infer<typeof particleLifeSchema>
