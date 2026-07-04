import { z } from 'zod'

// Colour treatment of the woven bands.
//   single  — every band shares one jewel/metallic colour.
//   rainbow — each separate closed band gets its own hue (great when breaks
//             split the weave into several knots).
export const COLOR_MODES = ['single', 'rainbow'] as const

// Celtic knotwork. One schema drives the config form, the URL codec, AND the
// Config type. The knot geometry is generated deterministically from `seed`
// (a plaited billiard on a checkerboard of crossings) so the same seed always
// weaves the same knot; a shared link is seedless and blossoms a fresh knot
// every visit.
export const celticSchema = z.object({
  // ─── Knot ──────────────────────────────────────────────────────────────────
  gridSize: z.number().int().min(6).max(34).default(14)
    .meta({ section: 'Knot', ui: 'slider', min: 6, max: 34, step: 1, label: 'Grid size',
            help: 'How many crossing points span the width. Small = a few bold, sweeping bands; '
                + 'large = a dense, intricate lattice of fine ribbons.' }),
  wallDensity: z.number().min(0).max(0.45).default(0.12)
    .meta({ section: 'Knot', ui: 'slider', min: 0, max: 0.45, step: 0.01, label: 'Breaks',
            help: 'Fraction of interior crossings turned into a "break" that redirects the bands. '
                + '0 weaves one big plait; more breaks split it into separate, smaller knots.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Knot', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Chooses where the breaks fall. A shared link is seedless — '
                + 'every visit weaves a different knot.' }),

  // ─── Ribbon ────────────────────────────────────────────────────────────────
  bandWidth: z.number().int().min(2).max(24).default(11)
    .meta({ section: 'Ribbon', ui: 'slider', min: 2, max: 24, step: 1, label: 'Band width',
            help: 'Thickness of each woven ribbon. Bands are separated by a dark gap so the '
                + 'over/under interlace reads cleanly.' }),
  cornerRadius: z.number().min(0).max(1).default(0.6)
    .meta({ section: 'Ribbon', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Smoothness',
            help: 'How rounded the turns are where a band reflects off a break or the border. '
                + '0 = sharp mitred corners; 1 = flowing, calligraphic curves.' }),
  glow: z.number().min(0).max(1).default(0.35)
    .meta({ section: 'Ribbon', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Glow',
            help: 'A soft luminous halo around each ribbon. 0 = flat and graphic; higher makes the '
                + 'knot glow against the dark ground.' }),

  // ─── Motion ────────────────────────────────────────────────────────────────
  traceSpeed: z.number().min(0.2).max(3).default(0.7)
    .meta({ section: 'Motion', ui: 'slider', min: 0.2, max: 3, step: 0.05, label: 'Draw-in speed',
            help: 'How fast the knot blossoms into view from the centre. Low = a slow, meditative '
                + 'reveal; high = it snaps in.' }),
  holdSeconds: z.number().int().min(2).max(40).default(11)
    .meta({ section: 'Motion', ui: 'slider', min: 2, max: 40, step: 1, label: 'Hold',
            help: 'Seconds the finished knot rests on screen before it fades and a fresh one '
                + 'is woven — the endless screensaver loop.' }),

  // ─── Color ─────────────────────────────────────────────────────────────────
  colorMode: z.enum(COLOR_MODES).default('single')
    .meta({ section: 'Color', ui: 'segmented', options: [...COLOR_MODES], label: 'Colouring',
            help: 'Single: one colour for the whole weave. Rainbow: each separate closed band '
                + 'gets its own hue (most striking when Breaks split the knot apart).' }),
  band: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f2c14e')
    .meta({ section: 'Color', ui: 'color', label: 'Band',
            help: 'The ribbon colour, used in Single mode.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0a14')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The dark ground. Also the colour of the gaps between crossing bands.' }),
})

export type CelticConfig = z.infer<typeof celticSchema>
