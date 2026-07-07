import { z } from 'zod'

// A cyclic rainbow ramp — colour runs *around* the kaleidoscope and drifts over
// time (the After Dark "oozing" palette-rotation feel). Stops wrap end→start, so
// the last hue blends back into the first. Default "Spectrum"; cooler / warmer
// ramps live in presets.ts.
const DEFAULT_PALETTE = [
  '#ff4d6d', '#ff9e4d', '#ffe14d', '#7bff8a', '#4de1ff', '#4d7bff', '#b14dff', '#ff4de1',
]

export const swirlingMagicSchema = z.object({
  // ── Form ──
  generator: z.enum(['Vortex', 'Web']).default('Vortex')
    .meta({ section: 'Form', ui: 'segmented', options: ['Vortex', 'Web'], label: 'Generator',
            help: 'Vortex — flowing ribbons swept through a shearing whirl, braiding and unwinding '
                + '(the gallery-grade look). Web — a morphing trigonometric line-web mirrored into a '
                + 'star mandala (the faithful After Dark "Rose" homage).' }),
  symmetry: z.number().int().min(2).max(12).default(6)
    .meta({ section: 'Form', ui: 'slider', min: 2, max: 12, step: 1, label: 'Symmetry',
            help: 'How many kaleidoscope arms — the pattern is drawn this many times around the '
                + 'centre.' }),
  mirror: z.boolean().default(true)
    .meta({ section: 'Form', ui: 'toggle', label: 'Mirror',
            help: 'Add a reflected copy of each arm for a true kaleidoscope (twice the images).' }),
  ribbons: z.number().int().min(2).max(8).default(4)
    .meta({ section: 'Form', ui: 'slider', min: 2, max: 8, step: 1, label: 'Ribbons',
            showWhen: { field: 'generator', equals: 'Vortex' },
            help: 'How many ribbons are swept through the whirl. Neighbours counter-rotate, so they '
                + 'cross and braid.' }),
  webPoints: z.number().int().min(48).max(240).default(120)
    .meta({ section: 'Form', ui: 'slider', min: 48, max: 240, step: 4, label: 'Web points',
            showWhen: { field: 'generator', equals: 'Web' },
            help: 'How many vertices the line-web connects — more points, a denser star mandala.' }),
  weave: z.number().int().min(1).max(60).default(5)
    .meta({ section: 'Form', ui: 'slider', min: 1, max: 60, step: 1, label: 'Web weave',
            showWhen: { field: 'generator', equals: 'Web' },
            help: 'How far each chord skips before connecting — the skip sets the star-web envelope.' }),

  // ── Motion ──
  spin: z.number().min(0).max(0.15).default(0.03)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 0.15, step: 0.005, label: 'Spin',
            help: 'How fast the whole mandala turns. The default is ~one revolution every few '
                + 'minutes — a slow hypnotic drift, not a spin.' }),
  swirl: z.number().min(0).max(2.5).default(1.2)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 2.5, step: 0.05, label: 'Swirl',
            showWhen: { field: 'generator', equals: 'Vortex' },
            help: 'How much faster the inner field turns than the rim — the shear that winds each '
                + 'ribbon into a spiral. 0 is a rigid spin; higher winds tighter.' }),
  breathe: z.number().min(10).max(90).default(35)
    .meta({ section: 'Motion', ui: 'slider', min: 10, max: 90, step: 1, label: 'Breathe',
            showWhen: { field: 'generator', equals: 'Vortex' },
            help: 'Seconds for a ribbon to drift in toward the centre and back out — the in/out '
                + 'unwinding pulse.' }),
  morph: z.number().min(0).max(0.25).default(0.06)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 0.25, step: 0.005, label: 'Morph',
            showWhen: { field: 'generator', equals: 'Web' },
            help: 'How fast the web reshapes. Slow is best — the figure slowly breathes between '
                + 'star forms and never quite repeats.' }),

  // ── Trails ──
  trailLength: z.number().min(0.02).max(0.3).default(0.16)
    .meta({ section: 'Trails', ui: 'slider', min: 0.02, max: 0.3, step: 0.01, label: 'Trail fade',
            help: 'How quickly the ghost-smear behind the ribbons fades. Lower leaves longer, dreamier '
                + 'smears (and, at the low end, a faint web of past paths); higher is crisper.' }),
  lineWidth: z.number().min(1).max(6).default(2.5)
    .meta({ section: 'Trails', ui: 'slider', min: 1, max: 6, step: 0.5, label: 'Line width',
            help: 'Thickness of the bright core of each ribbon.' }),
  glowWidth: z.number().min(4).max(24).default(10)
    .meta({ section: 'Trails', ui: 'slider', min: 4, max: 24, step: 1, label: 'Glow width',
            help: 'Width of the soft additive halo around each ribbon.' }),
  glow: z.number().min(0.03).max(0.3).default(0.12)
    .meta({ section: 'Trails', ui: 'slider', min: 0.03, max: 0.3, step: 0.01, label: 'Glow',
            help: 'Brightness of the halo. The bright core keeps its hue at dense crossings while the '
                + 'dim halo blooms — kept low so overlaps glow instead of washing to white.' }),

  // ── Color ──
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(16).default(DEFAULT_PALETTE)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 16, label: 'Palette',
            help: 'The colours the ribbons cycle through, wrapping end→start around the wheel.' }),
  colorCycles: z.number().int().min(1).max(6).default(2)
    .meta({ section: 'Color', ui: 'slider', min: 1, max: 6, step: 1, label: 'Colour cycles',
            help: 'How many full trips through the palette wrap around the mandala.' }),
  hueDrift: z.number().min(0).max(0.05).default(0.008)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 0.05, step: 0.002, label: 'Hue drift',
            help: 'How fast the whole palette rotates over time — the slow colour "ooze".' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05060a')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The dark ground the ribbons glow against — dark for maximum contrast.' }),

  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed starts the swirl the same way. A shared link is '
                + 'seedless — every fresh visit begins a different one.' }),
})

export type SwirlingMagicConfig = z.infer<typeof swirlingMagicSchema>
