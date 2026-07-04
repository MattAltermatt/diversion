import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const hex8 = z.string().regex(/^#[0-9a-fA-F]{8}$/)

// Halo (xscreensaver `halo`, GH #80). Several ring-emitters sit at slowly drifting
// centers; each draws a static family of evenly-spaced concentric circle OUTLINES.
// Where two families overlap, the near-equal spacings beat into moire fringe
// rosettes; the drift keeps the fringes breathing and reorganizing. Calm defaults.
export const haloSchema = z.object({
  emitters: z.number().int().min(2).max(6).default(3)
    .meta({ section: 'Halos', ui: 'slider', min: 2, max: 6, step: 1, label: 'Emitters',
            help: 'How many concentric-ring sources. Two already interfere; more = busier rosettes. Moire needs at least two overlapping.' }),
  ringSpacing: z.number().min(8).max(60).default(22)
    .meta({ section: 'Halos', ui: 'slider', min: 8, max: 60, step: 1, label: 'Ring spacing',
            help: 'Pixels between successive rings in one halo. Tighter spacing beats into denser, finer moire fringes.' }),
  ringCount: z.number().int().min(4).max(50).default(26)
    .meta({ section: 'Halos', ui: 'slider', min: 4, max: 50, step: 1, label: 'Rings per halo',
            help: 'Rings in each halo. More rings = a wider halo that reaches further, so overlaps (and moire) grow.' }),
  lineWidth: z.number().min(0.5).max(3).default(1)
    .meta({ section: 'Halos', ui: 'slider', min: 0.5, max: 3, step: 0.5, label: 'Line width',
            help: 'Ring outline thickness. Thin, crisp lines read the moire best.' }),

  driftSpeed: z.number().min(0).max(30).default(5)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 30, step: 1, label: 'Drift speed',
            help: 'How fast the halo centers wander, pixels per second. 0 = frozen. Slow drift keeps the fringes alive.' }),

  color: z.object({
    mode: z.enum(['spectrum', 'mono']).default('spectrum')
      .meta({ ui: 'segmented', options: ['spectrum', 'mono'], label: 'Mode',
              help: 'Spectrum: each halo a luminous colour, blended into light where rings cross. Mono: one ink drawn XOR-style so crossings cancel into crisp fringes.' }),
    background: hex6.default('#04060b')
      .meta({ ui: 'color', label: 'Background', help: 'The ground colour, painted every frame.' }),
    tints: z.array(hex8).min(1).max(6)
      .default(['#38d9ffcc', '#a479ffcc', '#ff5f9ecc', '#5effbdcc', '#ffd15ecc', '#ff8a4ccc'])
      .meta({ ui: 'colorList', label: 'Halo colours', min: 1, max: 6,
              showWhen: { field: 'mode', equals: 'spectrum' },
              help: 'Each halo takes one of these, cycling by index. Overlaps add into brighter light.' }),
    ink: hex6.default('#9fe7ff')
      .meta({ ui: 'color', label: 'Ink colour',
              showWhen: { field: 'mode', equals: 'mono' },
              help: 'The single ring colour over the background. Crossings cancel toward black — the classic XOR fringe.' }),
    hueDrift: z.number().min(0).max(60).default(4)
      .meta({ ui: 'slider', min: 0, max: 60, step: 1, label: 'Hue drift',
              showWhen: { field: 'mode', equals: 'mono' },
              help: 'Degrees per second the ink hue slides around the wheel. 0 = fixed hue.' }),
  }).default({
    mode: 'spectrum', background: '#04060b',
    tints: ['#38d9ffcc', '#a479ffcc', '#ff5f9ecc', '#5effbdcc', '#ffd15ecc', '#ff8a4ccc'],
    ink: '#9fe7ff', hueDrift: 4,
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),

  seed: z.number().int().default(80)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed places the halo centers and drift directions identically every run. A fresh visit rolls a new one.' }),
})

export type HaloConfig = z.infer<typeof haloSchema>
