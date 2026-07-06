// schema.ts — single source of truth (form + URL codec + Config type) for EVOLUTIONARY
// Swarm Chemistry. The broth never settles: every particle owns a genome that transmits +
// mutates on collision. `recipe` only SEEDS the initial genome soup; evolution takes over.
// Colour is emergent from each particle's genome (no palette), so there is no colorList.
import { z } from 'zod'
import { SEED_NAMES } from './recipes'
import { COMPETITIONS } from './pack'

export const swarmChemistrySchema = z.object({
  recipe: z.enum(SEED_NAMES).default('Primordial Soup')
    .meta({ section: 'Start', ui: 'select', options: [...SEED_NAMES], label: 'Seed population',
            help: 'What the broth STARTS as. "Primordial Soup" seeds fully random genomes and lets evolution build order from nothing; a named recipe seeds Sayama\'s species mix as a head start. Either way, once running the recipes transmit and mutate on their own.' }),

  count: z.number().int().min(300).max(10000).default(3500)
    .meta({ section: 'Swarm', ui: 'slider', min: 300, max: 10000, step: 100, label: 'Particles',
            help: 'Total particles. The coupling is all-pairs, so the GPU works hardest here — 3500 stays smooth and dense enough for structures to compete.' }),

  evolve: z.boolean().default(true)
    .meta({ section: 'Evolution', ui: 'toggle', label: 'Evolve',
            help: 'On: colliding particles transmit and mutate recipes, so the broth perpetually reorganises — the living, never-settling mode. Off: genomes freeze and you watch the current mix play out (static Swarm Chemistry).' }),
  competition: z.enum(COMPETITIONS).default('Majority')
    .meta({ section: 'Evolution', ui: 'segmented', options: [...COMPETITIONS], label: 'Who wins',
            help: 'When two particles collide, which one\'s recipe spreads. Majority = the one with more same-type neighbours (Sayama\'s most open-ended). Denser = more crowded. Faster / Slower = by speed.' }),
  mutationRate: z.number().min(0).max(0.5).default(0.14)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 0.5, step: 0.01, label: 'Mutation',
            help: 'Chance each gene is nudged when a recipe is copied. 0 = recipes only spread, never change (settles). Higher = more novelty, more churn — the broth keeps reinventing itself.' }),

  speed: z.number().min(0.01).max(2).default(0.3)
    .meta({ section: 'Motion', ui: 'slider', min: 0.01, max: 2, step: 0.01, label: 'Speed',
            help: 'Playback speed. Both motion AND colour are interpolated between evolutionary steps, so low values are a smooth meditative creep (not a strobe); 0.01 is a near-still drift. Above 1× fast-forwards the evolution.' }),

  colorBoost: z.number().min(0.5).max(2).default(1.2)
    .meta({ section: 'Color', ui: 'slider', min: 0.5, max: 2, step: 0.05, label: 'Color intensity',
            help: 'Colour comes from each particle\'s genome (cohesion→red, alignment→green, separation→blue), so it shifts as recipes evolve. This lifts saturation/brightness.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070d')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Trails fade toward this colour. Dark reads best (invariant: err toward contrast).' }),

  dotSize: z.number().min(1).max(6).default(2.5)
    .meta({ section: 'Look', ui: 'slider', min: 1, max: 6, step: 0.5, label: 'Particle size',
            help: 'Radius of each particle in pixels.' }),
  glow: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Glow',
            help: 'Soft luminous blobs that bloom where a cell packs tight. Off = crisp flat dots.' }),
  trailFade: z.number().min(0).max(0.6).default(0.14)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 0.6, step: 0.01, label: 'Trail length',
            help: 'How slowly the previous frame fades. Higher = longer, dreamier motion trails. 0 = crisp, no trails.' }),
  bloom: z.boolean().default(false)
    .meta({ section: 'Look', ui: 'toggle', label: 'Bloom',
            help: 'A soft film-bloom post pass over the whole frame. Lush but costs a little GPU — off by default.' }),

  collisionRadius: z.number().min(2).max(40).default(14)
    .meta({ section: 'Advanced', collapsed: true, ui: 'slider', min: 2, max: 40, step: 1, label: 'Collision radius',
            help: 'How close two particles must be (sim units) to transmit a recipe. Bigger = recipes spread faster and dominate sooner.' }),
  simThreshold: z.number().min(0.02).max(0.3).default(0.08)
    .meta({ section: 'Advanced', ui: 'slider', min: 0.02, max: 0.3, step: 0.01, label: 'Same-type width',
            help: 'How similar two genomes count as the "same type" for the Majority rule. Wider = coarser species boundaries.' }),
  worldMin: z.number().int().min(350).max(1000).default(600)
    .meta({ section: 'Advanced', ui: 'slider', min: 350, max: 1000, step: 50, label: 'Arena size',
            help: 'Short side of the field in sim units (Sayama\'s recipes are tuned near ~500). Smaller = denser, more compressed; larger = roomier.' }),
  seed: z.number().int().default(1337)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Rolls the starting positions and genomes, so the same seed STARTS the same world. A fresh visit rolls a new one.' }),
})

export type SwarmChemistryConfig = z.infer<typeof swarmChemistrySchema>
