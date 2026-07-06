import { z } from 'zod'

// Harmonograph — a mechanical drawing toy: two or more decaying pendulums drive
// a pen in x and y, tracing delicate near-Lissajous rosettes that slowly spiral
// inward as the swings damp out. One Zod schema is the single source of truth
// for the config form, the URL codec, and the Config type.
export const harmonographSchema = z.object({
  pendulums: z.number().int().min(2).max(4).default(2)
    .meta({ section: 'Pendulums', ui: 'slider', min: 2, max: 4, step: 1, label: 'Pendulums',
            help: 'Number of decaying sinusoids summed into each axis. 2 = classic single-loop '
                + 'rosette; 3–4 layer extra harmonics for busier, flower-like figures.' }),
  detune: z.number().min(0).max(0.1).default(0.02)
    .meta({ section: 'Pendulums', ui: 'slider', min: 0, max: 0.1, step: 0.005, label: 'Detune',
            help: 'How far the pendulum frequencies drift off exact whole-number ratios. 0 = a '
                + 'closed Lissajous curve; higher = the figure precesses, sweeping open petals.' }),
  damping: z.number().min(0.004).max(0.08).default(0.02)
    .meta({ section: 'Pendulums', ui: 'slider', min: 0.004, max: 0.08, step: 0.002, label: 'Damping',
            help: 'How quickly the swings decay. Low = a long, slow spiral-in over minutes; high = '
                + 'the figure settles and reseeds sooner.' }),
  speed: z.number().min(0.2).max(6).default(1.5)
    .meta({ section: 'Motion', ui: 'slider', min: 0.2, max: 6, step: 0.1, label: 'Speed',
            help: 'How fast the pen traces the curve. Low and slow is the calm default.' }),
  lineWidth: z.number().min(0.5).max(3).default(1.1)
    .meta({ section: 'Motion', ui: 'slider', min: 0.5, max: 3, step: 0.1, label: 'Line width',
            help: 'Thickness of the bright core stroke, in pixels. Thin reads as a luminous thread.' }),
  glow: z.number().min(0).max(0.3).default(0.12)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 0.3, step: 0.01, label: 'Glow',
            help: 'Opacity of the soft halo drawn under the core, giving each thread a gentle bloom. '
                + '0 = a plain hairline.' }),
  colorMode: z.enum(['spectrum', 'palette']).default('spectrum')
    .meta({ section: 'Color', ui: 'segmented', options: ['spectrum', 'palette'], label: 'Color mode',
            help: 'Spectrum: hue drifts smoothly along the path as it winds. Palette: the path '
                + 'blends through your own list of colors.' }),
  hueSpread: z.number().min(0).max(360).default(140)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 360, step: 10, label: 'Hue spread',
            showWhen: { field: 'colorMode', equals: 'spectrum' },
            help: 'Degrees of hue swept from the first stroke to the last as the figure spirals in.' }),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8)
    .default(['#7cf9ffff', '#4d7bffff', '#c77dffff', '#ff7ad9ff'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Colors', min: 2, max: 8,
            showWhen: { field: 'colorMode', equals: 'palette' },
            help: 'The path blends through these in order as it winds inward.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#070912')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The dark ground the luminous threads are drawn on. Err toward deep and low-key.' }),
  fadeTime: z.number().min(1).max(8).default(3)
    .meta({ section: 'Advanced', ui: 'slider', min: 1, max: 8, step: 0.5, label: 'Fade time',
            help: 'Seconds the settled figure takes to fade out before a fresh one is seeded.' }),
  seed: z.number().int().default(4207)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed regenerates the same sequence of figures. A fresh '
                + 'visit rolls a new one.' }),
})

export type HarmonographConfig = z.infer<typeof harmonographSchema>
