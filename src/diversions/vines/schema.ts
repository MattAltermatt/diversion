import { z } from 'zod'

// Vines — L-system tendrils. One axiom + production rules expanded N times, then
// interpreted by a turtle into a tree of segments. The full geometry is computed
// ONCE per world (deterministic from seed) and revealed progressively so the vine
// appears to climb and branch, then settles, fades, and reseeds — an endless zen
// screensaver loop. This schema is the single source of truth: form + URL + type.
//
// SPECIES rule sets live in lsystem.ts; this enum just names them.
export const vinesSchema = z.object({
  // ─── Growth (structure + reveal) ────────────────────────────────────────────
  species: z.enum(['bush', 'fern', 'tree', 'willow']).default('bush')
    .meta({ section: 'Growth', ui: 'segmented', options: ['bush', 'fern', 'tree', 'willow'],
            label: 'Species',
            help: 'Which L-system production rules grow the plant. '
                + 'bush: dense climbing tendrils · fern: feathery fronds · '
                + 'tree: open sympodial branching · willow: fine drooping sprays.' }),
  iterations: z.number().int().min(2).max(6).default(4)
    .meta({ section: 'Growth', ui: 'slider', min: 2, max: 6, step: 1, label: 'Detail (iterations)',
            help: 'How many times the rules are expanded. Higher = more branches and finer '
                + 'twigs (grows exponentially — capped for performance).' }),
  growthSpeed: z.number().min(20).max(400).default(90)
    .meta({ section: 'Growth', ui: 'slider', min: 20, max: 400, step: 5, label: 'Climb speed',
            help: 'How fast the growth front climbs, in screen pixels per second. '
                + 'Low = a slow, meditative unfurl.' }),
  seedPoints: z.number().int().min(1).max(5).default(3)
    .meta({ section: 'Growth', ui: 'slider', min: 1, max: 5, step: 1, label: 'Stems',
            help: 'How many independent vines sprout along the bottom edge and climb together.' }),

  // ─── Form (the turtle) ───────────────────────────────────────────────────────
  branchAngle: z.number().min(8).max(48).default(24)
    .meta({ section: 'Form', ui: 'slider', min: 8, max: 48, step: 1, label: 'Branch angle',
            help: 'Degrees turned at each fork. Narrow = tall and reaching; wide = spreading, '
                + 'shrub-like.' }),
  angleJitter: z.number().min(0).max(24).default(7)
    .meta({ section: 'Form', ui: 'slider', min: 0, max: 24, step: 0.5, label: 'Wander',
            help: 'Random degrees added to each step and fork, so tendrils curl and wave '
                + 'organically instead of drawing a rigid fractal. 0 = perfectly geometric.' }),
  lengthDecay: z.number().min(0.6).max(1).default(0.86)
    .meta({ section: 'Form', ui: 'slider', min: 0.6, max: 1, step: 0.01, label: 'Taper (length)',
            help: 'How much shorter each deeper branch level grows. Below 1 the twigs get '
                + 'progressively stubbier toward the tips.' }),
  sway: z.number().min(0).max(1).default(0.35)
    .meta({ section: 'Form', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Breeze',
            help: 'Gentle swaying of the whole clump, as if in a soft breeze. 0 = perfectly still.' }),

  // ─── Render ────────────────────────────────────────────────────────────────
  lineWidth: z.number().min(0.5).max(5).default(2.4)
    .meta({ section: 'Render', ui: 'slider', min: 0.5, max: 5, step: 0.1, label: 'Stem width',
            help: 'Thickness of the main stem in pixels. Twigs taper thinner from here.' }),
  taper: z.number().min(0.5).max(0.95).default(0.74)
    .meta({ section: 'Render', ui: 'slider', min: 0.5, max: 0.95, step: 0.01, label: 'Taper (width)',
            help: 'How much each deeper branch level thins. Lower = a strong stem-to-hair taper.' }),
  buds: z.boolean().default(true)
    .meta({ section: 'Render', ui: 'toggle', label: 'Buds',
            help: 'Draw a soft dot at each branch tip once it finishes growing.' }),
  budSize: z.number().min(1).max(8).default(3)
    .meta({ section: 'Render', ui: 'slider', min: 1, max: 8, step: 0.5, label: 'Bud size',
            help: 'Radius of the tip buds in pixels (no effect when Buds is off).' }),
  glow: z.number().min(0).max(1).default(0.25)
    .meta({ section: 'Render', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Glow',
            help: 'Soft bloom around the strokes. 0 = crisp botanical ink.' }),

  // ─── Color ───────────────────────────────────────────────────────────────
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#060a08')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Canvas color. The vine fades toward this when it reseeds.' }),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(8)
    .default(['#153a20', '#2f7d3f', '#7ac74f', '#e9f7bf'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 1, max: 8,
            help: 'Ordered stem → tip. The base of the vine uses the first color, the growing '
                + 'tips the last.' }),

  seed: z.number().int().default(3)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Same seed regrows the same vine. A fresh visit rolls a new one.' }),
})

export type VinesConfig = z.infer<typeof vinesSchema>
