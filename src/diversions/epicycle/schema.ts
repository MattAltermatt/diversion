import { z } from 'zod'

// Epicycle — Ptolemaic roulettes / Fourier epicycles. A chain of N nested rotating
// arms (vectors); arm k has a radius and an integer angular frequency, and pivots on
// the tip of the previous. The pen at the final tip traces a closed roulette curve as
// the arms turn. One Zod object is the single source of truth for the config form, the
// URL codec, and the Config type. Every field carries .meta({ ui, label, ... }).
const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const epicycleSchema = z.object({
  // ─── Arms ────────────────────────────────────────────────────────────────────
  armCount: z.number().int().min(2).max(6).default(4)
    .meta({ section: 'Arms', ui: 'slider', min: 2, max: 6, step: 1, label: 'Arms',
            help: 'Number of nested rotating arms (epicycles). 2 = a simple looping curve; '
                + 'more arms layer harmonics into richer, more intricate roulettes.' }),
  freqSpread: z.number().int().min(1).max(8).default(4)
    .meta({ section: 'Arms', ui: 'slider', min: 1, max: 8, step: 1, label: 'Harmonic range',
            help: 'Largest whole-number turn speed an arm can take (± multiples of the base). '
                + 'Wide = busier, more intricate curves; low = gentle, rounded ones.' }),
  radiusDecay: z.number().min(0.3).max(0.92).default(0.55)
    .meta({ section: 'Arms', ui: 'slider', min: 0.3, max: 0.92, step: 0.02, label: 'Radius falloff',
            help: 'How quickly each successive arm shrinks relative to the one it rides on. '
                + 'Low = one dominant circle with fine detail; high = similar-sized arms, busier curves.' }),
  showArms: z.boolean().default(true)
    .meta({ section: 'Arms', ui: 'toggle', label: 'Show construction',
            help: 'Draw the faint rotating circles and arms that generate the curve — the '
                + 'Ptolemaic machinery behind the pen.' }),

  // ─── Motion ──────────────────────────────────────────────────────────────────
  traceSpeed: z.number().min(0.03).max(0.6).default(0.12)
    .meta({ section: 'Motion', ui: 'slider', min: 0.03, max: 0.6, step: 0.01, label: 'Trace speed',
            help: 'Revolutions per second the arms complete. One revolution draws the whole '
                + 'closed curve. Low and slow is the calm default. Frame-rate independent.' }),

  // ─── Style ───────────────────────────────────────────────────────────────────
  lineWidth: z.number().min(0.5).max(3).default(1.4)
    .meta({ section: 'Style', ui: 'slider', min: 0.5, max: 3, step: 0.1, label: 'Line width',
            help: 'Thickness of the bright core stroke, in pixels. Thin reads as a luminous thread.' }),
  glow: z.number().min(0).max(0.4).default(0.16)
    .meta({ section: 'Style', ui: 'slider', min: 0, max: 0.4, step: 0.01, label: 'Glow',
            help: 'Opacity of the soft halo drawn under the core, giving the traced curve a gentle '
                + 'bloom. 0 = a plain hairline.' }),

  // ─── Color ───────────────────────────────────────────────────────────────────
  colorMode: z.enum(['spectrum', 'palette']).default('spectrum')
    .meta({ section: 'Color', ui: 'segmented', options: ['spectrum', 'palette'], label: 'Color mode',
            help: 'Spectrum: hue sweeps smoothly along the curve as the pen winds. Palette: the '
                + 'curve blends through your own list of colors.' }),
  hueSpread: z.number().min(0).max(360).default(200)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 360, step: 10, label: 'Hue spread',
            showWhen: { field: 'colorMode', equals: 'spectrum' },
            help: 'Degrees of hue swept from the start of the curve to its close.' }),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8)
    .default(['#7cf9ffff', '#4d7bffff', '#c77dffff', '#ff7ad9ff'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Colors', min: 2, max: 8,
            showWhen: { field: 'colorMode', equals: 'palette' },
            help: 'The curve blends through these in order as the pen traces it.' }),
  background: hex6.default('#05060e')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The dark ground the luminous curve is drawn on. Err toward deep and low-key.' }),

  // ─── Advanced ────────────────────────────────────────────────────────────────
  holdSeconds: z.number().min(0).max(8).default(2.5)
    .meta({ section: 'Advanced', ui: 'slider', min: 0, max: 8, step: 0.5, label: 'Hold',
            help: 'How long the finished curve rests, fully drawn, before it fades and a fresh '
                + 'set of arms is seeded.' }),
  fadeTime: z.number().min(1).max(8).default(3)
    .meta({ section: 'Advanced', ui: 'slider', min: 1, max: 8, step: 0.5, label: 'Fade time',
            help: 'Seconds the finished curve takes to fade out before the next one begins.' }),
  seed: z.number().int().default(7361)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed regenerates the same sequence of curves. A fresh '
                + 'visit rolls a new one.' }),
})

export type EpicycleConfig = z.infer<typeof epicycleSchema>
