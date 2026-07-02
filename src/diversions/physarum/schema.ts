import { z } from 'zod'

// Density → color ramp. Default: Bioluminescence (deep-blue → cyan → white).
const BIOLUM = ['#020814', '#0a3b66', '#1bd6ff', '#eaffff']

export const physarumSchema = z.object({
  // ── Behavior ──
  sensorAngle: z.number().min(5).max(60).default(22.5)
    .meta({ section: 'Behavior', ui: 'slider', min: 5, max: 60, step: 0.5, label: 'Sensor angle',
            help: 'Angle of the left/right sensors off an agent’s heading. Wider = bushier, '
                + 'more branching; narrower = straighter filaments.' }),
  sensorDist: z.number().min(1).max(30).default(9)
    .meta({ section: 'Behavior', ui: 'slider', min: 1, max: 30, step: 0.5, label: 'Sensor distance',
            help: 'How far ahead (in trail texels) agents taste the pheromone. Longer = '
                + 'coarser, larger-scale networks.' }),
  turnSpeed: z.number().min(5).max(90).default(22)
    .meta({ section: 'Behavior', ui: 'slider', min: 5, max: 90, step: 1, label: 'Turn speed',
            help: 'How sharply an agent steers toward the strongest trail each step (degrees). '
                + 'Higher = twitchier, tighter turns.' }),
  depositAmount: z.number().min(0.1).max(5).default(1)
    .meta({ section: 'Behavior', ui: 'slider', min: 0.1, max: 5, step: 0.1, label: 'Deposit',
            help: 'Trail laid by each agent per step. Higher = bolder, brighter networks.' }),
  // Min is a small positive floor, not 0: the diffuse box-blur conserves energy, so
  // ×(1−decay) is the field's only sink. At decay 0 the half-float trail grows
  // unbounded to the R16F ceiling and saturates to flat white over a long run.
  decay: z.number().min(0.005).max(0.3).default(0.1)
    .meta({ section: 'Behavior', ui: 'slider', min: 0.005, max: 0.3, step: 0.005, label: 'Decay',
            help: 'Fraction of the trail field lost each step. Higher = faster-fading, '
                + 'more restless networks; lower = persistent, slowly-built structure.' }),
  diffuse: z.number().min(0).max(1).default(1)
    .meta({ section: 'Behavior', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Diffuse',
            help: 'How much the trail spreads (blurs) into neighbours each step. 0 = sharp, '
                + 'wiry; 1 = soft, smoky.' }),
  // ── Simulation ──
  agents: z.number().int().min(10000).max(1000000).default(1000000)
    .meta({ section: 'Simulation', ui: 'slider', min: 10000, max: 1000000, step: 10000,
            label: 'Agents',
            help: 'Number of slime agents. More = denser, more intricate networks. '
                + 'Changing this restarts the simulation.' }),
  speed: z.number().min(0.1).max(3).default(0.5)
    .meta({ section: 'Simulation', ui: 'slider', min: 0.1, max: 3, step: 0.05, label: 'Speed',
            help: 'How fast the network evolves, in simulation steps per frame. '
                + 'Below 1 runs a step every few frames for a calm, slow drift '
                + '(0.1 ≈ a step every 10 frames); above 1 runs several steps per '
                + 'frame for faster growth.' }),
  seed: z.number().int().default(7)
    .meta({ section: 'Simulation', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed always starts agents the same way. '
                + 'A fresh visit rolls a new one to grow a different organism.' }),
  // ── Color ──
  stops: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(BIOLUM)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Density colors',
            help: 'Trail density maps along these colors — the lowest is the background, '
                + 'the highest is where networks are densest.' }),
})

export type PhysarumConfig = z.infer<typeof physarumSchema>
