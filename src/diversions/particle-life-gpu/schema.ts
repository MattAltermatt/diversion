// schema.ts — single source of truth (form + URL codec + Config type) for the
// WebGPU variant of Particle Life. Mirrors the CPU diversion's controls 1:1 so a
// viewer feels at home, with two deliberate differences:
//   • `count` reaches far higher — the whole point of the GPU port (the sim runs
//     as a compute shader, so tens of thousands of particles stay smooth).
//   • the `seed` help is honest about the GPU determinism tradeoff (see gpu.ts):
//     the seed still picks the exact STARTING world (CPU-seeded + uploaded), but
//     the per-step GPU evolution can drift slightly by device.
import { z } from 'zod'
import { PALETTE_NAMES } from '../particle-life/palette'
import { buildMatrix } from '../particle-life/matrix'
import { FORCE_CURVES } from '../particle-life/force'

export const particleLifeGpuSchema = z.object({
  count: z.number().int().min(500).max(25000).default(8000)
    .meta({ section: 'Life', ui: 'slider', min: 500, max: 25000, step: 500, label: 'Particles',
            help: 'How many particles fill the field. The GPU compute sim holds many thousands smoothly — far past the CPU version. Pair a high count with a bigger World size so the arena has room; 8000 stays buttery anywhere.' }),
  colors: z.number().int().min(3).max(12).default(6)
    .meta({ section: 'Life', ui: 'slider', min: 3, max: 12, step: 1, label: 'Species',
            help: 'Number of distinct colors. Each species pair has its own attract/repel rule, so more species = a busier ecosystem of relationships.' }),
  worldSize: z.number().min(1).max(8).default(1)
    .meta({ section: 'Life', ui: 'slider', min: 1, max: 8, step: 0.5, label: 'World size',
            help: 'How large the toroidal arena is (× the base). Bigger = more room for structures to spread out at the same particle count (lower density). Pair it with Particles to set the crowding. Scroll to zoom, drag to pan around the arena; double-click resets the view.' }),

  rMax: z.number().min(30).max(160).default(80)
    .meta({ section: 'Forces', ui: 'slider', min: 30, max: 160, step: 5, label: 'Interaction radius',
            help: 'How far a particle feels its neighbours (the feature scale). Small = tight grains; large = sweeping continents.' }),
  beta: z.number().min(0.1).max(0.5).default(0.3)
    .meta({ section: 'Forces', ui: 'slider', min: 0.1, max: 0.5, step: 0.01, label: 'Personal space',
            help: 'The inner fraction of the radius that always repels — every particle keeps this much distance. It is why the broth never collapses to a dot; higher = airier.' }),
  forceScale: z.number().min(0.1).max(3).default(1)
    .meta({ section: 'Forces', ui: 'slider', min: 0.1, max: 3, step: 0.05, label: 'Force',
            help: 'Overall strength of attraction and repulsion. Low = a slow, gentle drift; high = snappy, energetic swarms.' }),
  forceCurve: z.enum(FORCE_CURVES).default('Standard')
    .meta({ section: 'Forces', ui: 'segmented', options: [...FORCE_CURVES], label: 'Force curve',
            help: 'The SHAPE of the pull/push between particles (same personal-space core, so nothing collapses). Standard = classic cells; Smooth = gooier, membrane-like blobs; Long-range = a long attraction tail → sweeping continents; Stepped = quantized bands → crisp, crystalline shells. Changes how structure emerges, not just the look.' }),
  friction: z.number().min(0.01).max(0.2).default(0.04)
    .meta({ section: 'Forces', ui: 'slider', min: 0.01, max: 0.2, step: 0.005, label: 'Glide (s)',
            help: 'Velocity half-life in seconds — how long momentum lingers. Low = crisp, damped moves; high = dreamy, gliding motion.' }),
  symmetry: z.enum(['Asymmetric', 'Symmetric']).default('Asymmetric')
    .meta({ section: 'Forces', ui: 'segmented', options: ['Asymmetric', 'Symmetric'], label: 'Relationships',
            help: 'Asymmetric lets A chase B while B flees A — the source of predators, tails and self-replicating chases. Symmetric makes every pair mutual (calmer, more crystalline).' }),
  attractBias: z.number().min(-1).max(1).default(0.1)
    .meta({ section: 'Forces', ui: 'slider', min: -1, max: 1, step: 0.05, label: 'Attraction bias',
            help: 'Nudges every relationship toward attraction (positive → clumpy cells) or repulsion (negative → skittish gas). 0 = whatever the seed rolled.' }),
  matrix: z.array(z.number().min(-1).max(1)).optional()
    .meta({ section: 'Forces', ui: 'matrix', label: 'Interaction matrix',
            help: 'Per-species attract/repel table. Drag cells to hand-tune relationships; Reset to seed re-rolls it. Changing Matrix seed (or Seed while it follows), or Species, rebuilds it.',
            deriveFrom: (c: { colors: number; seed: number; matrixSeed: number; symmetry: 'Asymmetric' | 'Symmetric'; attractBias: number }) =>
              [...buildMatrix(c.colors, c.matrixSeed || c.seed, c.symmetry, c.attractBias)] }),

  palette: z.enum(PALETTE_NAMES as [string, ...string[]]).default('Mariners')
    .meta({ section: 'Look', ui: 'select', options: [...PALETTE_NAMES], label: 'Palette',
            help: 'Species colors are spaced evenly across this palette for maximum contrast.' }),
  dotSize: z.number().min(1).max(5).default(2.5)
    .meta({ section: 'Look', ui: 'slider', min: 1, max: 5, step: 0.5, label: 'Particle size',
            help: 'Radius of each particle in pixels.' }),
  glow: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Glow',
            help: 'Render soft luminous blobs that bloom where they overlap. Off = crisp flat dots.' }),
  trailFade: z.number().min(0).max(0.6).default(0.15)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 0.6, step: 0.01, label: 'Trail length',
            help: 'How slowly the previous frame fades. Higher = longer, dreamier motion trails. 0 = crisp, no trails.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070d')
    .meta({ section: 'Look', ui: 'color', label: 'Background', help: 'Trails fade toward this color. Dark reads best.' }),

  speed: z.number().min(0.02).max(4).default(1)
    .meta({ section: 'Motion', ui: 'slider', min: 0.02, max: 4, step: 0.02, label: 'Speed',
            help: 'Visual playback speed. Far below 1× slows the whole broth into a barely-creeping, meditative drift; above 1× fast-forwards. The GPU has headroom to spare, so even the slowest settings stay smooth.' }),
  breathe: z.boolean().default(false)
    .meta({ section: 'Motion', ui: 'toggle', label: 'Breathe',
            help: 'A slow rhythmic swell of the overall force — the whole broth’s motion gently surges and eases over tens of seconds, like breathing. Off by default; the classic look is unchanged.' }),
  breathePeriod: z.number().min(4).max(90).default(16)
    .meta({ section: 'Motion', ui: 'slider', min: 4, max: 90, step: 1, label: 'Breath length (s)',
            help: 'Seconds per full swell-and-ease, measured in sim time so Speed scales it coherently. Longer = a calmer, more meditative rhythm; past ~40s it gets hard to notice. Only matters while Breathe is on.' }),
  breatheDepth: z.number().min(0).max(0.8).default(0.4)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 0.8, step: 0.05, label: 'Breath depth',
            help: 'How far the force swings each breath — 0 is imperceptible, high makes the whole broth visibly surge and settle. Only matters while Breathe is on.' }),

  seed: z.number().int().default(1337)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer, rolling the STARTING SOUP — where every particle begins and which species it is. With Matrix seed left at 0 it also rolls the relationship rules, so one seed = one whole world (a fresh visit rolls a new one). Its GPU-simulated evolution can drift slightly between graphics cards.' }),
  matrixSeed: z.number().int().default(0)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Matrix seed',
            help: 'Rolls the interaction MATRIX — the hidden table of who-chases-whom — independently of the soup. 0 = follow the Seed (the default: one seed rolls everything). Set any other integer to rewrite every relationship while keeping the current soup, or to A/B one arrangement under different rules. A shared link keeps this value, so you can share a ruleset that reseeds its soup each visit.' }),
})

export type ParticleLifeGpuConfig = z.infer<typeof particleLifeGpuSchema>
