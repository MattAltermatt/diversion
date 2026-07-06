import { z } from 'zod'

// Chemical Garden — buoyant burst-branching mineral tubes. A stochastic
// recursive tip-walk grows short segments from seed crystals on the floor,
// each tip steered by an upward buoyancy bias + small angle jitter, forking
// at a low per-step branch rate. Growth is REAL-TIME (unlike Vines' precompute-
// then-reveal): tips are advanced a budget of steps per frame, each finished
// segment baked once into an accumulation buffer (see render.ts / DLA). This
// schema is the single source of truth: form + URL + type.
export const chemicalGardenSchema = z.object({
  // ─── Growth ─────────────────────────────────────────────────────────────────
  buoyancy: z.number().min(0).max(1).default(0.6)
    .meta({ section: 'Growth', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Buoyancy',
            help: 'How strongly each tube reaches straight upward. Low = tubes wander and lean; '
                + 'high = tall, ruler-straight plumes racing for the top.' }),
  branchRate: z.number().min(0).max(0.08).default(0.035)
    .meta({ section: 'Growth', ui: 'slider', min: 0, max: 0.08, step: 0.002, label: 'Branch rate',
            help: 'Chance a tube tip forks into two at each growth step. Low = a few tall, isolated '
                + 'plumes; high = a bushy mineral thicket.' }),
  seeds: z.number().int().min(2).max(6).default(5)
    .meta({ section: 'Growth', ui: 'slider', min: 2, max: 6, step: 1, label: 'Crystals',
            help: 'How many seed crystals sprout along the floor, each growing its own mineral plume.' }),
  growthSpeed: z.number().min(20).max(400).default(140)
    .meta({ section: 'Growth', ui: 'slider', min: 20, max: 400, step: 5, label: 'Growth rate',
            help: 'How fast the tubes extrude, in growth steps per second. Low = a slow, meditative bloom.' }),
  wander: z.number().min(0).max(20).default(6)
    .meta({ section: 'Growth', ui: 'slider', min: 0, max: 20, step: 0.5, label: 'Wander',
            help: 'Random degrees of jitter added to every growth step — the osmotic wobble that keeps '
                + 'tubes from growing ruler-straight. 0 = perfectly smooth curves.' }),

  // ─── Render ─────────────────────────────────────────────────────────────────
  lineWidth: z.number().min(4).max(22).default(13)
    .meta({ section: 'Render', ui: 'slider', min: 4, max: 22, step: 0.5, label: 'Tube width',
            help: 'Thickness of the stem at the seed crystal, in pixels. Fat mineral plumes swell here '
                + 'and taper thinner toward the branching tips.' }),
  taper: z.number().min(0.5).max(0.95).default(0.72)
    .meta({ section: 'Render', ui: 'slider', min: 0.5, max: 0.95, step: 0.01, label: 'Taper',
            help: 'How much each branching generation thins. Lower = a strong stem-to-tendril taper.' }),
  glow: z.number().min(0).max(1).default(0.4)
    .meta({ section: 'Render', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Glow',
            help: 'Soft mineral bloom around the tubes, layered over the opaque core so color stays '
                + 'saturated at density. 0 = crisp, matte precipitate.' }),

  // ─── Color ──────────────────────────────────────────────────────────────────
  palette: z.enum(['full', 'copper', 'ironManganese', 'mono']).default('full')
    .meta({ section: 'Color', ui: 'segmented', options: ['full', 'copper', 'ironManganese', 'mono'],
            label: 'Minerals',
            help: 'Which salts seed the garden. full: copper, iron, chrome & manganese all present · '
                + 'copper: cool blue-cyan only · ironManganese: warm rust + purple only · mono: a '
                + 'single salt, freshly picked every visit.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070a')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Canvas color. The garden fades toward this when it reseeds.' }),

  seed: z.number().int().default(3)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. Same seed regrows the same garden. A fresh visit rolls a new one.' }),
})

export type ChemicalGardenConfig = z.infer<typeof chemicalGardenSchema>
