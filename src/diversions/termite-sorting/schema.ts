import { z } from 'zod'

// Termite Sorting — Resnick's termites-and-woodchips, in its multi-color
// Deneubourg form. Blind termites wander a toroidal grid; an isolated chip gets
// picked up, a chip surrounded by its own kind gets dropped beside them. From those
// two local, memoryless rules a scattered mess tidies itself into a few color-sorted
// piles, with no leader and no plan.

export const termiteSortingSchema = z.object({
  gridResolution: z.number().int().min(48).max(200).default(96)
    .meta({ section: 'World', ui: 'slider', min: 48, max: 200, step: 8, label: 'Grid resolution',
            help: 'Cells per side. Higher = finer chips and more room to sort.' }),
  chipDensity: z.number().min(0.05).max(0.6).default(0.28)
    .meta({ section: 'World', ui: 'slider', min: 0.05, max: 0.6, step: 0.01, label: 'Chip density',
            help: 'Fraction of the floor littered with chips. Too dense and there is no room to '
                + 'sort; too sparse and piles never seed.' }),
  colorCount: z.number().int().min(1).max(5).default(3)
    .meta({ section: 'World', ui: 'slider', min: 1, max: 5, step: 1, label: 'Chip colors',
            help: 'How many kinds of chip. With more than one, termites sort them into '
                + 'same-color piles.' }),

  termiteCount: z.number().int().min(20).max(1200).default(650)
    .meta({ section: 'Termites', ui: 'slider', min: 20, max: 1200, step: 10, label: 'Termites',
            help: 'Number of wandering agents. More = faster sorting.' }),
  sameColorBias: z.number().min(0).max(1).default(0.85)
    .meta({ section: 'Termites', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Color sorting',
            help: '0: termites clump all colors into shared piles. 1: they judge only their own '
                + 'color, sorting each into its own pile.' }),
  wanderStrength: z.number().min(0).max(1).default(0.25)
    .meta({ section: 'Termites', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Wander',
            help: 'How often a termite randomly changes heading. 0 = straight runs, 1 = jittery '
                + 'random walk.' }),

  termiteSize: z.number().min(0.6).max(3).default(1.1)
    .meta({ section: 'Look', ui: 'slider', min: 0.6, max: 3, step: 0.1, label: 'Termite size',
            help: 'Radius of each termite dot, in pixels.' }),
  showTermites: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Show termites',
            help: 'Off: hide the agents and watch just the piles reorganize.' }),
  softField: z.boolean().default(false)
    .meta({ section: 'Look', ui: 'toggle', label: 'Soft chips',
            help: 'On: blur the chip field into glowing blobs. Off: crisp cells.' }),
  color: z.object({
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#08090c')
      .meta({ ui: 'color', label: 'Background' }),
    termite: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8b93a6')
      .meta({ ui: 'color', label: 'Termites' }),
    chips: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(5)
      .default(['#ff6b5c', '#ffd34e', '#4ecb8f', '#4ea8ff', '#c77dff'])
      .meta({ ui: 'colorList', label: 'Chip colors', min: 1, max: 5,
              help: 'The palette for the chip types. The first N are used, where N is Chip colors.' }),
  }).default({ background: '#08090c', termite: '#8b93a6', chips: ['#ff6b5c', '#ffd34e', '#4ecb8f', '#4ea8ff', '#c77dff'] })
    .meta({ section: 'Look', ui: 'group', label: 'Palette' }),

  simSpeed: z.number().min(1).max(60).default(20)
    .meta({ section: 'Sim', ui: 'slider', min: 1, max: 60, step: 1, label: 'Sim speed',
            help: 'Termite steps per second. Higher sorts faster.' }),

  showHud: z.boolean().default(true)
    .meta({ section: 'HUD', ui: 'toggle', label: 'Show readout',
            help: 'Overlay the live pile count, ticking down as the mess consolidates.' }),

  seed: z.number().int().default(13)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed reproduces the same scatter. A fresh visit rolls a new one.' }),
})

export type TermiteSortingConfig = z.infer<typeof termiteSortingSchema>
