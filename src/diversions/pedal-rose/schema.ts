import { z } from 'zod'

// Pedal & Rose: a pen slowly traces a polar rhodonea rose r = cos((n/d)·θ) — or the
// PEDAL curve of that rose — resolving into a symmetric mandala, then holds, fades,
// and reseeds a fresh k (and curve type) in an endless bloom loop. One Zod object is
// the single source of truth for the form, the URL codec, and the Config type. Every
// field carries .meta({ ui, label, ... }); sliders always carry min+max+step.
const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const pedalRoseSchema = z.object({
  // ─── Shape ─────────────────────────────────────────────────────────────────
  curveType: z.enum(['rose', 'pedal']).default('rose')
    .meta({ section: 'Shape', ui: 'segmented', options: ['rose', 'pedal'], label: 'Curve',
            help: 'rose: the rhodonea r = cos(k·θ) — clean symmetric petals. '
                + 'pedal: the pedal curve of that rose (feet of perpendiculars from the centre '
                + 'to its tangents) — looping, layered blooms.' }),
  n: z.number().int().min(1).max(12).default(5)
    .meta({ section: 'Shape', ui: 'slider', min: 1, max: 12, step: 1, label: 'Petal count (n)',
            help: 'Numerator of k = n ÷ d. With d = 1 the rose has n petals when n is odd, 2n when '
                + 'n is even.' }),
  d: z.number().int().min(1).max(8).default(1)
    .meta({ section: 'Shape', ui: 'slider', min: 1, max: 8, step: 1, label: 'Denominator (d)',
            help: 'Denominator of k = n ÷ d. Values above 1 give rational roses — many-petalled '
                + 'stars that wind around several times before closing.' }),
  randomizeEachBloom: z.boolean().default(true)
    .meta({ section: 'Shape', ui: 'toggle', label: 'Random blooms',
            help: 'On: every finished bloom fades and reseeds a fresh curve (new k and type) for '
                + 'endless variety. Off: your n / d / type above re-traces forever, colour still drifting.' }),

  // ─── Mandala ─────────────────────────────────────────────────────────────────
  copies: z.number().int().min(1).max(4).default(1)
    .meta({ section: 'Mandala', ui: 'slider', min: 1, max: 4, step: 1, label: 'Copies',
            help: 'Overlay 1–4 rotated copies of the curve, each in its own colour, for a fuller '
                + 'kaleidoscopic mandala.' }),
  rotationOffset: z.number().min(0).max(180).default(30)
    .meta({ section: 'Mandala', ui: 'slider', min: 0, max: 180, step: 1, label: 'Copy rotation',
            help: 'Degrees each successive copy is rotated from the last. Only affects the look when '
                + 'Copies is above 1.' }),

  // ─── Motion ──────────────────────────────────────────────────────────────────
  traceSpeed: z.number().min(0.5).max(8).default(2.4)
    .meta({ section: 'Motion', ui: 'slider', min: 0.5, max: 8, step: 0.1, label: 'Trace speed',
            help: 'How fast the pen draws the curve (radians per second). Low = a slow, meditative '
                + 'unfurl. Frame-rate independent.' }),
  holdSeconds: z.number().min(0).max(8).default(2.5)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 8, step: 0.1, label: 'Hold',
            help: 'How long the finished bloom rests, fully drawn, before it fades and the next begins.' }),

  // ─── Style ─────────────────────────────────────────────────────────────────
  lineWidth: z.number().min(0.4).max(3).default(1.1)
    .meta({ section: 'Style', ui: 'slider', min: 0.4, max: 3, step: 0.05, label: 'Line width',
            help: 'Stroke thickness in pixels. Thin keeps dense petals crisp and legible.' }),
  glow: z.number().min(0).max(1).default(0.3)
    .meta({ section: 'Style', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Glow',
            help: 'Soft luminous halo around the line (an opaque core keeps the colour from blowing '
                + 'out). 0 = clean, crisp lines.' }),

  // ─── Color ───────────────────────────────────────────────────────────────────
  colorMode: z.enum(['spectrum', 'palette', 'mono']).default('spectrum')
    .meta({ section: 'Color', ui: 'segmented', options: ['spectrum', 'palette', 'mono'], label: 'Color by',
            help: 'spectrum: hue sweeps along the curve (rainbow bloom) · palette: each copy takes a '
                + 'colour from your list, cycling per bloom · mono: a single ink colour.' }),
  hueRange: z.number().min(20).max(360).default(200)
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
            help: 'Copies and successive blooms cycle through these colours.' }),
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

export type PedalRoseConfig = z.infer<typeof pedalRoseSchema>
