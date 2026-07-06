import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const BLEND_MODES = ['normal', 'multiply', 'screen'] as const
export type BlendMode = (typeof BLEND_MODES)[number]

// Curated Rothko-ish warm color field (opaque hex — translucency comes from the
// Opacity slider, not per-color alpha).
const ROTHKO = ['#8a1c10', '#d4471f', '#e88a2a', '#c9302c', '#f2c14e']

export const cynosureSchema = z.object({
  // ── Composition ──
  rectCount: z.number().int().min(3).max(48).default(16)
    .meta({ section: 'Composition', ui: 'slider', min: 3, max: 48, step: 1, label: 'Rectangles',
            help: 'How many translucent rectangles share the pool at once. Fewer = spacious color '
                + 'blocks; more = a denser, busier overprint.' }),
  sizeMin: z.number().min(0.1).max(1.5).default(0.28)
    .meta({ section: 'Composition', ui: 'slider', min: 0.1, max: 1.5, step: 0.02, label: 'Min size',
            help: 'Smallest rectangle, as a fraction of the shorter screen edge.' }),
  sizeMax: z.number().min(0.1).max(1.5).default(0.9)
    .meta({ section: 'Composition', ui: 'slider', min: 0.1, max: 1.5, step: 0.02, label: 'Max size',
            help: 'Largest rectangle, as a fraction of the shorter screen edge. Above 1 the block '
                + 'spills past the frame into a full color field.' }),
  aspectVar: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Composition', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Aspect variety',
            help: '0 = every rectangle near-square. Higher lets tall and wide proportions appear.' }),

  // ── Motion ──
  driftSpeed: z.number().min(0).max(1).default(0.35)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Drift speed',
            help: 'How fast rectangles wander. 0 = a still composition; low keeps it alive and calm.' }),
  rotate: z.boolean().default(true)
    .meta({ section: 'Motion', ui: 'toggle', label: 'Rotate',
            help: 'Let rectangles slowly turn as they drift.' }),
  lifespan: z.number().min(6).max(90).default(26)
    .meta({ section: 'Motion', ui: 'slider', min: 6, max: 90, step: 1, label: 'Lifespan',
            help: 'Seconds a rectangle lives before it fades out and a fresh one fades in — the pace '
                + 'at which the whole composition recomposes.' }),

  // ── Style ──
  opacity: z.number().min(0.05).max(0.6).default(0.22)
    .meta({ section: 'Style', ui: 'slider', min: 0.05, max: 0.6, step: 0.01, label: 'Opacity',
            help: 'Translucency of each rectangle. Low lets overlaps blend into soft color fields.' }),
  blend: z.enum(BLEND_MODES).default('normal')
    .meta({ section: 'Style', ui: 'segmented', options: BLEND_MODES as unknown as string[], label: 'Blend',
            help: 'Normal: paints layer over layer. Multiply: overlaps deepen (like translucent inks). '
                + 'Screen: overlaps glow brighter (luminous, best on a dark background).' }),
  rounding: z.number().min(0).max(0.5).default(0.05)
    .meta({ section: 'Style', ui: 'slider', min: 0, max: 0.5, step: 0.01, label: 'Corner rounding',
            help: 'Rounds the corners, as a fraction of the rectangle. 0 = hard edges (Rothko/Albers).' }),
  palette: z.array(hex6).min(2).max(8).default(ROTHKO)
    .meta({ section: 'Style', ui: 'colorList', min: 2, max: 8, label: 'Palette',
            help: 'Each rectangle takes one of these at random.' }),
  background: hex6.default('#140a08')
    .meta({ section: 'Style', ui: 'color', label: 'Background',
            help: 'The ground the color fields float on. Repainted every frame.' }),

  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed lays out the same composition. A shared link is seedless '
                + '— every visit composes a new one.' }),
})

export type CynosureConfig = z.infer<typeof cynosureSchema>
