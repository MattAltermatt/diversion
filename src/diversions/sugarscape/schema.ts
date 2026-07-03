import { z } from 'zod'

// Sugarscape — the Epstein–Axtell agent economy. A landscape of two regrowing
// "sugar mountains"; agents with heterogeneous vision + metabolism harvest the
// richest cell they can see, and from those trivial local rules you get migration
// waves, carrying-capacity settling, seasonal tides, and emergent inequality.
// The sim runs on a fixed square grid rendered stretched-to-fill, so resizing
// never restarts the world.

export const sugarscapeSchema = z.object({
  gridResolution: z.number().int().min(40).max(160).default(96)
    .meta({ section: 'World', ui: 'slider', min: 40, max: 160, step: 8, label: 'Grid resolution',
            help: 'Cells per side of the square landscape. Higher = finer mountains and more room.' }),
  regrowthRate: z.number().min(0.1).max(4).default(1)
    .meta({ section: 'World', ui: 'slider', min: 0.1, max: 4, step: 0.1, label: 'Regrowth rate',
            help: 'How fast each cell regrows sugar toward its capacity. Lower = scarcer world, '
                + 'sharper competition.' }),
  seasons: z.boolean().default(true)
    .meta({ section: 'World', ui: 'toggle', label: 'Seasons',
            help: 'On: regrowth swings between the two hemispheres over time, so the population '
                + 'migrates back and forth in tides. Off: a steady world settles at carrying capacity.' }),

  agentCount: z.number().int().min(50).max(2000).default(300)
    .meta({ section: 'Agents', ui: 'slider', min: 50, max: 2000, step: 10, label: 'Population',
            help: 'Starting number of agents. The world finds its own carrying capacity from here.' }),
  visionMax: z.number().int().min(1).max(12).default(6)
    .meta({ section: 'Agents', ui: 'slider', min: 1, max: 12, step: 1, label: 'Vision (max)',
            help: 'Each agent sees a random distance up to this, along the four cardinal directions. '
                + 'Farsighted agents find sugar first.' }),
  metabolismMax: z.number().int().min(1).max(6).default(3)
    .meta({ section: 'Agents', ui: 'slider', min: 1, max: 6, step: 1, label: 'Metabolism (max)',
            help: 'Each agent burns a random amount of sugar per step, up to this. Hungrier agents '
                + 'starve sooner.' }),
  lifespan: z.number().int().min(20).max(240).default(80)
    .meta({ section: 'Agents', ui: 'slider', min: 20, max: 240, step: 5, label: 'Lifespan',
            help: 'Average steps an agent lives before dying of old age (±30%). Turnover keeps the '
                + 'population dynamic instead of pinned at a ceiling. Higher = older, more crowded worlds.' }),
  reproduction: z.boolean().default(true)
    .meta({ section: 'Agents', ui: 'toggle', label: 'Reproduction',
            help: 'On: well-fed agents breed, passing on mutated vision/metabolism, so the world '
                + 'renews itself forever. Off: a fixed cohort lives out its life and dwindles.' }),

  agentColor: z.enum(['wealth', 'vision', 'fixed']).default('wealth')
    .meta({ section: 'Look', ui: 'segmented', options: ['wealth', 'vision', 'fixed'], label: 'Agent color',
            help: 'wealth: poor→rich ramp (see inequality). vision: colored by eyesight. '
                + 'fixed: one color.' }),
  agentSize: z.number().min(0.8).max(4).default(2.2)
    .meta({ section: 'Look', ui: 'slider', min: 0.8, max: 4, step: 0.1, label: 'Agent size',
            help: 'Radius of each agent dot, in pixels.' }),
  softField: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Soft mountains',
            help: 'On: the sugar field is smoothly blurred into glowing hills. Off: crisp cells.' }),
  land: z.object({
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0704')
      .meta({ ui: 'color', label: 'Barren' }),
    low: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#5c3410')
      .meta({ ui: 'color', label: 'Sugar (low)' }),
    high: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffd27a')
      .meta({ ui: 'color', label: 'Sugar (peak)' }),
    agent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#7ff0ff')
      .meta({ ui: 'color', label: 'Agents',
              help: 'Base agent color (the ramp endpoint for wealth/vision modes).' }),
  }).default({ background: '#0a0704', low: '#5c3410', high: '#ffd27a', agent: '#7ff0ff' })
    .meta({ section: 'Look', ui: 'group', label: 'Palette' }),

  simSpeed: z.number().min(1).max(30).default(9)
    .meta({ section: 'Sim', ui: 'slider', min: 1, max: 30, step: 0.5, label: 'Sim speed',
            help: 'World steps per second. Lower is calmer.' }),

  showHud: z.boolean().default(true)
    .meta({ section: 'HUD', ui: 'toggle', label: 'Show readout',
            help: 'Overlay live population and mean wealth.' }),

  seed: z.number().int().default(11)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed reproduces the same world. A fresh visit rolls a new one.' }),
})

export type SugarscapeConfig = z.infer<typeof sugarscapeSchema>

