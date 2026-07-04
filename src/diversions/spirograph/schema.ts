import { z } from 'zod'

// Spirograph: an animated pen traces a hypotrochoid / epitrochoid, resolving into
// a symmetric rosette, then fades and reseeds a fresh one — an endless bloom loop.
// One Zod object is the single source of truth for the form, the URL codec, and
// the Config type. Every field carries .meta({ ui, label, ... }).
const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const spirographSchema = z.object({
  // ─── Shape ─────────────────────────────────────────────────────────────────
  R: z.number().int().min(3).max(16).default(7)
    .meta({ section: 'Shape', ui: 'slider', min: 3, max: 16, step: 1, label: 'Fixed gear (R)',
            help: 'Teeth on the big, fixed ring. With the rolling gear it sets how many petals '
                + 'the rosette resolves into (petals = R ÷ gcd(R, r)).' }),
  r: z.number().int().min(2).max(15).default(3)
    .meta({ section: 'Shape', ui: 'slider', min: 2, max: 15, step: 1, label: 'Rolling gear (r)',
            help: 'Teeth on the small gear that rolls around the ring. Keep it below R. '
                + 'Coprime with R gives the fullest, most intricate blooms.' }),
  d: z.number().min(0.1).max(1.4).default(0.75)
    .meta({ section: 'Shape', ui: 'slider', min: 0.1, max: 1.4, step: 0.01, label: 'Pen offset',
            help: 'How far the pen sits from the rolling gear centre, as a fraction of its radius. '
                + 'Low = tight rounded loops; near 1 = sharp cusps; above 1 = petals that loop over.' }),
  mode: z.enum(['inside', 'outside']).default('inside')
    .meta({ section: 'Shape', ui: 'segmented', options: ['inside', 'outside'], label: 'Roll',
            help: 'inside: gear rolls inside the ring (hypotrochoid — star-like blooms). '
                + 'outside: rolls around the outside (epitrochoid — flower-like blooms).' }),
  randomizeEachBloom: z.boolean().default(true)
    .meta({ section: 'Shape', ui: 'toggle', label: 'Random blooms',
            help: 'On: every completed rosette fades and reseeds fresh gears for endless variety. '
                + 'Off: the same rosette (your R / r / offset above) re-traces forever, colour still drifting.' }),

  // ─── Motion ──────────────────────────────────────────────────────────────────
  traceSpeed: z.number().min(0.5).max(8).default(2.6)
    .meta({ section: 'Motion', ui: 'slider', min: 0.5, max: 8, step: 0.1, label: 'Trace speed',
            help: 'How fast the pen draws the curve (radians per second). Low = a slow, meditative '
                + 'unfurl. Frame-rate independent.' }),
  holdSeconds: z.number().min(0).max(8).default(2.5)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 8, step: 0.1, label: 'Hold',
            help: 'How long the finished rosette rests, fully bloomed, before it fades and the next '
                + 'one begins.' }),

  // ─── Style ─────────────────────────────────────────────────────────────────
  penCount: z.number().int().min(1).max(3).default(2)
    .meta({ section: 'Style', ui: 'slider', min: 1, max: 3, step: 1, label: 'Nested pens',
            help: 'Draw 1–3 copies of the rosette, each rotated a little and in its own colour, for '
                + 'a layered, interwoven bloom.' }),
  lineWidth: z.number().min(0.4).max(3).default(1.1)
    .meta({ section: 'Style', ui: 'slider', min: 0.4, max: 3, step: 0.05, label: 'Line width',
            help: 'Stroke thickness in pixels. Thin keeps the dense petals crisp and legible.' }),
  glow: z.number().min(0).max(1).default(0.25)
    .meta({ section: 'Style', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Glow',
            help: 'Soft halo around the line (opaque core keeps the colour from blowing out). '
                + '0 = clean, crisp lines.' }),

  // ─── Color ───────────────────────────────────────────────────────────────────
  colorMode: z.enum(['palette', 'spectrum', 'mono']).default('spectrum')
    .meta({ section: 'Color', ui: 'segmented', options: ['palette', 'spectrum', 'mono'], label: 'Color by',
            help: 'spectrum: hue sweeps along the curve (rainbow rosette) · palette: each pen takes a '
                + 'colour from your list, cycling per bloom · mono: a single ink colour.' }),
  hueRange: z.number().min(20).max(360).default(220)
    .meta({ section: 'Color', ui: 'slider', min: 20, max: 360, step: 5, label: 'Hue spread',
            showWhen: { field: 'colorMode', equals: 'spectrum' },
            help: 'How much of the colour wheel the rainbow sweeps across the curve. Small = tight, '
                + 'analogous; 360 = full spectrum.' }),
  colorDrift: z.number().min(0).max(1).default(0.3)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Color drift',
            help: 'How fast the base hue slowly rotates over time. 0 = fixed colour. Keeps a long '
                + 'session gently evolving.' }),
  palette: z.array(hex6).min(1).max(8)
    .default(['#ff5d8f', '#ffd166', '#5ff0c8', '#5d9cff', '#c58bff'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 1, max: 8,
            showWhen: { field: 'colorMode', equals: 'palette' },
            help: 'Nested pens and successive blooms cycle through these colours.' }),
  fg: hex6.default('#eafaff')
    .meta({ section: 'Color', ui: 'color', label: 'Ink', showWhen: { field: 'colorMode', equals: 'mono' },
            help: 'The single line colour in mono mode.' }),
  background: hex6.default('#05070d')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The ground colour, painted every frame. Dark backgrounds give the most contrast.' }),

  // ─── Advanced ────────────────────────────────────────────────────────────────
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed replays the same sequence of blooms. A fresh visit rolls '
                + 'a new one.' }),
})

export type SpirographConfig = z.infer<typeof spirographSchema>
