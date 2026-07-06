import { z } from 'zod'

// Ant Colony — pheromone foraging (ant-colony-optimization). Two pheromone fields
// per colony diffuse+decay on a fixed grid: SEARCHING ants deposit a "to-home"
// trail as they wander (biased toward the "to-food" trail, so a route already
// found by others gets rediscovered fast); once they touch food they flip to
// RETURNING, deposit a "to-food" trail on the way back (biased toward the
// "to-home" trail + a weak direct pull toward the nest), and flip back to
// SEARCHING at the nest. That two-trail feedback loop is what lets a near-shortest
// nest↔food network self-assemble from purely local rules. An optional second
// colony shares the same food sources — trails interleave and territory forms.

export const antColonySchema = z.object({
  // ── World ──
  gridResolution: z.number().int().min(64).max(220).default(140)
    .meta({ section: 'World', ui: 'slider', min: 64, max: 220, step: 4, label: 'Grid resolution',
            help: 'Cells per side of the pheromone grid. Higher = finer, more detailed trails; '
                + 'heavier to simulate. Changing this restarts the world.' }),
  colonies: z.enum(['1', '2']).default('1')
    .meta({ section: 'World', ui: 'segmented', options: ['1', '2'], label: 'Colonies',
            help: 'One colony forages calmly toward every food source. Two colonies compete for '
                + 'the same food — watch their trails interleave and food get claimed first-come. '
                + 'Changing this restarts the world.' }),
  foodSources: z.number().int().min(1).max(8).default(4)
    .meta({ section: 'World', ui: 'slider', min: 1, max: 8, step: 1, label: 'Food sources',
            help: 'Number of food blobs scattered around the nest(s). Changing this restarts the world.' }),
  foodRegenerates: z.boolean().default(true)
    .meta({ section: 'World', ui: 'toggle', label: 'Food regenerates',
            help: 'On: depleted food slowly refills, so the network keeps running forever. '
                + 'Off: food is finite — once every source is exhausted and its trail fades, '
                + 'the world reseeds fresh.' }),

  // ── Ants ──
  antCount: z.number().int().min(50).max(3000).default(800)
    .meta({ section: 'Ants', ui: 'slider', min: 50, max: 3000, step: 10, label: 'Ant count',
            help: 'Total foragers, split evenly across colonies. Changing this restarts the world.' }),
  antSpeed: z.number().min(0.3).max(3).default(1.2)
    .meta({ section: 'Ants', ui: 'slider', min: 0.3, max: 3, step: 0.1, label: 'Ant speed',
            help: 'Grid cells each ant advances per simulation step.' }),
  sensorAngle: z.number().min(10).max(75).default(35)
    .meta({ section: 'Ants', ui: 'slider', min: 10, max: 75, step: 1, label: 'Sensor angle',
            help: 'Angle of the left/right pheromone sensors off an ant’s heading. Wider = bushier '
                + 'exploration; narrower = straighter, more direct trails.' }),
  sensorDistance: z.number().min(1).max(20).default(6)
    .meta({ section: 'Ants', ui: 'slider', min: 1, max: 20, step: 0.5, label: 'Sensor distance',
            help: 'How far ahead (in grid cells) an ant tastes the pheromone. Longer = coarser, '
                + 'larger-scale routes.' }),
  turnSpeed: z.number().min(5).max(90).default(30)
    .meta({ section: 'Ants', ui: 'slider', min: 5, max: 90, step: 1, label: 'Turn speed',
            help: 'How sharply an ant steers toward the strongest sensed trail each step (degrees).' }),
  jitter: z.number().min(0).max(60).default(28)
    .meta({ section: 'Ants', ui: 'slider', min: 0, max: 60, step: 1, label: 'Jitter',
            help: 'Random wobble added to heading every step (degrees). This is what buys exploration: '
                + 'it lets ants break off the dominant trail and discover new food, so the network '
                + 'branches to several sources instead of locking onto one. Too much drowns out the '
                + 'pheromone signal.' }),
  homingBias: z.number().min(0).max(1).default(0.3)
    .meta({ section: 'Ants', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Homing bias',
            help: 'How strongly a food-carrying ant steers directly toward the nest, on top of '
                + 'following the to-home trail. Higher = ants always find their way back even '
                + 'before a trail exists; lower leans entirely on the pheromone.' }),

  // ── Pheromone ──
  evaporation: z.number().min(0.003).max(0.08).default(0.04)
    .meta({ section: 'Pheromone', ui: 'slider', min: 0.003, max: 0.08, step: 0.001, label: 'Evaporation',
            help: 'Fraction of each trail lost per step — the key lever. Lower = trails persist and '
                + 'sharpen into a durable network; higher = restless, fast-forgetting foraging that '
                + 'never quite commits to one route.' }),
  diffusion: z.number().min(0).max(1).default(0.14)
    .meta({ section: 'Pheromone', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Diffusion',
            help: 'How much each trail blurs into neighbouring cells per step. 0 = crisp, wiry '
                + 'lines; higher = softer, glowing bands (also makes trails easier for ants to find).' }),
  depositAmount: z.number().min(0.1).max(5).default(1.5)
    .meta({ section: 'Pheromone', ui: 'slider', min: 0.1, max: 5, step: 0.1, label: 'Deposit',
            help: 'Pheromone laid by each ant per step. Higher = bolder trails that commit faster.' }),

  // ── Sim ──
  simSpeed: z.number().min(1).max(60).default(30)
    .meta({ section: 'Sim', ui: 'slider', min: 1, max: 60, step: 1, label: 'Sim speed',
            help: 'Simulation steps per second. Lower is calmer.' }),

  // ── Look ──
  showAnts: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Show ants',
            help: 'Draw faint dots for each ant on top of the trail network.' }),
  showHud: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Show readout',
            help: 'Overlay a running count of food foraged per colony.' }),
  palette: z.object({
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070a')
      .meta({ ui: 'color', label: 'Background' }),
    trailA: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#39d7ff')
      .meta({ ui: 'color', label: 'Colony A trail' }),
    nestA: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffe066')
      .meta({ ui: 'color', label: 'Colony A nest' }),
    trailB: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff5c8a')
      .meta({ ui: 'color', label: 'Colony B trail',
              help: 'Only visible with two colonies.' }),
    nestB: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff9f4d')
      .meta({ ui: 'color', label: 'Colony B nest',
              help: 'Only visible with two colonies.' }),
    foodLow: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3a2410')
      .meta({ ui: 'color', label: 'Food (depleted)' }),
    foodHigh: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffb347')
      .meta({ ui: 'color', label: 'Food (abundant)' }),
  }).default({
    background: '#05070a', trailA: '#39d7ff', nestA: '#ffe066',
    trailB: '#ff5c8a', nestB: '#ff9f4d', foodLow: '#3a2410', foodHigh: '#ffb347',
  }).meta({ section: 'Look', ui: 'group', label: 'Palette' }),

  seed: z.number().int().default(13)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed reproduces the same world (nest/food placement + '
                + 'ant starts). A fresh visit rolls a new one.' }),
})

export type AntColonyConfig = z.infer<typeof antColonySchema>
