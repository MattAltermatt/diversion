import { z } from 'zod'

// X-Ray Swarm — a clean-room take on Chris Leger's xscreensaver hack
// "xrayswarm" (itself "a shameless ripoff of the 'swarm' screensaver on SGI
// boxes"). Several independent swarms each chase their own invisible,
// slowly-wandering leader; every agent leaves a glowing filament trail behind
// it, and the crossing trails read as an X-ray tangle of luminous ribbons.
const DEFAULT_PALETTE = ['#00eaff', '#38bfff', '#7b5cff', '#c150ff']

export const xraySwarmSchema = z.object({
  // ── Swarm ──
  swarmCount: z.number().int().min(1).max(8).default(6)
    .meta({ section: 'Swarm', ui: 'slider', min: 1, max: 8, step: 1, label: 'Swarms',
            help: 'How many independent swarms roam the canvas, each chasing its own wandering '
                + 'leader and glowing its own colour.' }),
  agentsPerSwarm: z.number().int().min(2).max(24).default(13)
    .meta({ section: 'Swarm', ui: 'slider', min: 2, max: 24, step: 1, label: 'Agents per swarm',
            help: 'How many glowing filaments each swarm contains.' }),

  // ── Motion ──
  speed: z.number().min(30).max(260).default(130)
    .meta({ section: 'Motion', ui: 'slider', min: 30, max: 260, step: 5, label: 'Speed',
            help: 'Top speed of each swarm agent, in pixels per second.' }),
  chaseForce: z.number().min(40).max(500).default(120)
    .meta({ section: 'Motion', ui: 'slider', min: 40, max: 500, step: 5, label: 'Chase strength',
            help: 'How eagerly agents accelerate toward their swarm’s wandering leader. Higher is a '
                + 'tight, snappy follow; lower is loose, lazy drifting.' }),
  leaderSpeed: z.number().min(10).max(120).default(62)
    .meta({ section: 'Motion', ui: 'slider', min: 10, max: 120, step: 5, label: 'Leader wander speed',
            help: 'Top speed of each swarm’s invisible wandering leader — sets the pace the whole '
                + 'swarm dances around. The leader itself is never drawn.' }),
  wobble: z.number().min(0).max(1).default(0.25)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Wobble',
            help: 'Random jitter added to each agent’s follow direction. Higher makes the ribbons '
                + 'weave and cross more chaotically instead of tracking straight in.' }),

  // ── Trails ──
  trailLength: z.number().int().min(10).max(90).default(70)
    .meta({ section: 'Trails', ui: 'slider', min: 10, max: 90, step: 1, label: 'Trail length',
            help: 'How many recent positions each filament remembers — longer trails read as more '
                + 'sinuous ribbons.' }),
  lineWidth: z.number().min(1).max(6).default(2)
    .meta({ section: 'Trails', ui: 'slider', min: 1, max: 6, step: 0.5, label: 'Core width',
            help: 'Thickness of the bright, opaque core of each filament.' }),
  glowWidth: z.number().min(4).max(24).default(10)
    .meta({ section: 'Trails', ui: 'slider', min: 4, max: 24, step: 1, label: 'Glow width',
            help: 'Width of the soft additive halo around each filament.' }),
  glow: z.number().min(0.03).max(0.3).default(0.14)
    .meta({ section: 'Trails', ui: 'slider', min: 0.03, max: 0.3, step: 0.01, label: 'Glow brightness',
            help: 'Brightness of the halo. Kept low so overlapping filaments bloom instead of '
                + 'washing out to white where many ribbons cross.' }),

  // ── Color ──
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(DEFAULT_PALETTE)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Palette',
            help: 'The colours swarms cycle through — each swarm is assigned one hue evenly spaced '
                + 'around this palette, wrapping end→start.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#03050a')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The dark ground the filaments glow against — dark for maximum contrast.' }),

  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed',
            randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed starts every swarm the same way. A shared link is '
                + 'seedless — every fresh visit begins a different one.' }),
})

export type XraySwarmConfig = z.infer<typeof xraySwarmSchema>
