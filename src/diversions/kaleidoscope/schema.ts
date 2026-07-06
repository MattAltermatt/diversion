import { z } from 'zod'

// The named source-shape styles the mixer can draw. 'mixed' assigns each shape
// a random primitive; the rest force a single primitive across the whole source.
export const SHAPE_STYLES = ['mixed', 'shards', 'discs', 'ribbons', 'blobs'] as const

// Curated jewel-tone palettes (opaque #rrggbb — opaque fills keep true hue and
// avoid additive-glow white-out). Each reads richly on a dark ground.
export const PALETTE_NAMES = ['jewel', 'sunset', 'ocean', 'forest', 'candy', 'fire'] as const

export const kaleidoscopeSchema = z.object({
  symmetry: z.number().int().min(3).max(12).default(6)
    .meta({ section: 'Symmetry', ui: 'slider', min: 3, max: 12, step: 1, label: 'Symmetry',
            help: 'Number of mirror pairs. N gives 2N mirrored wedges (6→12, 12→24) tiling the '
                + 'disc. Lower = bold, spacious mandala; higher = an intricate snowflake.' }),
  sourceShapes: z.number().int().min(3).max(20).default(10)
    .meta({ section: 'Source', ui: 'slider', min: 3, max: 20, step: 1, label: 'Source shapes',
            help: 'How many coloured shapes tumble inside the master wedge before it is mirrored '
                + 'around. More shapes = a busier, denser jewel field.' }),
  shapeStyle: z.enum(SHAPE_STYLES).default('mixed')
    .meta({ section: 'Source', ui: 'segmented', options: [...SHAPE_STYLES], label: 'Shape style',
            help: 'What the source shapes are: mixed (a bit of everything), angular shards, round '
                + 'discs, elongated ribbons, or soft organic blobs.' }),
  shapeSize: z.number().min(0.05).max(0.4).default(0.16)
    .meta({ section: 'Source', ui: 'slider', min: 0.05, max: 0.4, step: 0.01, label: 'Shape size',
            help: 'Size of each shape relative to the disc. Bigger shapes overlap into broad '
                + 'stained-glass panes; smaller ones read as scattered gems.' }),
  driftSpeed: z.number().min(0).max(1).default(0.3)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Drift speed',
            help: 'How fast the whole source glides and slowly rotates. 0 freezes it into a still '
                + 'kaleidoscope. Keep it low for a calm, hypnotic drift.' }),
  tumbleSpeed: z.number().min(0).max(1).default(0.3)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Tumble speed',
            help: 'How fast each shape spins on its own axis. 0 = no self-rotation.' }),
  palette: z.enum(PALETTE_NAMES).default('jewel')
    .meta({ section: 'Color', ui: 'segmented', options: [...PALETTE_NAMES], label: 'Palette',
            help: 'The jewel-tone color set the shapes draw from.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#080510')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The dark ground the shards sit on. Darker = more contrast and glow.' }),
  outline: z.boolean().default(true)
    .meta({ section: 'Color', ui: 'toggle', label: 'Leading',
            help: 'Draw dark stained-glass leading around each shape. On = crisp jewel facets; '
                + 'off = soft, blended color washes.' }),
  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed regenerates the same source layout; a fresh visit '
                + 'rolls a new one for a new kaleidoscope every time.' }),
})

export type KaleidoscopeConfig = z.infer<typeof kaleidoscopeSchema>
