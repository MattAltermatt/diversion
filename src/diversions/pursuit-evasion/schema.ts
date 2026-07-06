import { z } from 'zod'

// Pursuit-Evasion Arena — neuroevolution predators vs prey. Two populations of
// little steering bodies, each driven by its own tiny neural-net brain (senses the
// nearest opponents → turn + thrust). A round runs for a fixed time; then each
// population breeds independently (elitism + tournament + weight mutation) and a
// fresh round begins. Predators learn to intercept, prey learn to juke, predators
// learn to cut the angle — a Red Queen arms race where neither side wins for long.
// Unlike Flock vs Hunter (evolved *flocking coefficients*), here the behaviour is a
// learned brain: no hand-coded steering rules at all.

export const pursuitEvasionSchema = z.object({
  preyCount: z.number().int().min(8).max(120).default(48)
    .meta({ section: 'Arena', ui: 'slider', min: 8, max: 120, step: 2, label: 'Prey',
            help: 'How many prey share the arena. Constant density — a caught prey respawns elsewhere.' }),
  predatorCount: z.number().int().min(2).max(40).default(9)
    .meta({ section: 'Arena', ui: 'slider', min: 2, max: 40, step: 1, label: 'Predators',
            help: 'How many hunters. Fewer, faster hunters vs a swarm of prey is the classic setup.' }),
  arenaWrap: z.boolean().default(true)
    .meta({ section: 'Arena', ui: 'toggle', label: 'Wrap edges',
            help: 'On: the arena is a torus (creatures that leave one side reappear on the other) — '
                + 'no one gets pinned in a corner. Off: solid walls, and prey learn to wall-hug.' }),

  roundSeconds: z.number().min(5).max(30).default(12)
    .meta({ section: 'Evolution', ui: 'slider', min: 5, max: 30, step: 1, label: 'Round length',
            help: 'Seconds each generation lives before both sides breed. Shorter = faster turnover.' }),
  mutationRate: z.number().min(0.01).max(0.5).default(0.12)
    .meta({ section: 'Evolution', ui: 'slider', min: 0.01, max: 0.5, step: 0.01, label: 'Mutation rate',
            help: 'Fraction of brain weights nudged when breeding. Higher = wilder, faster (messier) '
                + 'evolution.' }),
  eliteFrac: z.number().min(0.05).max(0.5).default(0.2)
    .meta({ section: 'Evolution', ui: 'slider', min: 0.05, max: 0.5, step: 0.05, label: 'Elite fraction',
            help: 'Top share of each population copied unchanged into the next generation — the '
                + 'champions that keep hard-won skill.' }),
  hiddenNeurons: z.number().int().min(3).max(16).default(7)
    .meta({ section: 'Evolution', ui: 'slider', min: 3, max: 16, step: 1, label: 'Brain size',
            help: 'Hidden neurons in each creature’s brain. Bigger brains can learn subtler tactics '
                + 'but evolve slower.' }),
  sensorCount: z.number().int().min(1).max(4).default(2)
    .meta({ section: 'Evolution', ui: 'slider', min: 1, max: 4, step: 1, label: 'Eyes',
            help: 'How many of the nearest opponents each creature can see (bearing + closeness).' }),

  preySpeed: z.number().min(120).max(320).default(210)
    .meta({ section: 'Physics', ui: 'slider', min: 120, max: 320, step: 5, label: 'Prey top speed',
            help: 'Arena units per second. Prey a touch slower than predators must out-manoeuvre, '
                + 'not outrun.' }),
  predatorSpeed: z.number().min(120).max(340).default(225)
    .meta({ section: 'Physics', ui: 'slider', min: 120, max: 340, step: 5, label: 'Predator top speed',
            help: 'A modest edge over the prey makes catches possible only by leading the target, not '
                + 'by brute pace.' }),
  turnRate: z.number().min(2).max(9).default(4.5)
    .meta({ section: 'Physics', ui: 'slider', min: 2, max: 9, step: 0.5, label: 'Turn rate',
            help: 'How sharply creatures can turn (radians/sec). Higher enables tighter jukes.' }),
  catchRadius: z.number().min(8).max(40).default(16)
    .meta({ section: 'Physics', ui: 'slider', min: 8, max: 40, step: 1, label: 'Catch range',
            help: 'How close a predator must get to tag a prey.' }),

  preyColors: z.object({
    slow: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2a6cff')
      .meta({ ui: 'color', label: 'Prey (slow)' }),
    fast: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6ff0ff')
      .meta({ ui: 'color', label: 'Prey (fast)' }),
  }).default({ slow: '#2a6cff', fast: '#6ff0ff' })
    .meta({ section: 'Look', ui: 'group', label: 'Prey colors' }),
  predatorColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff5030')
    .meta({ section: 'Look', ui: 'color', label: 'Predator color' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#080a12')
    .meta({ section: 'Look', ui: 'color', label: 'Background' }),
  trailFade: z.number().min(0).max(0.95).default(0.82)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 0.95, step: 0.01, label: 'Trails',
            help: 'How long motion trails linger (0 = none, high = long comet tails).' }),
  showLeaders: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Mark leaders',
            help: 'Ring the current best hunter and best survivor — the round’s champions.' }),
  showHud: z.boolean().default(true)
    .meta({ section: 'HUD', ui: 'toggle', label: 'Show readout',
            help: 'Overlay generation, populations, and each side’s best score.' }),

  speed: z.number().min(0.25).max(3).default(1)
    .meta({ section: 'Sim', ui: 'slider', min: 0.25, max: 3, step: 0.05, label: 'Sim speed',
            help: 'Time multiplier for the whole arena. Lower is calmer and easier to read.' }),

  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed reproduces the same arms race. A fresh visit rolls a new one.' }),
})

export type PursuitEvasionConfig = z.infer<typeof pursuitEvasionSchema>
