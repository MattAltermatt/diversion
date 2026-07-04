import { z } from 'zod'

// Halftone: a handful of invisible "gravity" point-masses orbit slowly beneath the
// surface; the scalar potential field Σ strengthᵢ / distance is rendered as a
// newsprint HALFTONE screen — a regular grid of dots whose radius swells with the
// local field. Moving masses show up as flowing clusters of big dots thinning to
// tiny ones far away. One Zod object is the single source of truth for the form,
// the URL codec, and the Config type. Every field carries .meta({ ui, label, ... });
// sliders always carry min+max+step.
const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const halftoneSchema = z.object({
  // ─── Field ───────────────────────────────────────────────────────────────────
  massCount: z.number().int().min(2).max(8).default(5)
    .meta({ section: 'Field', ui: 'slider', min: 2, max: 8, step: 1, label: 'Masses',
            help: 'How many invisible point-masses orbit beneath the dots. '
                + 'More = busier, more overlapping swells.' }),
  massStrength: z.number().min(0.05).max(0.6).default(0.22)
    .meta({ section: 'Field', ui: 'slider', min: 0.05, max: 0.6, step: 0.01, label: 'Mass strength',
            help: 'How strongly each mass swells the dots around it. Higher = fatter, '
                + 'more dramatic clusters.' }),
  spread: z.number().min(0.05).max(0.6).default(0.22)
    .meta({ section: 'Field', ui: 'slider', min: 0.05, max: 0.6, step: 0.01, label: 'Spread',
            help: 'How far each mass’s influence reaches (field softening). Small = tight, '
                + 'sharp knots of big dots; large = broad, gentle swells.' }),
  speed: z.number().min(0).max(2).default(0.5)
    .meta({ section: 'Field', ui: 'slider', min: 0, max: 2, step: 0.01, label: 'Orbit speed',
            help: 'Pace of the orbiting masses. Low is meditative; 0 = frozen. '
                + 'Frame-rate independent.' }),

  // ─── Grid ────────────────────────────────────────────────────────────────────
  gridDensity: z.number().int().min(12).max(90).default(40)
    .meta({ section: 'Grid', ui: 'slider', min: 12, max: 90, step: 1, label: 'Dot density',
            help: 'Dots across the short dimension of the screen. Higher = finer, '
                + 'more newsprint-like; lower = big bold comic dots.' }),
  maxDotSize: z.number().min(0.4).max(1.5).default(1.05)
    .meta({ section: 'Grid', ui: 'slider', min: 0.4, max: 1.5, step: 0.01, label: 'Max dot size',
            help: 'Largest dot as a fraction of its cell. Above 1 lets neighbouring big '
                + 'dots touch and merge into solid ink at the field peaks.' }),

  // ─── Color ───────────────────────────────────────────────────────────────────
  colorMode: z.enum(['ink', 'tinted']).default('ink')
    .meta({ section: 'Color', ui: 'segmented', options: ['ink', 'tinted'], label: 'Color by',
            help: 'ink: single-colour dots, classic black-on-white newsprint. '
                + 'tinted: dots shift colour with the field — cool where weak, hot at the peaks.' }),
  inkColor: hex6.default('#14171c')
    .meta({ section: 'Color', ui: 'color', label: 'Ink', showWhen: { field: 'colorMode', equals: 'ink' },
            help: 'The single dot colour in ink mode.' }),
  tintLow: hex6.default('#1b2a6b')
    .meta({ section: 'Color', ui: 'color', label: 'Weak-field tint',
            showWhen: { field: 'colorMode', equals: 'tinted' },
            help: 'Colour of the small dots far from any mass (low field).' }),
  tintHigh: hex6.default('#ff3b6b')
    .meta({ section: 'Color', ui: 'color', label: 'Strong-field tint',
            showWhen: { field: 'colorMode', equals: 'tinted' },
            help: 'Colour of the big dots at the field peaks (near a mass).' }),
  background: hex6.default('#f4f1ea')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The paper colour behind the dots. Off-white gives newsprint energy; '
                + 'a dark ground flips it to glowing dots.' }),

  // ─── Advanced ────────────────────────────────────────────────────────────────
  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed always regenerates the same orbits. '
                + 'A fresh visit rolls a new one.' }),
})

export type HalftoneConfig = z.infer<typeof halftoneSchema>
