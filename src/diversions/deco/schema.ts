import { z } from 'zod'

export const SPLITS = ['Golden', 'Halve', 'Mixed'] as const

// Fill palette (De Stijl / Mondrian by default); each cell picks one at random.
const DE_STIJL = ['#f4f0e6', '#e02128', '#0b5ac0', '#f7c700', '#1a1a1e']

export const decoSchema = z.object({
  // ── Composition ──
  depth: z.number().int().min(3).max(8).default(6)
    .meta({ section: 'Composition', ui: 'slider', min: 3, max: 8, step: 1, label: 'Depth',
            help: 'How many times rectangles may subdivide — deeper makes a finer, busier mosaic.' }),
  split: z.enum(SPLITS).default('Golden')
    .meta({ section: 'Composition', ui: 'segmented', options: SPLITS as unknown as string[], label: 'Split',
            help: 'How each rectangle is cut: Golden ratio (art-deco proportion), clean Halves, '
                + 'or Mixed random cuts.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Composition', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Sets the whole subdivision. A shared link is seedless — every '
                + 'visit composes a different one.' }),
  // ── Motion ──
  speed: z.number().min(0.2).max(4).default(1.2)
    .meta({ section: 'Motion', ui: 'slider', min: 0.2, max: 4, step: 0.1, label: 'Build speed',
            help: 'How fast the composition subdivides into place, depth by depth.' }),
  hold: z.number().min(1).max(20).default(5)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 20, step: 0.5, label: 'Hold',
            help: 'Seconds to hold the finished composition before it dissolves and rebuilds.' }),
  // ── Style ──
  borderWidth: z.number().int().min(0).max(16).default(5)
    .meta({ section: 'Style', ui: 'slider', min: 0, max: 16, step: 1, label: 'Border',
            help: 'Thickness of the gaps framing each rectangle.' }),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(DE_STIJL)
    .meta({ section: 'Style', ui: 'colorList', min: 2, max: 8, label: 'Fill colors',
            help: 'Each rectangle is filled with one of these at random.' }),
  border: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0c0c10')
    .meta({ section: 'Style', ui: 'color', label: 'Border color' }),
})

export type DecoConfig = z.infer<typeof decoSchema>
