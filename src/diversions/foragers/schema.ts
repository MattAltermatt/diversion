import { z } from 'zod'

// Evolving Foragers — the gentlest "watch them get smarter" neuroevolution piece.
// One population of little creatures, each driven by its own tiny neural-net brain
// (senses the nearest food + nearest poison → turn + thrust). A round runs for a
// fixed time; then the whole population breeds (elitism + tournament + weight
// mutation) and a fresh round begins. No adversary, no arms race — just a single
// population visibly getting better at foraging, generation over generation.

export const foragersSchema = z.object({
  creatureCount: z.number().int().min(8).max(150).default(40)
    .meta({ section: 'Population', ui: 'slider', min: 8, max: 150, step: 2, label: 'Creatures',
            help: 'How many foragers share the world. Every one breeds each round — there is no '
                + 'predator to cull them.' }),
  foodCount: z.number().int().min(10).max(200).default(45)
    .meta({ section: 'Population', ui: 'slider', min: 10, max: 200, step: 5, label: 'Food',
            help: 'Green pellets. Eating one adds to fitness and it respawns elsewhere — density '
                + 'stays constant all round.' }),
  poisonCount: z.number().int().min(0).max(120).default(20)
    .meta({ section: 'Population', ui: 'slider', min: 0, max: 120, step: 5, label: 'Poison',
            help: 'Red pellets. Eating one costs fitness and it respawns elsewhere. More poison '
                + 'makes avoidance a bigger part of the puzzle.' }),

  roundSeconds: z.number().min(5).max(30).default(12)
    .meta({ section: 'Evolution', ui: 'slider', min: 5, max: 30, step: 1, label: 'Round length',
            help: 'Seconds each generation forages before the population breeds. Shorter = faster '
                + 'turnover, more visible generational jumps.' }),
  mutationRate: z.number().min(0.01).max(0.5).default(0.12)
    .meta({ section: 'Evolution', ui: 'slider', min: 0.01, max: 0.5, step: 0.01, label: 'Mutation rate',
            help: 'Fraction of brain weights nudged when breeding. Higher = wilder, faster (messier) '
                + 'evolution.' }),
  eliteFrac: z.number().min(0.05).max(0.5).default(0.2)
    .meta({ section: 'Evolution', ui: 'slider', min: 0.05, max: 0.5, step: 0.05, label: 'Elite fraction',
            help: 'Top share of the population copied unchanged into the next generation — the '
                + 'champions that keep hard-won foraging skill.' }),
  hiddenNeurons: z.number().int().min(3).max(16).default(6)
    .meta({ section: 'Evolution', ui: 'slider', min: 3, max: 16, step: 1, label: 'Brain size',
            help: 'Hidden neurons in each creature’s brain. Bigger brains can learn subtler routes '
                + 'but evolve slower.' }),
  sensorCount: z.number().int().min(1).max(4).default(2)
    .meta({ section: 'Evolution', ui: 'slider', min: 1, max: 4, step: 1, label: 'Eyes per kind',
            help: 'How many of the nearest food pellets AND nearest poison pellets each creature can '
                + 'see (bearing + closeness), sensed separately.' }),

  maxSpeed: z.number().min(80).max(300).default(160)
    .meta({ section: 'Physics', ui: 'slider', min: 80, max: 300, step: 5, label: 'Top speed',
            help: 'Arena units per second a forager can reach.' }),
  turnRate: z.number().min(2).max(9).default(4.5)
    .meta({ section: 'Physics', ui: 'slider', min: 2, max: 9, step: 0.5, label: 'Turn rate',
            help: 'How sharply creatures can turn (radians/sec). Higher enables tighter routes '
                + 'around poison.' }),
  eatRadius: z.number().min(6).max(30).default(13)
    .meta({ section: 'Physics', ui: 'slider', min: 6, max: 30, step: 1, label: 'Eat range',
            help: 'How close a creature must get to a pellet to eat it (food or poison).' }),

  creatureColors: z.object({
    slow: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2a6cff')
      .meta({ ui: 'color', label: 'Forager (slow)' }),
    fast: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6ff0ff')
      .meta({ ui: 'color', label: 'Forager (fast)' }),
  }).default({ slow: '#2a6cff', fast: '#6ff0ff' })
    .meta({ section: 'Look', ui: 'group', label: 'Forager colors' }),
  foodColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#5CFF7A')
    .meta({ section: 'Look', ui: 'color', label: 'Food color' }),
  poisonColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff3050')
    .meta({ section: 'Look', ui: 'color', label: 'Poison color' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#080a12')
    .meta({ section: 'Look', ui: 'color', label: 'Background' }),
  trailFade: z.number().min(0).max(0.95).default(0.8)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 0.95, step: 0.01, label: 'Trails',
            help: 'How long motion trails linger (0 = none, high = long comet tails).' }),
  showLeaders: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Mark leader',
            help: 'Ring the current round’s best forager.' }),
  showHud: z.boolean().default(true)
    .meta({ section: 'HUD', ui: 'toggle', label: 'Show readout',
            help: 'Overlay generation, population, best fitness, and food eaten last round.' }),

  speed: z.number().min(0.25).max(3).default(1)
    .meta({ section: 'Sim', ui: 'slider', min: 0.25, max: 3, step: 0.05, label: 'Sim speed',
            help: 'Time multiplier for the whole world. Lower is calmer and easier to read.' }),

  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed reproduces the same population and pellet layout. A '
                + 'fresh visit rolls a new one.' }),
})

export type ForagersConfig = z.infer<typeof foragersSchema>
