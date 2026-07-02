import { z } from 'zod'
import { TERRAIN_TYPES } from './terrain'

export const boxcar2dSchema = z.object({
  population: z.number().int().min(4).max(40).default(8)
    .meta({ section: 'Evolution', ui: 'slider', min: 4, max: 40, step: 1, label: 'Population',
            help: 'Cars per generation. Each runs the track solo, then the fittest breed the next generation.' }),
  eliteCount: z.number().int().min(0).max(8).default(2)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 8, step: 1, label: 'Elites',
            help: 'Top cars copied unchanged into the next generation so the champion is never lost. Keep it well below Population — at or above it the whole generation is carried verbatim and evolution stalls.' }),
  mutationRate: z.number().min(0).max(1).default(0.21)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Mutation rate',
            help: 'Chance each gene drifts when breeding — at generation 1. The rate then cools over the next several generations so good cars stop being shaken apart and start fine-tuning. Low = calm; high = wild early search.' }),
  // Range goes to 51 so the slider's TOP is a distinct ∞ sentinel: 1–50 stay
  // finite ("regen every N gens", so 50 is still expressible), 51 = never regen.
  trackLifespan: z.number().int().min(1).max(51).default(51)
    .meta({ section: 'Evolution', ui: 'slider', min: 1, max: 51, step: 1, label: 'Track lifespan', maxLabel: '∞',
            help: 'Generations before a brand-new track is generated. ∞ (max) = one track, mastered forever.' }),
  mode: z.enum(['distance', 'time']).default('time')
    .meta({ section: 'Evolution', ui: 'segmented', options: ['distance', 'time'], label: 'Mode',
            help: 'Distance = go as far as possible on an endless track. Time = reach the goal as fast as possible.' }),
  goalDistance: z.number().min(50).max(1000).default(500)
    .meta({ section: 'Evolution', ui: 'slider', min: 50, max: 1000, step: 10, label: 'Goal distance (m)',
            help: 'Time mode: where the finish line sits. Cars first evolve to reach it, then to reach it fast.',
            showWhen: { field: 'mode', equals: 'time' } }),
  timeCap: z.number().min(5).max(600).default(180)
    .meta({ section: 'Evolution', ui: 'slider', min: 5, max: 600, step: 5, label: 'Time limit (s)',
            help: 'Time mode: a car that hasn’t reached the goal within this many seconds is culled. Default 180 (3 min), up to 600 (10 min) — generous so steadily-driving cars aren’t cut off.',
            showWhen: { field: 'mode', equals: 'time' } }),
  roughness: z.number().min(0.1).max(1.2).default(0.4)
    .meta({ section: 'Track', ui: 'slider', min: 0.1, max: 1.2, step: 0.05, label: 'Roughness',
            help: 'Hilliness of the terrain. Gentle rolling slopes to rugged climbs. Higher = cars hit walls sooner, so generations turn over faster; very low = good cars can cruise a long way before being culled.' }),
  terrainType: z.enum(TERRAIN_TYPES).default('dunes')
    .meta({ section: 'Track', ui: 'segmented', options: [...TERRAIN_TYPES], label: 'Terrain',
            help: 'Shape of the hills: rolling, big dunes, stepped plateaus, or sharp ridges.' }),
  minProgress: z.number().min(0.2).max(10).default(2)
    .meta({ section: 'Evolution', ui: 'slider', min: 0.2, max: 10, step: 0.1, label: 'Min progress (m)',
            help: 'A car is culled if it fails to gain this much new distance within the progress window — catches cars that are moving but effectively stuck (spinning, backflipping, creeping).' }),
  progressWindow: z.number().min(1).max(20).default(5)
    .meta({ section: 'Evolution', ui: 'slider', min: 1, max: 20, step: 0.5, label: 'Progress window (s)',
            help: 'The time a car has to cover “min progress”. Cover less than that in this many seconds and it dies.' }),
  speed: z.number().int().min(1).max(8).default(1)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 8, step: 1, label: 'Speed',
            help: 'Visual fast-forward — physics steps drawn per frame. Does not change the outcome, only how fast you watch.' }),
  showHud: z.boolean().default(true)
    .meta({ section: 'Display', ui: 'toggle', label: 'Show HUD',
            help: 'Generation, car number, and live progress (distance or time).' }),
  showGhost: z.boolean().default(true)
    .meta({ section: 'Display', ui: 'toggle', label: 'Record-holder ghost',
            help: 'A translucent replay of the fastest car so far, racing alongside the current one — the visual of the time splits. Appears once a car has finished. Time mode only.',
            showWhen: { field: 'mode', equals: 'time' } }),
  showLeaderboard: z.boolean().default(true)
    .meta({ section: 'Display', ui: 'toggle', label: 'Champions panel',
            help: 'A side panel of the top cars this run, drawn as mini-car thumbnails ranked by fitness — a “hall of champions”. The currently-running car is highlighted when it’s one of them (e.g. an elite carried forward). In time mode, finishers show their time and the rest the distance reached.' }),
  color: z.object({
    chassis: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#e76f51').meta({ ui: 'color', label: 'Chassis' }),
    wheel: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#264653').meta({ ui: 'color', label: 'Wheel' }),
    terrain: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3a5a40').meta({ ui: 'color', label: 'Terrain' }),
    sky: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#bde3ec').meta({ ui: 'color', label: 'Sky' }),
  }).default({ chassis: '#e76f51', wheel: '#264653', terrain: '#3a5a40', sky: '#bde3ec' })
    .meta({ section: 'Color', ui: 'group', label: 'Palette' }),
  seed: z.number().int().default(42)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed regenerates the same track and the same evolutionary run. A fresh visit (no share-link) rolls a new one, so every load is a different run.' }),
})

export type BoxCar2DConfig = z.infer<typeof boxcar2dSchema>
