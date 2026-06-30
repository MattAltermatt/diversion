import { z } from 'zod'

export const boxcar2dSchema = z.object({
  population: z.number().int().min(4).max(40).default(16)
    .meta({ section: 'Evolution', ui: 'slider', min: 4, max: 40, step: 1, label: 'Population',
            help: 'Cars per generation. Each runs the track solo, then the fittest breed the next generation.' }),
  eliteCount: z.number().int().min(0).max(8).default(2)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 8, step: 1, label: 'Elites',
            help: 'Top cars copied unchanged into the next generation so the champion is never lost. Keep it well below Population — at or above it the whole generation is carried verbatim and evolution stalls.' }),
  mutationRate: z.number().min(0).max(1).default(0.12)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Mutation rate',
            help: 'Chance each gene drifts when breeding. Low = slow steady improvement; high = wild, jittery search.' }),
  trackLifespan: z.number().int().min(1).max(50).default(12)
    .meta({ section: 'Evolution', ui: 'slider', min: 1, max: 50, step: 1, label: 'Track lifespan',
            help: 'Generations before a brand-new track is generated. Higher = watch a lineage fully master one set of hills.' }),
  roughness: z.number().min(0.1).max(1.2).default(0.8)
    .meta({ section: 'Track', ui: 'slider', min: 0.1, max: 1.2, step: 0.05, label: 'Roughness',
            help: 'Hilliness of the terrain. Gentle rolling slopes to rugged climbs. Higher = cars hit walls sooner, so generations turn over faster; very low = good cars can cruise a long way before being culled.' }),
  minProgress: z.number().min(0.2).max(10).default(2)
    .meta({ section: 'Evolution', ui: 'slider', min: 0.2, max: 10, step: 0.1, label: 'Min progress (m)',
            help: 'A car is culled if it fails to gain this much new distance within the progress window — catches cars that are moving but effectively stuck (spinning, backflipping, creeping).' }),
  progressWindow: z.number().min(1).max(20).default(5)
    .meta({ section: 'Evolution', ui: 'slider', min: 1, max: 20, step: 0.5, label: 'Progress window (s)',
            help: 'The time a car has to cover “min progress”. Cover less than that in this many seconds and it dies.' }),
  speed: z.number().int().min(1).max(8).default(3)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 8, step: 1, label: 'Speed',
            help: 'Visual fast-forward — physics steps drawn per frame. Does not change the outcome, only how fast you watch.' }),
  showHud: z.boolean().default(true)
    .meta({ section: 'Display', ui: 'toggle', label: 'Show HUD',
            help: 'Generation, car number, current and record distance.' }),
  motorTorque: z.number().min(5).max(120).default(40)
    .meta({ section: 'Tuning', ui: 'slider', min: 5, max: 120, step: 1, label: 'Motor torque',
            help: 'Drive strength of the wheels. Too low and cars sit still; too high and they backflip.' }),
  motorSpeed: z.number().min(2).max(30).default(12)
    .meta({ section: 'Tuning', ui: 'slider', min: 2, max: 30, step: 1, label: 'Motor speed',
            help: 'Target wheel spin rate (rad/s).' }),
  color: z.object({
    chassis: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffb703').meta({ ui: 'color', label: 'Chassis' }),
    wheel: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2b2d42').meta({ ui: 'color', label: 'Wheel' }),
    terrain: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2a3b2f').meta({ ui: 'color', label: 'Terrain' }),
    sky: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0e1626').meta({ ui: 'color', label: 'Sky' }),
  }).default({ chassis: '#ffb703', wheel: '#2b2d42', terrain: '#2a3b2f', sky: '#0e1626' })
    .meta({ section: 'Color', ui: 'group', label: 'Palette' }),
  seed: z.number().int().default(42)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed regenerates the same track and the same evolutionary run.' }),
})

export type BoxCar2DConfig = z.infer<typeof boxcar2dSchema>
