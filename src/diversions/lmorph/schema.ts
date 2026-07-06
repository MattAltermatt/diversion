import { z } from 'zod'

// lmorph — a single luminous closed curve that fluidly MORPHS between a cycle of
// elegant parametric shapes (circle → star → flower → gear → superellipse → heart
// → polygon), easing forever. Every shape is a radial r(θ) sampled at the SAME
// angles, so the morph interpolates radius-per-angle and can never scramble. One
// Zod object is the single source of truth for the form, the URL codec, and the
// Config type; every field carries .meta({ ui, label, ... }) and sliders always
// carry min+max+step. Clean-room take on xscreensaver `lmorph` (GH #64).
const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const lmorphSchema = z.object({
  // ─── Shape ─────────────────────────────────────────────────────────────────
  shapes: z.number().int().min(2).max(7).default(6)
    .meta({ section: 'Shape', ui: 'slider', min: 2, max: 7, step: 1, label: 'Shapes in cycle',
            help: 'How many distinct shapes the curve morphs through before the cycle repeats. '
                + 'The set (and each shape’s details) is chosen from the Seed.' }),
  points: z.number().int().min(90).max(1440).default(540)
    .meta({ section: 'Shape', ui: 'slider', min: 90, max: 1440, step: 30, label: 'Resolution',
            help: 'Number of points sampled around the outline. Higher = smoother curves and '
                + 'crisper corners; lower is lighter and a touch more faceted.' }),

  // ─── Motion ──────────────────────────────────────────────────────────────────
  morphSpeed: z.number().min(0.1).max(2).default(0.4)
    .meta({ section: 'Motion', ui: 'slider', min: 0.1, max: 2, step: 0.05, label: 'Morph speed',
            help: 'How fast one shape melts into the next (transitions per second). Low = slow, '
                + 'hypnotic morphs. Frame-rate independent.' }),
  holdTime: z.number().min(0).max(6).default(1.4)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 6, step: 0.1, label: 'Hold',
            help: 'Seconds the curve rests fully formed on each shape before it begins morphing '
                + 'to the next.' }),
  spin: z.number().min(0).max(30).default(5)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 30, step: 1, label: 'Spin',
            help: 'Gentle rotation of the whole figure, in degrees per second. 0 = still. A slow '
                + 'spin adds to the hypnotic drift.' }),

  // ─── Style ─────────────────────────────────────────────────────────────────
  lineWidth: z.number().min(0.6).max(4).default(1.6)
    .meta({ section: 'Style', ui: 'slider', min: 0.6, max: 4, step: 0.1, label: 'Line width',
            help: 'Thickness of the bright core stroke, in pixels.' }),
  glow: z.number().min(0).max(1).default(0.4)
    .meta({ section: 'Style', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Glow',
            help: 'Soft luminous halo drawn under the core (an opaque core keeps the color from '
                + 'blowing out). 0 = a clean hairline.' }),
  ghostTrails: z.number().min(0).max(1).default(0.25)
    .meta({ section: 'Style', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Ghost trails',
            help: 'How long faint ghosts of recent outlines linger, tracing a soft ribbon behind '
                + 'the morph. 0 = crisp single outline; high = long, dreamy trails.' }),

  // ─── Color ───────────────────────────────────────────────────────────────────
  colorMode: z.enum(['spectrum', 'palette']).default('spectrum')
    .meta({ section: 'Color', ui: 'segmented', options: ['spectrum', 'palette'], label: 'Color by',
            help: 'spectrum: hue sweeps around the outline and slowly cycles over time · '
                + 'palette: the outline blends through your own list of colors, drifting slowly.' }),
  colorCycleSpeed: z.number().min(0).max(1).default(0.25)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Color cycle',
            help: 'How fast the color drifts over time. 0 = fixed color. Keeps a long session '
                + 'gently evolving.' }),
  hueSpread: z.number().min(0).max(360).default(60)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 360, step: 5, label: 'Hue spread',
            showWhen: { field: 'colorMode', equals: 'spectrum' },
            help: 'Degrees of hue swept around the outline. 0 = one solid, slowly-cycling color; '
                + '360 = a full rainbow wrapped around the curve.' }),
  palette: z.array(hex6).min(1).max(8)
    .default(['#7cf9ff', '#4d7bff', '#c77dff', '#ff7ad9', '#ffd166'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 1, max: 8,
            showWhen: { field: 'colorMode', equals: 'palette' },
            help: 'The outline blends through these colors in order, the offset drifting over time.' }),
  background: hex6.default('#05070d')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The dark ground the luminous curve is drawn on. Err toward deep and low-key.' }),

  // ─── Advanced ────────────────────────────────────────────────────────────────
  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Picks which shapes are in the cycle, their order, and each one’s '
                + 'details. The same seed replays the same sequence; a fresh visit rolls a new one.' }),
})

export type LmorphConfig = z.infer<typeof lmorphSchema>
