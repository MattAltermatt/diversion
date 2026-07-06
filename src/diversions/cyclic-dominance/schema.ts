import { z } from 'zod'

// Cyclic Dominance — the Reichenbach–Mobilia–Frey lattice model of spatial
// rock-paper-scissors. Species A eats B, B eats C, C eats A. A toroidal grid
// of Monte Carlo interactions — predation, reproduction into empty space, and
// mobility (swap two neighbouring cells) — churns the three species around each
// other into large, slowly-curling wavefronts of stable coexistence: no species
// ever wins, the boundaries just chase each other forever. Reproduction runs
// ahead of predation so empties refill fast (clean domains, not speckle), and
// mobility sets the domain scale — too high washes it into noise, too low
// freezes it into small static fragments. The grid is a fixed square rendered
// stretched-to-fill, so a resize never restarts the world.

export const cyclicDominanceSchema = z.object({
  gridResolution: z.number().int().min(60).max(220).default(150)
    .meta({ section: 'World', ui: 'slider', min: 60, max: 220, step: 10, label: 'Grid resolution',
            help: 'Cells per side of the square world. Higher = more room for domains to form, '
                + 'at some sim cost.' }),

  mobility: z.number().min(0).max(0.9).default(0.12)
    .meta({ section: 'Rates', ui: 'slider', min: 0, max: 0.9, step: 0.01, label: 'Mobility (mixing)',
            help: 'How often a random interaction is a plain swap instead of predation/reproduction. '
                + 'This sets the domain scale: low freezes it into small static fragments, the sweet '
                + 'spot grows big slowly-curling wavefronts, too high washes everything into flat '
                + 'noise with no structure at all.' }),
  predationRate: z.number().min(0.05).max(1).default(0.34)
    .meta({ section: 'Rates', ui: 'slider', min: 0.05, max: 1, step: 0.01, label: 'Predation',
            help: 'Weight of "eat the prey" interactions, relative to reproduction and mobility '
                + '(all three are normalized to sum to 1 before each draw).' }),
  reproductionRate: z.number().min(0.05).max(1).default(0.54)
    .meta({ section: 'Rates', ui: 'slider', min: 0.05, max: 1, step: 0.01, label: 'Reproduction',
            help: 'Weight of "spread into empty space" interactions, relative to predation and '
                + 'mobility. Kept ahead of predation so empties refill fast and the domains read '
                + 'clean instead of speckled.' }),

  colors: z.object({
    a: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff4136')
      .meta({ ui: 'color', label: 'Species A (eats B)' }),
    b: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2ecc40')
      .meta({ ui: 'color', label: 'Species B (eats C)' }),
    c: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0074d9')
      .meta({ ui: 'color', label: 'Species C (eats A)' }),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0a0f')
      .meta({ ui: 'color', label: 'Empty' }),
  }).default({ a: '#ff4136', b: '#2ecc40', c: '#0074d9', background: '#0a0a0f' })
    .meta({ section: 'Color', ui: 'group', label: 'Species colors' }),

  simSpeed: z.number().min(1).max(30).default(10)
    .meta({ section: 'Sim', ui: 'slider', min: 1, max: 30, step: 0.5, label: 'Sim speed',
            help: 'Full lattice sweeps per second. Lower is calmer, and lets a spiral\'s slow '
                + 'rotation actually read.' }),

  showHud: z.boolean().default(true)
    .meta({ section: 'HUD', ui: 'toggle', label: 'Show readout',
            help: 'Overlay the current population fraction of each species.' }),

  seed: z.number().int().default(5)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed reproduces the same world. A fresh visit rolls a new one.' }),
})

export type CyclicDominanceConfig = z.infer<typeof cyclicDominanceSchema>
